import { calculate7DayMovingAverage, weightCalendarDate, weightCalendarDayTimestamp } from "@life-console/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState, type ChangeEvent } from "react";

import { api } from "../../api";
import { Eyebrow, Field, FormError, Panel } from "../../components/DesignSystem";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";

import { CalorieBaselineDialog } from "./_components/CalorieBaselineDialog";
import { DailyCalorieBalanceList, type ExerciseTrackingState } from "./_components/DailyCalorieBalanceList";
import { HealthShareButton } from "./_components/HealthShareButton";
import { MealEntryDialog } from "./_components/MealEntryDialog";
import { MealGallery } from "./_components/MealGallery";
import { StravaActivities } from "./_components/StravaActivities";
import { WeightEntryDialog } from "./_components/WeightEntryDialog";
import { WeightGoalDialog } from "./_components/WeightGoalDialog";
import { WeightGoalProgress } from "./_components/WeightGoalProgress";
import { WeightTrendChart } from "./_components/WeightTrendChart";
import { calorieBalanceRows, recentBalanceWindow, type ExerciseInput } from "./calorie-balance";
import { exerciseCaloriesByDay } from "./exercise-calories";
import { exerciseWeeks } from "./exercise-weeks";
import type { HealthSearch } from "./health-search";
import { useHealthQueries } from "./queries";
import { useStravaActivities } from "./use-strava-activities";
import { WEIGHT_DAY_MS, type WeightWindow } from "./weight-window";

const ONE_DAY_MILLISECONDS = WEIGHT_DAY_MS;

const shortDate = (occurredAt: string): string => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
}).format(new Date(occurredAt));

const currentJapanDate = (): string => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());

export const HealthPage = ({ search, onRangeChange, onOverlayChange, caloriesExpanded, onCaloriesExpandedChange, goalEntryOpen, onGoalEntryOpenChange, baselineEntryOpen, onBaselineEntryOpenChange, weightEntryOpen, onWeightEntryOpenChange, mealEntryOpen, onMealEntryOpenChange, selectedMealId, onSelectMeal }: {
  readonly search: HealthSearch;
  readonly onRangeChange: (range: Pick<HealthSearch, "range" | "from" | "to">) => void;
  readonly onOverlayChange: (overlay: HealthSearch["overlay"]) => void;
  readonly caloriesExpanded: boolean;
  readonly onCaloriesExpandedChange: (expanded: boolean) => void;
  readonly goalEntryOpen: boolean;
  readonly onGoalEntryOpenChange: (open: boolean) => void;
  readonly baselineEntryOpen: boolean;
  readonly onBaselineEntryOpenChange: (open: boolean) => void;
  readonly selectedMealId: string | undefined;
  readonly onSelectMeal: (id: string | undefined) => void;
  readonly mealEntryOpen: boolean;
  readonly onMealEntryOpenChange: (open: boolean) => void;
  readonly weightEntryOpen: boolean;
  readonly onWeightEntryOpenChange: (open: boolean) => void;
}) => {
  const { read, readOnly, calorieBaselineQuery, mealDayCountsQuery, mealGalleryQueryKey, nutritionQuery, stravaCaloriesQuery, stravaCaloriesSyncStatusQuery, weightsQuery, weightGoalQuery } = useHealthQueries();
  const queryClient = useQueryClient();
  const { data: weights } = useSuspenseQuery(weightsQuery);
  const { data: weightGoal } = useSuspenseQuery(weightGoalQuery);
  const { data: calorieBaseline } = useSuspenseQuery(calorieBaselineQuery);
  const weightRange = search.from === undefined ? search.range ?? "d90" : "custom";
  const [showWeightTable, setShowWeightTable] = useState(false);
  const weightTrend = useMemo(() => calculate7DayMovingAverage(weights), [weights]);
  const latestWeight = weightTrend.at(-1);
  const availableYears = useMemo(() => [...new Set(weightTrend.map((point) => weightCalendarDate(point.occurredAt).slice(0, 4)))].reverse(), [weightTrend]);
  const today = weightCalendarDayTimestamp(new Date().toISOString());
  const latestDay = today;
  const earliestDay = weightTrend[0] === undefined ? latestDay : weightCalendarDayTimestamp(weightTrend[0].occurredAt);
  const requestedWindow: WeightWindow = (() => {
    if (search.from !== undefined && search.to !== undefined) return { start: Date.parse(search.from), end: Date.parse(search.to) };
    if (weightRange === "all") return { start: Math.min(earliestDay, latestDay - WEIGHT_DAY_MS), end: latestDay };
    if (weightRange.startsWith("year-")) return { start: Date.parse(`${weightRange.slice(5)}-01-01`), end: Date.parse(`${weightRange.slice(5)}-12-31`) };
    return { start: latestDay - (weightRange === "d30" ? 29 : 89) * WEIGHT_DAY_MS, end: latestDay };
  })();
  const windowBounds = {
    start: Math.min(Date.parse(`${new Date(earliestDay).getUTCFullYear()}-01-01`), latestDay - 89 * WEIGHT_DAY_MS, requestedWindow.start),
    end: latestDay,
  };
  const visibleWindow: WeightWindow = requestedWindow.start < latestDay
    ? { start: requestedWindow.start, end: Math.min(requestedWindow.end, latestDay) }
    : { start: latestDay - WEIGHT_DAY_MS, end: latestDay };
  const periodFrom = new Date(visibleWindow.start).toISOString().slice(0, 10);
  const periodTo = new Date(visibleWindow.end).toISOString().slice(0, 10);
  const mealDayCounts = useQuery(mealDayCountsQuery(periodFrom, periodTo));
  const mealGallery = useInfiniteQuery({
    queryKey: mealGalleryQueryKey,
    initialPageParam: currentJapanDate(),
    queryFn: ({ pageParam }) => read.mealGallery(pageParam),
    getNextPageParam: (page) => page.nextTo ?? undefined,
  });
  const galleryMeals = mealGallery.data?.pages.flatMap((page) => page.meals) ?? [];
  const nutrition = useQuery(nutritionQuery);
  const strava = useStravaActivities(periodFrom, periodTo);
  const stravaCalories = useQuery(stravaCaloriesQuery(periodFrom, periodTo, strava.connected && !strava.disconnect.isPending));
  const syncStatus = useQuery(stravaCaloriesSyncStatusQuery(strava.connected));
  const awaitingFirstSync = stravaCalories.data?.length === 0 && syncStatus.data?.lastJob?.status !== "succeeded" && syncStatus.data?.backfill === null;
  const exerciseByDay = useMemo(() => {
    if (!strava.connected || strava.disconnect.isPending || stravaCalories.isError || stravaCalories.data === undefined || awaitingFirstSync || (stravaCalories.data.length === 0 && syncStatus.data === undefined)) return undefined;
    return exerciseCaloriesByDay(stravaCalories.data.map((entry) => ({ id: entry.activityId, occurredAt: entry.occurredAt })), stravaCalories.data);
  }, [strava.connected, strava.disconnect.isPending, stravaCalories.data, stravaCalories.isError, awaitingFirstSync, syncStatus.data]);
  const exerciseTracking: ExerciseTrackingState = strava.status.isError
    ? "failed"
    : strava.status.isPending || strava.disconnect.isPending
      ? "loading"
      : !strava.connected
          ? "untracked"
          : stravaCalories.isError || (stravaCalories.data?.length === 0 && syncStatus.isError)
            ? "failed"
            : awaitingFirstSync
              ? "unsynced"
              : exerciseByDay !== undefined ? "stored" : "loading";
  const untracked = exerciseTracking === "untracked";
  // 食事が未取得・取得失敗の間は行を組まない。空配列で組むと期間全体が「記録なし」の表になる。
  const nutritionMeals = nutrition.isError ? undefined : nutrition.data;
  // 表示は既定で直近だけに絞る。取得の期間は絞らないので、広げたときに空にならない。
  const recentBalance = recentBalanceWindow(periodFrom, periodTo);
  const balanceFrom = caloriesExpanded ? periodFrom : recentBalance.from;
  const balanceRows = useMemo(() => {
    if (nutritionMeals === undefined) return [];
    const exercise: ExerciseInput | undefined = untracked
      ? { mode: "untracked" }
      : exerciseByDay === undefined ? undefined : { mode: "tracked", byDay: exerciseByDay };
    return calorieBalanceRows(balanceFrom, periodTo, nutritionMeals, exercise, calorieBaseline?.dailyExpenditureKcal ?? null);
  }, [balanceFrom, periodTo, nutritionMeals, untracked, exerciseByDay, calorieBaseline]);
  // 取得待ちの件数は表示を絞っても期間全体で数える。runner は期間全体を取得している。
  const pendingActivities = exerciseByDay === undefined
    ? 0
    : [...exerciseByDay.values()].reduce((total, day) => total + day.pendingActivities, 0);
  const showRunning = search.overlay === "running";
  const runningWeeks = showRunning && strava.complete ? exerciseWeeks(periodFrom, periodTo, strava.records, [], []) : undefined;
  const changeWindow = (window: WeightWindow) => onRangeChange({ from: new Date(window.start).toISOString().slice(0, 10), to: new Date(window.end).toISOString().slice(0, 10) });
  const visibleWeightTrend = weightTrend.filter((point) => {
    const day = weightCalendarDayTimestamp(point.occurredAt);
    return day >= visibleWindow.start && day <= visibleWindow.end;
  });
  const firstVisibleWeight = visibleWeightTrend[0];
  const lastVisibleWeight = visibleWeightTrend.at(-1);
  const recordedDayCount = new Set(visibleWeightTrend.map((point) => weightCalendarDate(point.occurredAt))).size;
  const minimumVisibleWeight = visibleWeightTrend.length === 0 ? undefined : Math.min(...visibleWeightTrend.map((point) => point.weightKg));
  const visibleDayCount = firstVisibleWeight === undefined || lastVisibleWeight === undefined
    ? 0
    : Math.round((weightCalendarDayTimestamp(lastVisibleWeight.occurredAt) - weightCalendarDayTimestamp(firstVisibleWeight.occurredAt)) / ONE_DAY_MILLISECONDS) + 1;
  const periodChange = firstVisibleWeight === undefined || lastVisibleWeight === undefined ? undefined : lastVisibleWeight.weightKg - firstVisibleWeight.weightKg;
  const importCsv = useMutation({
    mutationFn: async (file: File) => api.importWeightCsv(await file.text()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["weights"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const selectWeightCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file !== undefined) importCsv.mutate(file);
  };

  return (
    <>
      <PageHeader title="体重・運動・食事" shared={readOnly} />
      {readOnly && <p className="mb-4 rounded-xl border bg-muted/40 px-4 py-3 text-sm">読み取り専用です。期間や表示条件は変更できます。記録・編集・同期はできません。</p>}
      {search.strava === "error" && <FormError>Strava に接続できませんでした。読み取り権限を確認して、もう一度接続してください。</FormError>}
      <div className={`mb-4 grid gap-2 sm:ml-auto ${readOnly ? "grid-cols-2 sm:max-w-sm" : "grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))] sm:max-w-xl"}`}>
        {!readOnly && <HealthShareButton search={search} />}
        <Button disabled={readOnly} variant="outline" className="h-11 min-w-0 rounded-xl px-1 text-xs whitespace-normal sm:px-5 sm:text-sm" onClick={() => onMealEntryOpenChange(true)}>食事</Button>
        <Button disabled={readOnly} className="h-11 min-w-0 rounded-xl px-1 text-xs whitespace-normal sm:px-5 sm:text-sm" onClick={() => onWeightEntryOpenChange(true)}>体重</Button>
      </div>
      {!readOnly && <MealEntryDialog open={mealEntryOpen} onOpenChange={onMealEntryOpenChange} />}
      {!readOnly && <WeightEntryDialog open={weightEntryOpen} previousWeight={latestWeight} onOpenChange={onWeightEntryOpenChange} />}
      {!readOnly && <WeightGoalDialog open={goalEntryOpen} onOpenChange={onGoalEntryOpenChange} goal={weightGoal} initialWeight={weightTrend[0]?.weightKg} />}
      <WeightGoalProgress goal={weightGoal} latestWeight={latestWeight?.weightKg} readOnly={readOnly} onEdit={() => onGoalEntryOpenChange(true)} />
      <section className="mb-6">
        <header className="mb-4 flex items-end justify-between gap-3 max-md:flex-col max-md:items-start">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{search.overlay === "body-fat" ? "体重と体脂肪率の推移" : showRunning && strava.connected ? "体重と走行距離の推移" : "体重の推移"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              実測
              {" "}
              {weightTrend.length}
              {" "}
              件
              {weightTrend.length > 0 && ` ・ ${shortDate(weightTrend[0]?.occurredAt ?? "")}〜${shortDate(latestWeight?.occurredAt ?? "")}`}
            </p>
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border bg-card p-1" role="group" aria-label="表示期間">
            <Button type="button" size="sm" aria-pressed={weightRange === "d30"} variant={weightRange === "d30" ? "default" : "ghost"} onClick={() => onRangeChange({ range: "d30" })}>30 日</Button>
            <Button type="button" size="sm" aria-pressed={weightRange === "d90"} variant={weightRange === "d90" ? "default" : "ghost"} onClick={() => onRangeChange({ range: "d90" })}>直近 90 日</Button>
            {availableYears.map((year) => (
              <Button key={year} type="button" size="sm" aria-pressed={weightRange === `year-${year}`} variant={weightRange === `year-${year}` ? "default" : "ghost"} onClick={() => onRangeChange({ range: `year-${year}` })}>{year}</Button>
            ))}
            <Button type="button" size="sm" aria-pressed={weightRange === "all"} variant={weightRange === "all" ? "default" : "ghost"} onClick={() => onRangeChange({ range: "all" })}>全期間</Button>
          </div>
        </header>
        <Panel mobileLayout="section" className="overflow-hidden rounded-3xl py-0 max-sm:border-t-0">
          <div className="flex justify-end gap-1 pt-3 sm:px-4" role="group" aria-label="追加表示">
            {([
              { value: "running", label: "走行距離" },
              { value: "body-fat", label: "体脂肪率" },
            ] as const).map(({ value, label }) => (
              <Button key={label} type="button" size="sm" variant={search.overlay === value ? "default" : "outline"} aria-pressed={search.overlay === value} disabled={value === "running" && !strava.connected} onClick={() => onOverlayChange(search.overlay === value ? undefined : value)}>{label}</Button>
            ))}
          </div>
          <WeightTrendChart showBodyFat={search.overlay === "body-fat"} runningWeeks={runningWeeks} onSelectWeek={onRangeChange} latestDay={latestDay} points={weightTrend} window={visibleWindow} bounds={windowBounds} onWindowChange={changeWindow} goal={weightGoal} />
          <dl className="my-3 grid grid-cols-2 gap-x-4 gap-y-4 border-t py-4 sm:mx-4 sm:grid-cols-4 sm:rounded-2xl sm:border-0 sm:bg-muted/50 sm:p-4">
            {[
              { label: "最新", value: lastVisibleWeight?.weightKg.toFixed(1) ?? "—", unit: "kg", detail: lastVisibleWeight === undefined ? "記録なし" : shortDate(lastVisibleWeight.occurredAt) },
              { label: "期間内の変化", value: periodChange === undefined ? "—" : `${periodChange > 0 ? "+" : ""}${periodChange.toFixed(1)}`, unit: "kg", detail: "期間の最初との比較" },
              { label: "最小値", value: minimumVisibleWeight?.toFixed(1) ?? "—", unit: "kg", detail: "表示期間内" },
              { label: "記録頻度", value: String(recordedDayCount), unit: `/ ${visibleDayCount} 日`, detail: visibleDayCount === 0 ? "—" : `${Math.round(recordedDayCount / visibleDayCount * 100)}%` },
            ].map((metric) => (
              <div key={metric.label}>
                <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                  {metric.value}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{metric.unit}</span>
                </dd>
                <dd className="mt-1 text-[0.65rem] text-muted-foreground">{metric.detail}</dd>
              </div>
            ))}
          </dl>
          <div className="flex justify-end pb-3 sm:px-5">
            <Button type="button" variant="outline" size="sm" aria-expanded={showWeightTable} onClick={() => setShowWeightTable((current) => !current)}>
              {showWeightTable ? "表を閉じる" : "表で見る"}
            </Button>
          </div>
          {showWeightTable && (
            <div role="region" aria-label="体重の推移の表" tabIndex={0} className="mb-4 max-h-96 overflow-auto rounded-lg border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:mx-5">
              <table aria-label="体重の推移" className="w-full border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="bg-muted/60">
                    {["日付", "体重", "体脂肪率", "種類", "7 日平均", "窓内件数"].map((heading) => <th key={heading} className="border-b px-3 py-2.5 text-right font-semibold whitespace-nowrap">{heading}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visibleWeightTrend.map((point) => (
                    <tr key={point.id}>
                      <td className="border-b px-3 py-2.5 text-right whitespace-nowrap">{shortDate(point.occurredAt)}</td>
                      <td className="border-b px-3 py-2.5 text-right whitespace-nowrap">
                        {point.weightKg.toFixed(1)}
                        {" "}
                        kg
                      </td>
                      <td className="border-b px-3 py-2.5 text-right whitespace-nowrap">{point.bodyFatPercent === null ? "—" : `${point.bodyFatPercent.toFixed(1)} %`}</td>
                      <td className="border-b px-3 py-2.5 text-right whitespace-nowrap">実測</td>
                      <td className="border-b px-3 py-2.5 text-right whitespace-nowrap">
                        {point.movingAverage7DaysKg.toFixed(2)}
                        {" "}
                        kg
                      </td>
                      <td className="border-b px-3 py-2.5 text-right whitespace-nowrap">
                        {point.movingAverageWindowSamples}
                        {" "}
                        件
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="py-3 text-[0.7rem] leading-5 text-muted-foreground sm:rounded-b-xl sm:border-t sm:bg-muted/30 sm:px-5">7 日移動平均は当日を含む直近 7 暦日の実測値から算出します。記録のない日は補間しません。</p>
        </Panel>
      </section>
      {!readOnly && <CalorieBaselineDialog open={baselineEntryOpen} onOpenChange={onBaselineEntryOpenChange} baseline={calorieBaseline} />}
      <DailyCalorieBalanceList
        readOnly={readOnly}
        rows={balanceRows}
        baselineKcal={calorieBaseline?.dailyExpenditureKcal ?? null}
        exerciseState={exerciseTracking}
        pendingActivities={pendingActivities}
        nutritionPending={nutrition.isPending}
        nutritionErrorMessage={nutrition.error?.message ?? null}
        onEditBaseline={() => onBaselineEntryOpenChange(true)}
        expanded={caloriesExpanded}
        hiddenDays={recentBalance.hiddenDays}
        onExpandedChange={onCaloriesExpandedChange}
        syncStatus={syncStatus.data}
      />
      <StravaActivities strava={strava} from={periodFrom} to={periodTo} weights={weights} mealDayCounts={mealDayCounts.data} onSelectWeek={onRangeChange} />
      {mealDayCounts.error !== null && <FormError>{mealDayCounts.error.message}</FormError>}
      {mealGallery.isPending && <p role="status">食事を読み込んでいます。</p>}
      {mealGallery.error !== null && <FormError>{mealGallery.error.message}</FormError>}
      {mealGallery.data !== undefined && <MealGallery meals={galleryMeals} selectedMealId={selectedMealId} onSelectMeal={onSelectMeal} hasMore={mealGallery.hasNextPage} loadingMore={mealGallery.isFetchingNextPage} onLoadMore={() => { void mealGallery.fetchNextPage(); }} periodLabel="新しい順・直近 7 日間" />}
      <div>
        <Panel mobileLayout="section" className="gap-4 px-5">
          <div className="space-y-1.5">
            <Eyebrow className="max-sm:hidden">WEIGHT IMPORT</Eyebrow>
            <h2 className="text-xl font-semibold sm:text-base">体重の CSV 取り込み</h2>
          </div>
          <Field label="CSV を取り込む"><Input disabled={readOnly} type="file" accept=".csv,text/csv" onChange={selectWeightCsv} /></Field>
          {importCsv.error !== null && <FormError>{importCsv.error.message}</FormError>}
        </Panel>
      </div>
    </>
  );
};
