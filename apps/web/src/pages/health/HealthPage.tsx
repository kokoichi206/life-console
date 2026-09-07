import { calculate7DayMovingAverage, weightCalendarDate, weightCalendarDayTimestamp } from "@life-console/contracts";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState, type ChangeEvent } from "react";

import { api } from "../../api";
import { EmptyState, Eyebrow, Field, FormError, MetricCard, Panel, SectionHeading } from "../../components/DesignSystem";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";

import { MealEntryDialog } from "./_components/MealEntryDialog";
import { WeightEntryDialog } from "./_components/WeightEntryDialog";
import { WeightTrendChart } from "./_components/WeightTrendChart";
import { mealsQuery, weightsQuery } from "./queries";

const ONE_DAY_MILLISECONDS = 86_400_000;

type WeightRange = "d90" | "all" | `year-${string}`;

const shortDate = (occurredAt: string): string => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
}).format(new Date(occurredAt));

export const HealthPage = ({ weightEntryOpen, onWeightEntryOpenChange, mealEntryOpen, onMealEntryOpenChange }: {
  readonly mealEntryOpen: boolean;
  readonly onMealEntryOpenChange: (open: boolean) => void;
  readonly weightEntryOpen: boolean;
  readonly onWeightEntryOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const { data: weights } = useSuspenseQuery(weightsQuery);
  const { data: meals } = useSuspenseQuery(mealsQuery);
  const [weightRange, setWeightRange] = useState<WeightRange>("d90");
  const [showWeightTable, setShowWeightTable] = useState(false);
  const weightTrend = useMemo(() => calculate7DayMovingAverage(weights), [weights]);
  const latestWeight = weightTrend.at(-1);
  const availableYears = useMemo(() => [...new Set(weightTrend.map((point) => weightCalendarDate(point.occurredAt).slice(0, 4)))].reverse(), [weightTrend]);
  const visibleWeightTrend = useMemo(() => {
    if (weightRange === "all") return weightTrend;
    if (weightRange.startsWith("year-")) {
      const year = weightRange.slice(5);
      return weightTrend.filter((point) => weightCalendarDate(point.occurredAt).startsWith(year));
    }
    if (latestWeight === undefined) return weightTrend;
    const firstVisibleDay = weightCalendarDayTimestamp(latestWeight.occurredAt) - (89 * ONE_DAY_MILLISECONDS);
    return weightTrend.filter((point) => weightCalendarDayTimestamp(point.occurredAt) >= firstVisibleDay);
  }, [latestWeight, weightRange, weightTrend]);
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
      <PageHeader eyebrow="LIFE / HEALTH" title="体重と食事" description="体重の実測値と7日移動平均、食事の記録をまとめて確認します。" />
      <div className="mb-6 flex flex-wrap justify-end gap-3">
        <Button variant="outline" className="h-11 rounded-xl px-5" onClick={() => onMealEntryOpenChange(true)}>食事を記録</Button>
        <Button className="h-11 rounded-xl px-5" onClick={() => onWeightEntryOpenChange(true)}>体重を記録</Button>
      </div>
      <MealEntryDialog open={mealEntryOpen} onOpenChange={onMealEntryOpenChange} />
      <WeightEntryDialog open={weightEntryOpen} previousWeight={latestWeight} onOpenChange={onWeightEntryOpenChange} />
      <section className="mb-6">
        <header className="mb-4 flex items-end justify-between gap-6 max-md:flex-col max-md:items-start">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">体重の推移</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              実測
              {" "}
              {weightTrend.length}
              {" "}
              件
              {weightTrend.length > 0 && ` ・ ${shortDate(weightTrend[0]?.occurredAt ?? "")}〜${shortDate(latestWeight?.occurredAt ?? "")}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1" role="group" aria-label="表示期間">
            <Button type="button" size="sm" variant={weightRange === "d90" ? "default" : "ghost"} onClick={() => setWeightRange("d90")}>直近90日</Button>
            {availableYears.map((year) => (
              <Button key={year} type="button" size="sm" variant={weightRange === `year-${year}` ? "default" : "ghost"} onClick={() => setWeightRange(`year-${year}`)}>{year}</Button>
            ))}
            <Button type="button" size="sm" variant={weightRange === "all" ? "default" : "ghost"} onClick={() => setWeightRange("all")}>全期間</Button>
          </div>
        </header>
        <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="最新"
            value={(
              <>
                {lastVisibleWeight?.weightKg.toFixed(1) ?? "—"}
                <span className="ml-1 text-sm text-muted-foreground">kg</span>
              </>
            )}
            detail={lastVisibleWeight === undefined ? "記録なし" : shortDate(lastVisibleWeight.occurredAt)}
            tone="orange"
          />
          <MetricCard
            label="期間内の変化"
            value={(
              <>
                {periodChange === undefined ? "—" : `${periodChange > 0 ? "+" : ""}${periodChange.toFixed(1)}`}
                <span className="ml-1 text-sm text-muted-foreground">kg</span>
              </>
            )}
            detail="期間の最初との比較"
            tone="primary"
          />
          <MetricCard
            label="最小値"
            value={(
              <>
                {minimumVisibleWeight?.toFixed(1) ?? "—"}
                <span className="ml-1 text-sm text-muted-foreground">kg</span>
              </>
            )}
            detail="表示期間内"
            tone="blue"
          />
          <MetricCard
            label="記録頻度"
            value={(
              <>
                {recordedDayCount}
                <span className="ml-1 text-sm text-muted-foreground">
                  /
                  {visibleDayCount}
                  日
                </span>
              </>
            )}
            detail={visibleDayCount === 0 ? "—" : `${Math.round((recordedDayCount / visibleDayCount) * 100)}%`}
            tone="gold"
          />
        </div>
        <Panel className="overflow-hidden py-0">
          <WeightTrendChart points={visibleWeightTrend} />
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
                    {["日付", "体重", "種類", "7日平均", "窓内件数"].map((heading) => <th key={heading} className="border-b px-3 py-2.5 text-right font-semibold whitespace-nowrap">{heading}</th>)}
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
          <p className="border-t bg-muted/30 px-5 py-3 text-[0.7rem] leading-5 text-muted-foreground">7日移動平均は当日を含む直近7暦日の実測値から算出します。記録のない日は補間しません。</p>
        </Panel>
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Panel className="gap-4 px-5">
          <div className="space-y-1.5">
            <Eyebrow>WEIGHT IMPORT</Eyebrow>
            <h2 className="text-base font-semibold">体重の CSV 取り込み</h2>
          </div>
          <Field label="CSV を取り込む"><Input type="file" accept=".csv,text/csv" onChange={selectWeightCsv} /></Field>
          {importCsv.error !== null && <FormError>{importCsv.error.message}</FormError>}
        </Panel>
        <Panel>
          <SectionHeading eyebrow="RECENT MEALS" title="最近の食事" />
          <div className="px-5">
            {meals.slice(0, 8).map((meal) => (
              <article key={meal.id} className="grid grid-cols-[auto_1fr] items-center gap-3 border-t py-3 first:border-t-0">
                <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{({ breakfast: "朝", lunch: "昼", dinner: "夜", snack: "間" }[meal.mealKind] ?? "食")}</span>
                <div className="min-w-0">
                  <strong className="block truncate text-xs">{meal.memo || "メモなし"}</strong>
                  <small className="text-[0.65rem] text-muted-foreground">{new Date(meal.occurredAt).toLocaleString("ja-JP")}</small>
                </div>
              </article>
            ))}
            {meals.length === 0 && <EmptyState>まだ食事記録がありません。</EmptyState>}
          </div>
        </Panel>
      </div>
    </>
  );
};
