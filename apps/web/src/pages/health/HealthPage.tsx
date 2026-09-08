import { calculate7DayMovingAverage, weightCalendarDate, weightCalendarDayTimestamp } from "@life-console/contracts";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState, type ChangeEvent } from "react";

import { api } from "../../api";
import { Eyebrow, Field, FormError, Panel } from "../../components/DesignSystem";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";

import { MealEntryDialog } from "./_components/MealEntryDialog";
import { MealGallery } from "./_components/MealGallery";
import { StravaActivities } from "./_components/StravaActivities";
import { WeightEntryDialog } from "./_components/WeightEntryDialog";
import { WeightGoalDialog } from "./_components/WeightGoalDialog";
import { WeightGoalProgress } from "./_components/WeightGoalProgress";
import { WeightTrendChart } from "./_components/WeightTrendChart";
import { exerciseWeeks } from "./exercise-weeks";
import type { HealthSearch } from "./health-search";
import { mealsForPeriodQuery, weightsQuery, weightGoalQuery } from "./queries";
import { useStravaActivities } from "./use-strava-activities";
import { WEIGHT_DAY_MS, type WeightWindow } from "./weight-window";

const ONE_DAY_MILLISECONDS = WEIGHT_DAY_MS;

const shortDate = (occurredAt: string): string => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
}).format(new Date(occurredAt));

export const HealthPage = ({ search, onRangeChange, onRunningVisibilityChange, goalEntryOpen, onGoalEntryOpenChange, weightEntryOpen, onWeightEntryOpenChange, mealEntryOpen, onMealEntryOpenChange, selectedMealId, onSelectMeal }: {
  readonly search: HealthSearch;
  readonly onRangeChange: (range: Pick<HealthSearch, "range" | "from" | "to">) => void;
  readonly onRunningVisibilityChange: (show: boolean) => void;
  readonly goalEntryOpen: boolean;
  readonly onGoalEntryOpenChange: (open: boolean) => void;
  readonly selectedMealId: string | undefined;
  readonly onSelectMeal: (id: string | undefined) => void;
  readonly mealEntryOpen: boolean;
  readonly onMealEntryOpenChange: (open: boolean) => void;
  readonly weightEntryOpen: boolean;
  readonly onWeightEntryOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const { data: weights } = useSuspenseQuery(weightsQuery);
  const { data: weightGoal } = useSuspenseQuery(weightGoalQuery);
  const weightRange = search.from === undefined ? search.range ?? "d90" : "custom";
  const [showWeightTable, setShowWeightTable] = useState(false);
  const weightTrend = useMemo(() => calculate7DayMovingAverage(weights), [weights]);
  const latestWeight = weightTrend.at(-1);
  const availableYears = useMemo(() => [...new Set(weightTrend.map((point) => weightCalendarDate(point.occurredAt).slice(0, 4)))].reverse(), [weightTrend]);
  const today = weightCalendarDayTimestamp(new Date().toISOString());
  const latestDay = latestWeight === undefined ? today : Math.max(today, weightCalendarDayTimestamp(latestWeight.occurredAt));
  const earliestDay = weightTrend[0] === undefined ? latestDay : weightCalendarDayTimestamp(weightTrend[0].occurredAt);
  const visibleWindow: WeightWindow = (() => {
    if (search.from !== undefined && search.to !== undefined) return { start: Date.parse(search.from), end: Date.parse(search.to) };
    if (weightRange === "all") return { start: Math.min(earliestDay, latestDay - WEIGHT_DAY_MS), end: latestDay };
    if (weightRange.startsWith("year-")) return { start: Date.parse(`${weightRange.slice(5)}-01-01`), end: Date.parse(`${weightRange.slice(5)}-12-31`) };
    return { start: latestDay - (weightRange === "d30" ? 29 : 89) * WEIGHT_DAY_MS, end: latestDay };
  })();
  const periodFrom = new Date(visibleWindow.start).toISOString().slice(0, 10);
  const periodTo = new Date(visibleWindow.end).toISOString().slice(0, 10);
  const meals = useQuery(mealsForPeriodQuery(periodFrom, periodTo));
  const strava = useStravaActivities(periodFrom, periodTo);
  const showRunning = search.running === "show";
  const runningWeeks = showRunning && strava.complete ? exerciseWeeks(periodFrom, periodTo, strava.records, [], []) : undefined;
  const windowBounds = {
    start: Math.min(Date.parse(`${new Date(earliestDay).getUTCFullYear()}-01-01`), latestDay - 89 * WEIGHT_DAY_MS, visibleWindow.start),
    end: Math.max(Date.parse(`${new Date(latestDay).getUTCFullYear()}-12-31`), visibleWindow.end),
  };
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
      <PageHeader title="体重・運動・食事" />
      {search.strava === "error" && <FormError>Strava に接続できませんでした。読み取り権限を確認して、もう一度接続してください。</FormError>}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:ml-auto sm:max-w-sm">
        <Button variant="outline" className="h-11 rounded-xl px-5" onClick={() => onMealEntryOpenChange(true)}>食事を記録</Button>
        <Button className="h-11 rounded-xl px-5" onClick={() => onWeightEntryOpenChange(true)}>体重を記録</Button>
      </div>
      <MealEntryDialog open={mealEntryOpen} onOpenChange={onMealEntryOpenChange} />
      <WeightEntryDialog open={weightEntryOpen} previousWeight={latestWeight} onOpenChange={onWeightEntryOpenChange} />
      <WeightGoalDialog open={goalEntryOpen} onOpenChange={onGoalEntryOpenChange} goal={weightGoal} initialWeight={weightTrend[0]?.weightKg} />
      <WeightGoalProgress goal={weightGoal} latestWeight={latestWeight?.weightKg} onEdit={() => onGoalEntryOpenChange(true)} />
      <section className="mb-6">
        <header className="mb-4 flex items-end justify-between gap-3 max-md:flex-col max-md:items-start">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{showRunning && strava.connected ? "体重と走行距離の推移" : "体重の推移"}</h2>
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
        <Panel className="overflow-hidden rounded-3xl py-0">
          {strava.connected && (
            <div className="flex justify-end px-4 pt-3">
              <Button type="button" size="sm" variant={showRunning ? "default" : "outline"} aria-pressed={showRunning} onClick={() => onRunningVisibilityChange(!showRunning)}>走行距離を重ねる</Button>
            </div>
          )}
          <WeightTrendChart runningWeeks={runningWeeks} onSelectWeek={onRangeChange} latestDay={latestDay} points={weightTrend} window={visibleWindow} bounds={windowBounds} onWindowChange={changeWindow} goal={weightGoal} />
          <dl className="mx-4 my-3 grid grid-cols-2 gap-x-4 gap-y-4 rounded-2xl bg-muted/50 p-4 sm:grid-cols-4">
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
          <div className="flex justify-end px-5 pb-3">
            <Button type="button" variant="outline" size="sm" aria-expanded={showWeightTable} onClick={() => setShowWeightTable((current) => !current)}>
              {showWeightTable ? "表を閉じる" : "表で見る"}
            </Button>
          </div>
          {showWeightTable && (
            <div className="mx-5 mb-4 max-h-96 overflow-auto rounded-lg border">
              <table className="w-full border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="bg-muted/60">
                    {["日付", "体重", "種類", "7 日平均", "窓内件数"].map((heading) => <th key={heading} className="border-b px-3 py-2.5 text-right font-semibold whitespace-nowrap">{heading}</th>)}
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
          <p className="rounded-b-xl border-t bg-muted/30 px-5 py-3 text-[0.7rem] leading-5 text-muted-foreground">7 日移動平均は当日を含む直近 7 暦日の実測値から算出します。記録のない日は補間しません。</p>
        </Panel>
      </section>
      <StravaActivities strava={strava} from={periodFrom} to={periodTo} weights={weights} meals={meals.data} onSelectWeek={onRangeChange} />
      {meals.isPending && <p role="status">食事を読み込んでいます。</p>}
      {meals.error !== null && <FormError>{meals.error.message}</FormError>}
      {meals.data !== undefined && <MealGallery meals={meals.data} selectedMealId={selectedMealId} onSelectMeal={onSelectMeal} periodLabel={`${periodFrom} 〜 ${periodTo}・新しい順`} />}
      <div>
        <Panel className="gap-4 px-5">
          <div className="space-y-1.5">
            <Eyebrow>WEIGHT IMPORT</Eyebrow>
            <h2 className="text-base font-semibold">体重の CSV 取り込み</h2>
          </div>
          <Field label="CSV を取り込む"><Input type="file" accept=".csv,text/csv" onChange={selectWeightCsv} /></Field>
          {importCsv.error !== null && <FormError>{importCsv.error.message}</FormError>}
        </Panel>
      </div>
    </>
  );
};
