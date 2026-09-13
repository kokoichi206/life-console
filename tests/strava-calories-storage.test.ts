import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "../apps/api/src/app";
import { createStravaConnectionRepository } from "../apps/api/src/repositories/strava-connection-repository";

import { createJobStorage } from "./support/d1-storage";

const credentials = { athleteId: 42, accessToken: "test-access", refreshToken: "test-refresh", expiresAt: 4_000_000_000 };
const settings = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", STRAVA_CLIENT_ID: "123", STRAVA_CLIENT_SECRET: "test-client-secret", STRAVA_TOKEN_KEY: "ab".repeat(32), STRAVA_REDIRECT_URI: "http://localhost/api/v1/strava/callback" };
const runnerHeaders = { "Authorization": "Bearer local-runner-token", "Content-Type": "application/json" };
const leaseToken = "11111111-1111-4111-8111-111111111111";
const period = { from: "2026-09-07", to: "2026-09-13" };
const distantFuture = "2099-01-01T00:00:00.000Z";

type Storage = ReturnType<typeof createJobStorage>;

const activity = (id: string, occurredAt: string) => ({
  id: Number(id), name: "架空の運動", sport_type: "Run", start_date: occurredAt, distance: 5000, moving_time: 1800, elapsed_time: 2000,
});

/** 一覧は 1 ページ目だけ返し、詳細は id ごとの応答を引く架空の Strava。 */
const stubStrava = (options: {
  readonly activities?: ReadonlyArray<ReturnType<typeof activity>>;
  readonly listStatus?: number;
  readonly listUsage?: string;
  readonly revokeStatus?: number;
  readonly detail?: (id: string) => Response;
}) => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === "/oauth/revoke") return new Response(null, { status: options.revokeStatus ?? 200 });
    if (url.pathname === "/api/v3/athlete/activities") {
      if (options.listStatus !== undefined) return new Response("upstream failure", { status: options.listStatus });
      return Response.json(url.searchParams.get("page") === "1" ? options.activities ?? [] : [], {
        headers: options.listUsage === undefined ? {} : { "X-ReadRateLimit-Limit": "100,1000", "X-ReadRateLimit-Usage": options.listUsage },
      });
    }
    return options.detail!(url.pathname.replace("/api/v3/activities/", ""));
  });
  vi.stubGlobal("fetch", fetcher);
  return calls;
};

const detailResponse = (body: Record<string, unknown>, usage = "1,1", limit = "100,1000") => Response.json(body, {
  headers: { "X-ReadRateLimit-Limit": limit, "X-ReadRateLimit-Usage": usage },
});

const connect = async ({ binding }: Storage) => {
  const connection = createStravaConnectionRepository(binding, settings.STRAVA_TOKEN_KEY);
  await connection.claim("setup", Date.now());
  await connection.write(credentials, "setup", Date.now());
  await connection.release("setup");
};

/** 予約済みの同期ジョブを runner が実行している状態にする。 */
const startSyncJob = async ({ repository }: Storage, jobId: string) => {
  const claimed = await repository.claimJob("test-runner", leaseToken, distantFuture, new Date().toISOString());
  expect(claimed).toMatchObject({ ok: true, value: { id: jobId } });
  expect(await repository.heartbeatJob(jobId, { runnerId: "test-runner", leaseToken, waitingForUser: false, progressSummary: null }, distantFuture, new Date().toISOString())).toMatchObject({ ok: true });
};

const environmentFor = (storage: Storage) => ({ ...settings, DB: storage.binding });
const listActivities = (storage: Storage, page = 1) => app.request(`/api/v1/strava/activities?from=${period.from}&to=${period.to}&page=${String(page)}`, {}, environmentFor(storage));
const reconcile = (storage: Storage, jobId: string, page = 1) => app.request("/api/v1/runner/strava/calories/reconcile", {
  method: "POST", headers: runnerHeaders, body: JSON.stringify({ jobId, leaseToken, ...period, page }),
}, environmentFor(storage));
const fetchCalories = (storage: Storage, jobId: string, token = leaseToken) => app.request("/api/v1/runner/strava/calories/fetch", {
  method: "POST", headers: runnerHeaders, body: JSON.stringify({ jobId, leaseToken: token }),
}, environmentFor(storage));
const storedCalories = (storage: Storage) => app.request(`/api/v1/strava/calories?from=${period.from}&to=${period.to}`, {}, environmentFor(storage));
const jobIds = ({ database }: Storage) => database.prepare("SELECT id FROM jobs WHERE kind = 'strava_calories_sync' ORDER BY created_at").all().map((row) => String(row.id));
const storedRows = ({ database }: Storage) => database.prepare("SELECT activity_id, status, calories_kcal FROM strava_activity_calories ORDER BY occurred_at DESC").all();
const seenAt = ({ database }: Storage, activityId: string) => String(database.prepare("SELECT seen_at FROM strava_activity_calories WHERE activity_id = ?").get(activityId)!.seen_at);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Strava の消費カロリーの保存と同期", () => {
  it("一覧の取得で保存行のない活動を pending 登録し、同期ジョブを 1 件だけ予約する", async () => {
    const storage = createJobStorage();
    stubStrava({ activities: [activity("1", "2026-09-07T00:00:00Z"), activity("2", "2026-09-08T00:00:00Z")] });
    try {
      await connect(storage);
      expect((await listActivities(storage)).status).toBe(200);
      expect(storedRows(storage)).toEqual([
        { activity_id: "2", status: "pending", calories_kcal: null },
        { activity_id: "1", status: "pending", calories_kcal: null },
      ]);
      expect(jobIds(storage)).toHaveLength(1);
      expect((await listActivities(storage, 2)).status).toBe(200);
      expect((await listActivities(storage)).status).toBe(200);
      expect(jobIds(storage)).toHaveLength(1);
    } finally { storage.database.close(); }
  });

  it("取得待ちが残っていなければ同期ジョブを予約しない", async () => {
    const storage = createJobStorage();
    stubStrava({ activities: [] });
    try {
      await connect(storage);
      expect((await listActivities(storage)).status).toBe(200);
      expect(storedRows(storage)).toEqual([]);
      expect(jobIds(storage)).toEqual([]);
    } finally { storage.database.close(); }
  });

  it("一覧の再取得は行を増やさず seen_at だけ進める", async () => {
    const storage = createJobStorage();
    stubStrava({ activities: [activity("1", "2026-09-07T00:00:00Z")] });
    try {
      await connect(storage);
      await listActivities(storage);
      const first = seenAt(storage, "1");
      await new Promise((resolve) => setTimeout(resolve, 5));
      await listActivities(storage);
      expect(storedRows(storage)).toHaveLength(1);
      expect(seenAt(storage, "1") > first).toBe(true);
    } finally { storage.database.close(); }
  });

  it("reconcile はページごとに登録し、空ページで今回の一覧に現れなかった行を消す", async () => {
    const storage = createJobStorage();
    stubStrava({ activities: [activity("2", "2026-09-08T00:00:00Z")] });
    try {
      await connect(storage);
      // Strava 側で削除済みの活動を、このジョブより前に登録された行として置く。期間外の行は同じ古さでも残る。
      storage.database.prepare("INSERT INTO strava_activity_calories (activity_id, occurred_at, status, calories_kcal, registered_at, seen_at, fetched_at) VALUES ('1', '2026-09-07T00:00:00Z', 'measured', 300, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')").run();
      storage.database.prepare("INSERT INTO strava_activity_calories (activity_id, occurred_at, status, calories_kcal, registered_at, seen_at, fetched_at) VALUES ('outside', '2026-09-30T00:00:00Z', 'measured', 400, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')").run();
      expect(await storage.repository.createJobUnlessActive({ id: "sync-job", kind: "strava_calories_sync", idempotencyKey: "sync-job", payloadJson: JSON.stringify(period), now: new Date().toISOString() })).toMatchObject({ ok: true });
      await startSyncJob(storage, "sync-job");
      expect(await (await reconcile(storage, "sync-job", 1)).json()).toEqual({ data: { nextPage: 2, registered: 1, deleted: 0, retryAfterSeconds: null, dailyLimitReached: false } });
      expect(storedRows(storage)).toHaveLength(3);
      expect(await (await reconcile(storage, "sync-job", 2)).json()).toEqual({ data: { nextPage: null, registered: 0, deleted: 1, retryAfterSeconds: null, dailyLimitReached: false } });
      // 期間内の消えた活動だけを消し、期間外の行は巻き込まない。
      expect(storedRows(storage)).toEqual([
        { activity_id: "outside", status: "measured", calories_kcal: 400 },
        { activity_id: "2", status: "pending", calories_kcal: null },
      ]);
    } finally { storage.database.close(); }
  });

  it("一覧のページングでも使用量の閾値に達したら中断を知らせる", async () => {
    const storage = createJobStorage();
    stubStrava({ activities: [activity("1", "2026-09-07T00:00:00Z")], listUsage: "85,1" });
    try {
      await connect(storage);
      expect(await storage.repository.createJobUnlessActive({ id: "sync-job", kind: "strava_calories_sync", idempotencyKey: "sync-job", payloadJson: JSON.stringify(period), now: new Date().toISOString() })).toMatchObject({ ok: true });
      await startSyncJob(storage, "sync-job");
      const paused = await (await reconcile(storage, "sync-job", 1)).json() as { data: { nextPage: number; retryAfterSeconds: number; dailyLimitReached: boolean } };
      expect(paused.data).toMatchObject({ nextPage: 2, dailyLimitReached: false });
      expect(paused.data.retryAfterSeconds).toBeGreaterThan(0);
      expect(storedRows(storage)).toHaveLength(1);
    } finally { storage.database.close(); }
  });

  it("一覧のページングで日次の閾値に達したら打ち切りを知らせる", async () => {
    const storage = createJobStorage();
    stubStrava({ activities: [activity("1", "2026-09-07T00:00:00Z")], listUsage: "1,950" });
    try {
      await connect(storage);
      expect(await storage.repository.createJobUnlessActive({ id: "sync-job", kind: "strava_calories_sync", idempotencyKey: "sync-job", payloadJson: JSON.stringify(period), now: new Date().toISOString() })).toMatchObject({ ok: true });
      await startSyncJob(storage, "sync-job");
      expect(await (await reconcile(storage, "sync-job", 1)).json()).toMatchObject({ data: { dailyLimitReached: true, retryAfterSeconds: null } });
    } finally { storage.database.close(); }
  });

  it("一覧の取得に失敗した reconcile は削除も登録もしない", async () => {
    const storage = createJobStorage();
    stubStrava({ activities: [activity("1", "2026-09-07T00:00:00Z")] });
    try {
      await connect(storage);
      await listActivities(storage);
      const jobId = jobIds(storage)[0]!;
      await startSyncJob(storage, jobId);
      vi.unstubAllGlobals();
      stubStrava({ listStatus: 503 });
      expect((await reconcile(storage, jobId)).status).toBe(502);
      expect(storedRows(storage)).toEqual([{ activity_id: "1", status: "pending", calories_kcal: null }]);
    } finally { storage.database.close(); }
  });

  it("fetch は取得待ちを新しい順に定数件だけ処理し、実測・算入外・削除を保存して再取得しない", async () => {
    const storage = createJobStorage();
    const activities = Array.from({ length: 12 }, (_, index) => activity(String(index + 1), `2026-09-07T${String(index).padStart(2, "0")}:00:00Z`));
    const calls = stubStrava({ activities, detail: (id) => {
      if (id === "12") return new Response(null, { status: 404 });
      if (id === "11") return detailResponse({ calories: 0, moving_time: 1800 });
      return detailResponse({ calories: 100 + Number(id), moving_time: 1800 });
    } });
    try {
      await connect(storage);
      await listActivities(storage);
      const jobId = jobIds(storage)[0]!;
      await startSyncJob(storage, jobId);
      const first = await (await fetchCalories(storage, jobId)).json() as { data: Record<string, unknown> };
      expect(first.data).toEqual({ fetched: 8, unavailable: 1, deleted: 1, failed: 0, remaining: 2, retryAfterSeconds: null, dailyLimitReached: false });
      const detailCalls = calls.filter((path) => path.startsWith("/api/v3/activities/"));
      expect(detailCalls).toEqual(["12", "11", "10", "9", "8", "7", "6", "5", "4", "3"].map((id) => `/api/v3/activities/${id}`));
      const second = await (await fetchCalories(storage, jobId)).json() as { data: Record<string, unknown> };
      expect(second.data).toMatchObject({ fetched: 2, unavailable: 0, deleted: 0, failed: 0, remaining: 0 });
      expect(calls.filter((path) => path === "/api/v3/activities/10")).toHaveLength(1);
      expect(storedRows(storage).filter((row) => row.status !== "measured")).toEqual([{ activity_id: "11", status: "unavailable", calories_kcal: null }]);
    } finally { storage.database.close(); }
  });

  it("429 は取得待ちのまま残し、失敗に数えず次の 15 分枠まで待つ秒数を返す", async () => {
    const storage = createJobStorage();
    stubStrava({ activities: [activity("1", "2026-09-07T00:00:00Z"), activity("2", "2026-09-08T00:00:00Z")], detail: () => new Response(null, { status: 429 }) });
    try {
      await connect(storage);
      await listActivities(storage);
      const jobId = jobIds(storage)[0]!;
      await startSyncJob(storage, jobId);
      const result = await (await fetchCalories(storage, jobId)).json() as { data: { failed: number; remaining: number; retryAfterSeconds: number } };
      expect(result.data).toMatchObject({ fetched: 0, failed: 0, remaining: 2 });
      expect(result.data.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.data.retryAfterSeconds).toBeLessThanOrEqual(900);
      expect(storedRows(storage).every((row) => row.status === "pending")).toBe(true);
    } finally { storage.database.close(); }
  });

  it("使用量が閾値に達したら中断し、日次なら 1 日の上限として知らせる", async () => {
    const storage = createJobStorage();
    stubStrava({
      activities: [activity("1", "2026-09-07T00:00:00Z"), activity("2", "2026-09-08T00:00:00Z"), activity("3", "2026-09-09T00:00:00Z")],
      detail: (id) => detailResponse({ calories: 300, moving_time: 1800 }, id === "3" ? "85,1" : "1,950"),
    });
    try {
      await connect(storage);
      await listActivities(storage);
      const jobId = jobIds(storage)[0]!;
      await startSyncJob(storage, jobId);
      const quarterHour = await (await fetchCalories(storage, jobId)).json() as { data: { fetched: number; retryAfterSeconds: number | null; dailyLimitReached: boolean } };
      expect(quarterHour.data.fetched).toBe(1);
      expect(quarterHour.data.dailyLimitReached).toBe(false);
      expect(quarterHour.data.retryAfterSeconds).not.toBeNull();
      const daily = await (await fetchCalories(storage, jobId)).json() as { data: { fetched: number; remaining: number; dailyLimitReached: boolean } };
      expect(daily.data).toMatchObject({ fetched: 1, remaining: 1, dailyLimitReached: true });
    } finally { storage.database.close(); }
  });

  it("lease が一致しない・running でない呼び出しは Strava を呼ばずに拒否する", async () => {
    const storage = createJobStorage();
    const calls = stubStrava({ activities: [activity("1", "2026-09-07T00:00:00Z")], detail: () => detailResponse({ calories: 300, moving_time: 1800 }) });
    try {
      await connect(storage);
      await listActivities(storage);
      const jobId = jobIds(storage)[0]!;
      const queued = await fetchCalories(storage, jobId);
      expect(queued.status).toBe(403);
      await startSyncJob(storage, jobId);
      expect((await fetchCalories(storage, jobId, "22222222-2222-4222-8222-222222222222")).status).toBe(403);
      expect((await reconcile(storage, "unknown-job")).status).toBe(403);
      expect(calls.filter((path) => path.startsWith("/api/v3/activities/"))).toEqual([]);
      expect(storedRows(storage)).toEqual([{ activity_id: "1", status: "pending", calories_kcal: null }]);
    } finally { storage.database.close(); }
  });

  it("保存済みの消費カロリーの読み取りは Strava を呼ばず、期間外の行を返さない", async () => {
    const storage = createJobStorage();
    const calls = stubStrava({ activities: [activity("1", "2026-09-07T00:00:00Z")], detail: () => detailResponse({ calories: 320, moving_time: 1800 }) });
    try {
      await connect(storage);
      await listActivities(storage);
      const jobId = jobIds(storage)[0]!;
      await startSyncJob(storage, jobId);
      await fetchCalories(storage, jobId);
      // 期間は +09:00 の暦日で切る。9/7 の始まりは 09-06T15:00:00Z、9/13 の終わりは 09-13T15:00:00Z の直前。
      for (const [activityId, occurredAt] of [["before", "2026-09-06T14:59:59.999Z"], ["first", "2026-09-06T15:00:00.000Z"], ["last", "2026-09-13T14:59:59.999Z"], ["after", "2026-09-13T15:00:00.000Z"]]) {
        storage.database.prepare("INSERT INTO strava_activity_calories (activity_id, occurred_at, status, calories_kcal, registered_at, seen_at, fetched_at) VALUES (?, ?, 'measured', 500, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')").run(activityId!, occurredAt!);
      }
      const before = calls.length;
      expect(await (await storedCalories(storage)).json()).toEqual({ data: [
        { activityId: "last", status: "measured", caloriesKcal: 500 },
        { activityId: "1", status: "measured", caloriesKcal: 320 },
        { activityId: "first", status: "measured", caloriesKcal: 500 },
      ] });
      expect(calls).toHaveLength(before);
    } finally { storage.database.close(); }
  });

  it("接続の解除は revoke に成功したときだけ保存済みの消費カロリーを消す", async () => {
    const storage = createJobStorage();
    stubStrava({ activities: [activity("1", "2026-09-07T00:00:00Z")], revokeStatus: 503 });
    const disconnect = () => app.request("/api/v1/strava/connection", { method: "DELETE", headers: { Origin: "http://localhost" } }, environmentFor(storage));
    try {
      await connect(storage);
      await listActivities(storage);
      expect(storedRows(storage)).toHaveLength(1);
      expect((await disconnect()).status).toBe(502);
      expect(storedRows(storage)).toHaveLength(1);
      vi.unstubAllGlobals();
      stubStrava({ activities: [] });
      expect((await disconnect()).status).toBe(200);
      expect(storedRows(storage)).toEqual([]);
    } finally { storage.database.close(); }
  });

  it("ジョブが完了した後の表示では、取得待ちが残っていれば再び予約する", async () => {
    const storage = createJobStorage();
    stubStrava({ activities: [activity("1", "2026-09-07T00:00:00Z")] });
    try {
      await connect(storage);
      await listActivities(storage);
      const jobId = jobIds(storage)[0]!;
      await startSyncJob(storage, jobId);
      expect(await storage.repository.completeJob(jobId, { runnerId: "test-runner", leaseToken, outcome: "succeeded", errorCode: null, summary: "1 日の上限で中断しました。" }, new Date().toISOString())).toMatchObject({ ok: true });
      await listActivities(storage);
      expect(jobIds(storage)).toHaveLength(2);
    } finally { storage.database.close(); }
  });
});
