import type { LifeConsoleRepository } from "@api/repositories/life-console-repository";
import type { StravaApiRepository, StravaConfiguration, StravaRateLimitUsage } from "@api/repositories/strava-api-repository";
import type { StravaCaloriesRepository } from "@api/repositories/strava-calories-repository";
import type { StravaConnectionRepository, StravaCredentials } from "@api/repositories/strava-connection-repository";
import type { Clock } from "@api/shared/clock";
import type { IdGenerator } from "@api/shared/id-generator";
import type {
  StravaActivity, StravaActivityCalories, StravaActivityPage, StravaActivityQuery, StravaCaloriesFetchInput,
  StravaCaloriesFetchResult, StravaCaloriesPlanInput, StravaCaloriesPlanResult, StravaCaloriesReconcileInput,
  StravaCaloriesReconcileResult, StravaCaloriesSyncStatus, StravaStatus,
} from "@life-console/contracts";
import { weightCalendarDate } from "@life-console/contracts";
import { err, ok, type Result } from "@life-console/core";

import { appError, type AppError } from "../shared/app-error";

/** 1 回の fetch で詳細を取得する活動数。Worker の 1 リクエストあたりの subrequest 上限と CPU 時間に収める。 */
const CALORIES_FETCH_BATCH = 10;
/** 一覧取得と詳細取得で同じ予算を使うため、Strava の上限より手前で中断する割合。 */
const FIFTEEN_MINUTE_PAUSE_RATIO = 0.8;
const DAILY_PAUSE_RATIO = 0.9;
const QUARTER_HOUR_MILLISECONDS = 900_000;
const ONE_DAY_MILLISECONDS = 86_400_000;
/** 定期同期が毎回突き合わせる範囲。 */
const RECENT_SYNC_DAYS = 30;
/** 初回の遡りを 1 チャンクで進める日数。 */
const BACKFILL_CHUNK_DAYS = 90;
/** 遡りの下限。Strava の提供開始年の元日より前に活動は存在しない。 */
const BACKFILL_FLOOR_DATE = "2009-01-01";

const shiftDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * ONE_DAY_MILLISECONDS).toISOString().slice(0, 10);

// Strava の 15 分枠は毎時 0・15・30・45 分に戻るため、次の境界までを待ち時間にする。
const secondsToNextQuarterHour = (now: Date): number => Math.ceil(
  ((Math.floor(now.getTime() / QUARTER_HOUR_MILLISECONDS) + 1) * QUARTER_HOUR_MILLISECONDS - now.getTime()) / 1000,
);

export const createStravaUsecase = (
  connections: StravaConnectionRepository,
  upstream: StravaApiRepository,
  caloriesStore: StravaCaloriesRepository,
  jobs: LifeConsoleRepository,
  configuration: StravaConfiguration,
  clock: Clock,
  ids: IdGenerator,
) => {
  const withLease = async <T>(operation: (lease: string) => Promise<Result<T, AppError>>): Promise<Result<T, AppError>> => {
    const lease = ids.create();
    const claimed = await connections.claim(lease, clock.now().getTime());
    if (!claimed.ok) return claimed;
    if (!claimed.value) return err(appError.conflict("Strava の接続を更新中です。少し待って再試行してください。"));
    const result = await operation(lease);
    const released = await connections.release(lease);
    return released.ok ? result : released;
  };
  const refreshIfNeeded = async (): Promise<Result<StravaCredentials, AppError>> => {
    const current = await connections.read();
    if (!current.ok) return current;
    if (current.value === null) return err(appError.conflict("Strava に接続してください。"));
    if (current.value.expiresAt > clock.now().getTime() / 1000 + 60) return ok(current.value);
    return withLease(async (lease) => {
      const latest = await connections.read();
      if (!latest.ok) return latest;
      if (latest.value === null) return err(appError.conflict("Strava に接続してください。"));
      if (latest.value.expiresAt > clock.now().getTime() / 1000 + 60) return ok(latest.value);
      const refreshed = await upstream.refresh(latest.value.refreshToken);
      if (!refreshed.ok) return refreshed;
      const credentials = { athleteId: latest.value.athleteId, accessToken: refreshed.value.access_token, refreshToken: refreshed.value.refresh_token, expiresAt: refreshed.value.expires_at };
      const saved = await connections.write(credentials, lease, clock.now().getTime());
      return saved.ok ? ok(credentials) : err({ ...saved.error, message: "更新した接続情報を保存できませんでした。Strava に再接続してください。" });
    });
  };
  /** Strava の使用率が閾値に達していれば、待つ秒数か日次の打ち切りを返す。一覧取得と詳細取得で同じ予算を見る。 */
  const pausedByRateLimit = (usage: StravaRateLimitUsage | null): { readonly retryAfterSeconds: number | null; readonly dailyLimitReached: boolean } => {
    if (usage === null) return { retryAfterSeconds: null, dailyLimitReached: false };
    if (usage.dailyRatio >= DAILY_PAUSE_RATIO) return { retryAfterSeconds: null, dailyLimitReached: true };
    if (usage.fifteenMinuteRatio >= FIFTEEN_MINUTE_PAUSE_RATIO) return { retryAfterSeconds: secondsToNextQuarterHour(clock.now()), dailyLimitReached: false };
    return { retryAfterSeconds: null, dailyLimitReached: false };
  };
  /** チャンクを読み終えたので次のチャンクへ進める。下限を越えたら遡りを完了にする。 */
  const advanceBackfillChunk = (chunkFrom: string, chunkTo: string): Promise<Result<void, AppError>> => {
    const now = clock.now().toISOString();
    const next = shiftDays(chunkFrom, -1);
    return next < BACKFILL_FLOOR_DATE ? caloriesStore.completeBackfill(chunkTo, now) : caloriesStore.advanceBackfill(chunkTo, next, now);
  };
  const requireJobExecution = async (jobId: string, leaseToken: string): Promise<Result<{ readonly startedAt: string }, AppError>> => {
    const execution = await jobs.findRunningJobExecution(jobId, leaseToken, "strava_calories_sync", clock.now().toISOString());
    if (!execution.ok) return execution;
    return execution.value === null ? err(appError.invalidLease()) : ok(execution.value);
  };
  const registerOrTouch = (activities: ReadonlyArray<StravaActivity>): Promise<Result<number, AppError>> => caloriesStore.registerOrTouch(activities, clock.now().toISOString());
  return {
    async status(): Promise<Result<StravaStatus, AppError>> {
      const current = await connections.read();
      return current.ok ? ok({ configured: true, athleteId: current.value?.athleteId ?? null }) : current;
    },
    authorizationUrl(state: string): Result<string, AppError> {
      const query = new URLSearchParams({ client_id: configuration.clientId, redirect_uri: configuration.redirectUri, response_type: "code", approval_prompt: "force", scope: "activity:read_all", state });
      return ok(`https://www.strava.com/oauth/authorize?${query}`);
    },
    connect(code: string, scope: string): Promise<Result<void, AppError>> {
      if (!scope.split(/[ ,]+/u).includes("activity:read_all")) return Promise.resolve(err(appError.validation("非公開の運動も読み取る権限を許可してください。")));
      return withLease(async (lease) => {
        const authorized = await upstream.authorize(code);
        if (!authorized.ok) return authorized;
        if (authorized.value.scope !== undefined && !authorized.value.scope.split(/[ ,]+/u).includes("activity:read_all")) {
          return err(appError.validation("非公開の運動も読み取る権限を許可してください。"));
        }
        return connections.write({ athleteId: authorized.value.athlete.id, accessToken: authorized.value.access_token, refreshToken: authorized.value.refresh_token, expiresAt: authorized.value.expires_at }, lease, clock.now().getTime());
      });
    },
    activities(input: StravaActivityQuery): Promise<Result<StravaActivityPage, AppError>> {
      return caloriesStore.listActivities(input);
    },
    async requestSync(input: { readonly from: string; readonly to: string }): Promise<Result<void, AppError>> {
      const current = await connections.read();
      if (!current.ok) return current;
      if (current.value === null) return err(appError.conflict("Strava に接続してください。"));
      const id = ids.create();
      return jobs.createJobUnlessActive({
        id, kind: "strava_calories_sync", idempotencyKey: `strava-calories:${id}`,
        payloadJson: JSON.stringify(input), now: clock.now().toISOString(),
      });
    },
    activityCalories(input: { readonly from: string; readonly to: string }): Promise<Result<ReadonlyArray<StravaActivityCalories>, AppError>> {
      return caloriesStore.listByPeriod(input.from, input.to);
    },
    async syncStatus(): Promise<Result<StravaCaloriesSyncStatus, AppError>> {
      const lastJob = await jobs.findLatestJob("strava_calories_sync");
      if (!lastJob.ok) return lastJob;
      const backfill = await caloriesStore.readBackfill();
      return backfill.ok ? ok({ lastJob: lastJob.value, backfill: backfill.value === null || !backfill.value.includesActivities ? null : { cursorTo: backfill.value.cursorTo, completedAt: backfill.value.completedAt } }) : backfill;
    },
    /**
     * 同期の窓を API の時計で決める。runner の時計や入力に日付を持たせない。
     * `recent` はジョブ開始日を終端とする直近 30 日、`backfill` は次に遡るチャンク（完了なら null）。
     */
    async planCalories(input: StravaCaloriesPlanInput): Promise<Result<StravaCaloriesPlanResult, AppError>> {
      const execution = await requireJobExecution(input.jobId, input.leaseToken);
      if (!execution.ok) return execution;
      const connection = await connections.read();
      if (!connection.ok) return connection;
      // 未接続で 2 時間ごとに failed を積まないよう、見送りとして返す。
      if (connection.value === null) return err(appError.skippedPrecondition("Strava に接続していないため、消費カロリーの同期を見送りました。"));
      const recentTo = weightCalendarDate(execution.value.startedAt);
      const recentFrom = shiftDays(recentTo, -(RECENT_SYNC_DAYS - 1));
      if (input.phase === "recent") return ok({ from: recentFrom, to: recentTo });
      const progress = await caloriesStore.readBackfill();
      if (!progress.ok) return progress;
      const started = progress.value === null || !progress.value.includesActivities
        ? await caloriesStore.startBackfill(shiftDays(recentFrom, -1), clock.now().toISOString())
        : ok(progress.value);
      if (!started.ok) return started;
      if (started.value.completedAt !== null) return ok(null);
      const chunkFrom = shiftDays(started.value.cursorTo, -(BACKFILL_CHUNK_DAYS - 1));
      return ok({ from: chunkFrom < BACKFILL_FLOOR_DATE ? BACKFILL_FLOOR_DATE : chunkFrom, to: started.value.cursorTo });
    },
    async reconcileCalories(input: StravaCaloriesReconcileInput): Promise<Result<StravaCaloriesReconcileResult, AppError>> {
      const execution = await requireJobExecution(input.jobId, input.leaseToken);
      if (!execution.ok) return execution;
      if (input.backfill) {
        // 遡りの窓は状態行が正。古い窓のまま進めると未読の期間を飛ばす。
        const progress = await caloriesStore.readBackfill();
        if (!progress.ok) return progress;
        if (progress.value === null || progress.value.completedAt !== null || progress.value.cursorTo !== input.to) {
          return err(appError.conflict("遡りの対象期間が変わりました。次の同期でやり直します。"));
        }
      }
      const credentials = await refreshIfNeeded();
      if (!credentials.ok) return credentials;
      const page = await upstream.activities(credentials.value.accessToken, { from: input.from, to: input.to, page: input.page });
      // 一覧の取得に失敗したら登録も削除もしない。取得失敗を活動が消えた根拠にしない。
      if (!page.ok) return page;
      const registered = await registerOrTouch(page.value.activities);
      if (!registered.ok) return registered;
      // 一覧のページングも詳細取得と同じ読み取り予算を使うので、同じ閾値で中断する。
      const paused = pausedByRateLimit(page.value.rateLimit);
      if (page.value.nextPage !== null) return ok({ nextPage: page.value.nextPage, registered: registered.value, deleted: 0, ...paused });
      // 全ページを読み終えた時点で、このジョブが一度も見なかった行が Strava 側で削除された活動。
      const deleted = await caloriesStore.deleteUnseen(input.from, input.to, execution.value.startedAt);
      if (!deleted.ok) return deleted;
      // 進捗は最終ページでだけ進める。途中で切れたチャンクは次の同期が最初からやり直す。
      const advanced = input.backfill ? await advanceBackfillChunk(input.from, input.to) : ok(undefined);
      return advanced.ok ? ok({ nextPage: null, registered: registered.value, deleted: deleted.value, ...paused }) : advanced;
    },
    async fetchCalories(input: StravaCaloriesFetchInput): Promise<Result<StravaCaloriesFetchResult, AppError>> {
      const authorized = await requireJobExecution(input.jobId, input.leaseToken);
      if (!authorized.ok) return authorized;
      const targets = await caloriesStore.listPendingActivityIds(CALORIES_FETCH_BATCH);
      if (!targets.ok) return targets;
      const totals = { fetched: 0, unavailable: 0, deleted: 0, failed: 0 };
      let retryAfterSeconds: number | null = null;
      let dailyLimitReached = false;
      if (targets.value.length > 0) {
        const credentials = await refreshIfNeeded();
        if (!credentials.ok) return credentials;
        for (const activityId of targets.value) {
          const detail = await upstream.activityDetail(credentials.value.accessToken, activityId);
          const now = clock.now();
          if (!detail.ok) {
            // 429 を受けた行は pending のまま残し、失敗に数えずに次の 15 分枠へ持ち越す。
            if (detail.error.code === "rate_limited") {
              retryAfterSeconds = secondsToNextQuarterHour(now);
              break;
            }
            if (detail.error.code !== "not_found") {
              totals.failed += 1;
              continue;
            }
            const removed = await caloriesStore.deleteActivity(activityId);
            if (!removed.ok) return removed;
            totals.deleted += 1;
            continue;
          }
          const saved = detail.value.caloriesKcal === null
            ? await caloriesStore.markUnavailable(activityId, now.toISOString())
            : await caloriesStore.saveMeasured(activityId, detail.value.caloriesKcal, now.toISOString());
          if (!saved.ok) return saved;
          if (detail.value.caloriesKcal === null) totals.unavailable += 1;
          else totals.fetched += 1;
          const paused = pausedByRateLimit(detail.value.rateLimit);
          if (paused.dailyLimitReached || paused.retryAfterSeconds !== null) {
            dailyLimitReached = paused.dailyLimitReached;
            retryAfterSeconds = paused.retryAfterSeconds;
            break;
          }
        }
      }
      const remaining = await caloriesStore.countPending();
      if (!remaining.ok) return remaining;
      return ok({ ...totals, remaining: remaining.value, retryAfterSeconds, dailyLimitReached });
    },
    disconnect(): Promise<Result<void, AppError>> {
      return withLease(async (lease) => {
        const current = await connections.read();
        if (!current.ok) return current;
        if (current.value === null) return ok(undefined);
        const revoked = await upstream.revoke(current.value.refreshToken);
        if (!revoked.ok) return revoked;
        const cleared = await connections.write(null, lease, clock.now().getTime());
        if (!cleared.ok) return cleared;
        // 遡りの状態も消す。再接続後は保存行がないので初回からやり直す。
        const removed = await caloriesStore.deleteAll();
        return removed.ok ? caloriesStore.deleteBackfill() : removed;
      });
    },
  };
};
