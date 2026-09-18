import type { JobStatus, StravaCaloriesSyncStatus } from "@life-console/contracts";
import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { FormError, Panel } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { activeJobStatuses, jobStatusLabels } from "../../../features/jobs/JobProgress";
import { cn } from "../../../lib/class-names";
import { RECENT_BALANCE_DAYS, type CalorieBalanceDay, type CalorieBalanceRow } from "../calorie-balance";

/** 運動の取得状態。収支に運動を含められるかが状態ごとに変わる。 */
export type ExerciseTrackingState = "untracked" | "loading" | "failed" | "tracked" | "stored" | "unsynced";

const SCALE_STEP_KCAL = 500;
const kcalFormat = new Intl.NumberFormat("ja-JP");
const signedKcal = (value: number): string => `${value < 0 ? "−" : "+"}${kcalFormat.format(Math.abs(value))}`;
const shortDay = (date: string): string => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

const syncDateTime = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const nextDay = (date: string): string => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** 本人が次に見る場所が `/operations` しかない状態。runner が動いていないことに気づく入口になる。 */
const failedSyncStatuses = new Set<JobStatus>(["failed", "expired", "lost"]);

/** runner が止まっていても気づけるよう、最後の同期の結果と遡りの進み具合を 1 行で示す。 */
const syncStatusText = (status: StravaCaloriesSyncStatus): string => {
  // cursorTo はまだ読んでいないチャンクの終端なので、読み終えた最古日はその翌日。
  const backfill = status.backfill === null
    ? ""
    : `・遡り: ${status.backfill.completedAt === null ? `${nextDay(status.backfill.cursorTo)} まで完了` : "完了"}`;
  const job = status.lastJob;
  if (job === null) return `まだ同期していません${backfill}`;
  const at = syncDateTime.format(new Date(job.at));
  // 語は job 一覧と同じものを使う。`/operations` へ飛んだ先で同じ表示が見つかる。
  const label = jobStatusLabels[job.status];
  // 未完了は畳まない。runner が止まると「実行待ち」のまま止まり、それが異常の合図になる。
  if (activeJobStatuses.has(job.status)) return `同期: ${label}（${at} に予約）${backfill}`;
  // 原因を添えるのは失敗だけ。ほかの状態の errorCode は内部識別子で読み手に意味がない。
  const cause = job.status === "failed" && job.errorCode !== null ? `（${job.errorCode}）` : "";
  return `最後の同期: ${at} ${label}${cause}${backfill}`;
};

const balanceLabel = (day: CalorieBalanceDay): string => {
  if (day.balanceKcal === null) return "—";
  if (!day.signKnown) return "未確定";
  const amount = signedKcal(day.balanceKcal);
  if (day.amountKnown) return amount;
  // 額が未確定の日は、まだ動く向きを添える。摂取が増えれば下がり、取得待ちの運動が埋まれば上がる。
  return day.balanceKcal < 0 ? `${amount} 以下` : `${amount} 以上`;
};

// 「食事がない日」と「食べたがカロリーが未記録の日」を区別する。後者を 0 kcal とも `—` とも見せない。
const intakeText = (day: CalorieBalanceDay): string => {
  if (day.totalMeals === 0) return "—";
  return day.recordedMeals === 0 ? "" : kcalFormat.format(day.intakeKcal);
};

// 実測が 1 件もない日は空にする。取得待ちと算入外は記号ではなく副行の件数で示す。
const exerciseText = (day: CalorieBalanceDay): string => day.exercise !== undefined && day.exercise.kcal > 0 ? kcalFormat.format(day.exercise.kcal) : "";

/** 棒と数値は `aria-hidden` なので、読み上げ用に同じ値をラベル付きで置く。 */
const spokenIntake = (day: CalorieBalanceDay): string => {
  if (day.totalMeals === 0) return "食事の記録なし";
  return day.recordedMeals === 0 ? "摂取のカロリーが未記録" : `摂取 ${kcalFormat.format(day.intakeKcal)} kcal`;
};

const spokenAmounts = (day: CalorieBalanceDay): string => [
  spokenIntake(day),
  ...(day.exercise !== undefined && day.exercise.kcal > 0 ? [`運動 ${kcalFormat.format(day.exercise.kcal)} kcal`] : []),
].join("、");

// 副行は状態の件数だけを持つ。数値は行の中に、未確定であることは収支の列に出ている。
const dayNotes = (day: CalorieBalanceDay): ReadonlyArray<string> => {
  const unrecorded = day.totalMeals - day.recordedMeals;
  return [
    ...(day.totalMeals === 0 ? ["食事の記録なし"] : []),
    ...(unrecorded > 0 ? [`未記録 ${unrecorded} 件`] : []),
    ...(day.exercise !== undefined && day.exercise.pendingActivities > 0 ? [`取得待ち ${day.exercise.pendingActivities} 件`] : []),
    ...(day.exercise !== undefined && day.exercise.unavailableActivities > 0 ? [`算入外 ${day.exercise.unavailableActivities} 件`] : []),
  ];
};

const barClassName = (day: CalorieBalanceDay, balanceKcal: number): string => {
  if (!day.signKnown) return "border border-dashed border-muted-foreground/70 bg-muted-foreground/15";
  const overrun = balanceKcal < 0;
  if (!day.amountKnown) return overrun ? "border border-dashed border-destructive bg-destructive/20" : "border border-dashed border-primary bg-primary/20";
  return overrun ? "bg-destructive" : "bg-primary";
};

/**
 * 摂取・収支・運動の数値を棒の左右・中央に揃える。棒は中央のゼロ線を基準に描く。
 * 狭い画面でも 3 列の対応を保ち、収支の数値と棒の基準点を同じ中央に置く。
 */
const BalanceRow = ({ day, scaleKcal, scaled }: { readonly day: CalorieBalanceDay; readonly scaleKcal: number; readonly scaled: boolean }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
    {/* col-span は grid-column のショートハンドで col-start を打ち消すため、開始と終了を別々に指定する。 */}
    <div aria-hidden="true" className="relative col-start-1 col-end-4 row-start-1 h-5 mx-3 sm:mx-11">
      {scaled && <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />}
      {day.balanceKcal !== null && (
        <span
          className={cn("absolute inset-y-1 w-(--balance-width) rounded-xs", day.balanceKcal < 0 ? "right-1/2" : "left-1/2", barClassName(day, day.balanceKcal))}
          style={{
            "--balance-width": `${Math.min(Math.abs(day.balanceKcal) / scaleKcal, 1) * 50}%`,
          } as CSSProperties}
        />
      )}
    </div>
    <div aria-hidden="true" className="col-start-1 row-start-2 text-xs text-muted-foreground">
      <span>{intakeText(day)}</span>
    </div>
    <span className="col-start-2 row-start-2 text-center font-medium">{balanceLabel(day)}</span>
    <div aria-hidden="true" className="col-start-3 row-start-2 text-right text-xs text-muted-foreground">
      <span>{exerciseText(day)}</span>
    </div>
  </div>
);

const LegendSwatch = ({ className, label }: { readonly className: string; readonly label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span aria-hidden="true" className={`inline-block h-2.5 w-4 rounded-xs ${className}`} />
    {label}
  </span>
);

export const DailyCalorieBalanceList = ({ rows, baselineKcal, exerciseState, pendingActivities, nutritionPending, nutritionErrorMessage, onEditBaseline, expanded, hiddenDays, onExpandedChange, syncStatus, readOnly = false }: {
  readonly rows: ReadonlyArray<CalorieBalanceRow>;
  readonly baselineKcal: number | null;
  readonly exerciseState: ExerciseTrackingState;
  /** 表示期間全体の取得待ち件数。直近だけを表示していても runner は期間全体を取得している。 */
  readonly pendingActivities: number;
  readonly nutritionPending: boolean;
  readonly nutritionErrorMessage: string | null;
  readonly readOnly?: boolean;
  readonly onEditBaseline: () => void;
  readonly expanded: boolean;
  /** 直近の窓から外れている日数。0 なら広げる先がないのでボタンを出さない。 */
  readonly hiddenDays: number;
  readonly onExpandedChange: (expanded: boolean) => void;
  /** 定期同期の状態。未接続や未取得のときは出さない。 */
  readonly syncStatus: StravaCaloriesSyncStatus | undefined;
}) => {
  const scaleKcal = Math.max(SCALE_STEP_KCAL, ...rows.map((row) => row.kind === "day" && row.day.balanceKcal !== null
    ? Math.ceil(Math.abs(row.day.balanceKcal) / SCALE_STEP_KCAL) * SCALE_STEP_KCAL
    : 0));
  // 基準消費量がなければ収支の棒を 1 本も描かないので、目盛り・ゼロ線・凡例も出さない。
  const scaled = baselineKcal !== null;
  return (
    <Panel mobileLayout="section" className="mb-6 gap-4 px-5" aria-label="日別のカロリー収支">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">カロリー収支</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {baselineKcal === null ? "基準消費量が未設定・体重と同じ期間・日本時間" : `基準消費量 ${kcalFormat.format(baselineKcal)} kcal・体重と同じ期間・日本時間・新しい順`}
          </p>
        </div>
        <Button disabled={readOnly} size="sm" variant={baselineKcal === null ? "default" : "outline"} onClick={onEditBaseline}>
          {baselineKcal === null ? "基準消費量を設定" : "基準消費量を編集"}
        </Button>
      </header>
      {syncStatus !== undefined && (
        <p className="text-xs text-muted-foreground">
          {syncStatusText(syncStatus)}
          {/* 正常なときは出さない。異常のときだけ、原因を追える場所への導線を添える。 */}
          {syncStatus.lastJob !== null && failedSyncStatuses.has(syncStatus.lastJob.status) && (
            <>
              {" "}
              {!readOnly && <Link to="/operations" className="underline underline-offset-4">実行状況を見る</Link>}
            </>
          )}
        </p>
      )}
      {exerciseState === "untracked" && <p className="text-xs text-muted-foreground">Strava 未接続のため、運動を含めていません。</p>}
      {exerciseState === "loading" && <p role="status" className="text-sm text-muted-foreground">運動を取得しています。取得後に収支を表示します。</p>}
      {exerciseState === "failed" && <p className="text-sm text-muted-foreground">運動を取得できていないため、収支を表示していません。</p>}
      {exerciseState === "unsynced" && <p role="status" className="text-sm text-muted-foreground">{readOnly ? "運動の同期を待っています。" : "運動の同期を待っています。「運動を同期」から開始できます。"}</p>}
      {exerciseState === "stored" && <p role="status" className="text-sm text-muted-foreground">保存済みの運動で計算しています。未同期の運動は含まれません。</p>}
      {(exerciseState === "tracked" || exerciseState === "stored") && pendingActivities > 0 && (
        <p role="status" className="text-sm text-muted-foreground">{`消費カロリーを取得中（残り ${pendingActivities} 件）。Mac の runner が順に取得します。`}</p>
      )}
      {nutritionPending && <p role="status" className="text-sm text-muted-foreground">カロリーを読み込んでいます。</p>}
      {nutritionErrorMessage !== null && <FormError>{nutritionErrorMessage}</FormError>}
      <figure className="m-0">
        {/* 折りたたみ時は最大 7 行なので高さを制限しない。スクロールしない領域を tab 止まりにしないよう、
            キーボードで送るための role と tabIndex もスクロールする展開時だけ付ける。 */}
        <div
          className={cn("rounded-xl border max-sm:rounded-none max-sm:border-x-0", expanded && "max-h-[28rem] overflow-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}
          {...(expanded ? { "role": "region", "aria-label": "日別の収支", "tabIndex": 0 } : {})}
        >
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">日別のカロリー収支（日本時間・新しい順）</caption>
            <thead className="sticky top-0 bg-card">
              <tr>
                <th scope="col" className="border-b px-3 py-2 text-left font-medium whitespace-nowrap">日付</th>
                <th scope="col" className="border-b px-3 py-2 font-medium">
                  <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] items-center gap-x-3 text-[0.65rem] font-normal text-muted-foreground">
                    <span>摂取</span>
                    <span className="text-center">収支</span>
                    {/* 未接続なら運動の値は永久に出ないので見出しも出さない。取得中・失敗は一時的なので残す。 */}
                    {exerciseState !== "untracked" ? <span className="text-right">運動</span> : <span />}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => row.kind === "gap"
                ? (
                    <tr key={row.from}>
                      <td colSpan={2} className="border-b px-3 py-2 text-xs text-muted-foreground">
                        {`${shortDay(row.from)}〜${shortDay(row.to)} 食事と運動の記録なし（${row.days} 日）`}
                      </td>
                    </tr>
                  )
                : (
                    <tr key={row.day.date}>
                      <th scope="row" className="border-b px-3 py-2 text-left align-top font-normal whitespace-nowrap">{shortDay(row.day.date)}</th>
                      <td className="border-b px-3 py-2">
                        <BalanceRow day={row.day} scaleKcal={scaleKcal} scaled={scaled} />
                        <span className="sr-only">{spokenAmounts(row.day)}</span>
                        {dayNotes(row.day).length > 0 && <p className="mt-1 text-xs text-muted-foreground">{dayNotes(row.day).join("・")}</p>}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {hiddenDays > 0 && (
          <div className="mt-3 flex justify-center">
            <Button type="button" size="sm" variant="outline" aria-expanded={expanded} onClick={() => onExpandedChange(!expanded)}>
              {expanded ? `直近 ${RECENT_BALANCE_DAYS} 日だけ表示` : `すべて表示（他 ${hiddenDays} 日）`}
            </Button>
          </div>
        )}
        <figcaption className="mt-3 space-y-1 text-[0.7rem] leading-5 text-muted-foreground">
          {scaled && (
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <LegendSwatch className="bg-primary" label="貯金" />
              <LegendSwatch className="bg-destructive" label="超過" />
              <LegendSwatch className="border border-dashed border-muted-foreground/70 bg-muted-foreground/15" label="未確定" />
            </span>
          )}
          <span className="block">収支 = 基準消費量 + 運動 − 摂取。運動は Strava の記録の消費カロリーです。</span>
        </figcaption>
      </figure>
    </Panel>
  );
};
