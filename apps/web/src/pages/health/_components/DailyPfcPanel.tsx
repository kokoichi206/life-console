import { weightCalendarDate, type MealNutrition } from "@life-console/contracts";
import { useState, type FormEvent } from "react";

import { Field, FormError, Panel, SectionHeading } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { formatPfcGrams, pfcEnergyPercentages, pfcGoalExample, summarizeDailyPfc } from "../nutrition-summary";

import { PfcComposition, PfcNutrients } from "./PfcNutrients";

const dayLabel = (date: string): string => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

export const DailyPfcPanel = ({ nutrition, from, to, selectedDay, onSelectDay, pending, errorMessage }: {
  readonly nutrition: ReadonlyArray<MealNutrition> | undefined;
  readonly from: string;
  readonly to: string;
  readonly selectedDay: string | undefined;
  readonly onSelectDay: (date: string | undefined) => void;
  readonly pending: boolean;
  readonly errorMessage: string | null;
}) => {
  const [goalInputs, setGoalInputs] = useState({ weight: "70", intake: "2000" });
  const [goalConditions, setGoalConditions] = useState({ weight: 70, intake: 2000 });
  const [goalError, setGoalError] = useState<string | null>(null);
  const goal = pfcGoalExample(goalConditions.weight, goalConditions.intake);
  const goalPercentages = pfcEnergyPercentages(goal)!;
  const days = nutrition === undefined
    ? undefined
    : summarizeDailyPfc(nutrition.filter((meal) => {
        const date = weightCalendarDate(meal.occurredAt);
        return (date >= from && date <= to) || date === selectedDay;
      }));
  const dates = Array.from({ length: Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1 }, (_, index) => new Date(Date.parse(to) - index * 86_400_000).toISOString().slice(0, 10));
  const selectedDate = selectedDay ?? days?.[0]?.date ?? to;
  const selected = days?.find((day) => day.date === selectedDate);
  const applyGoalExample = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const weight = Number(goalInputs.weight);
    const intake = Number(goalInputs.intake);
    if (pfcGoalExample(weight, intake).carbohydrateGrams <= 0) {
      setGoalError("この条件では炭水化物の配分が 0 以下になります。入力を見直してください。");
      return;
    }
    setGoalConditions({ weight, intake });
    setGoalError(null);
  };
  return (
    <Panel mobileLayout="section" className="mb-6" id="pfc">
      <SectionHeading eyebrow="NUTRITION" title="PFC バランス" action={<span className="text-xs text-muted-foreground">写真・メモからの推定</span>} />
      <div className="space-y-5 sm:px-5">
        <details className="text-xs">
          <summary className="cursor-pointer text-sm">{`割合の目安：P ${Math.round(goalPercentages.proteinPercent)} % · F ${Math.round(goalPercentages.fatPercent)} % · C ${Math.round(goalPercentages.carbohydratePercent)} %（計算例）`}</summary>
          <div className="mt-3 space-y-3">
            <p className="text-muted-foreground">{`体重 ${goalConditions.weight} kg・摂取 ${goalConditions.intake.toLocaleString("ja-JP")} kcal / 日の計算例。あなたの実データではありません。`}</p>
            <form className="flex flex-wrap items-end gap-3" onSubmit={applyGoalExample}>
              <Field label="体重の例（kg）"><Input required type="number" min={1} step={0.1} className="w-28" value={goalInputs.weight} onChange={(event) => setGoalInputs({ ...goalInputs, weight: event.target.value })} /></Field>
              <Field label="摂取量の例（kcal / 日）"><Input required type="number" min={1} step={1} className="w-32" value={goalInputs.intake} onChange={(event) => setGoalInputs({ ...goalInputs, intake: event.target.value })} /></Field>
              <Button type="submit" variant="outline" size="sm">例を再計算</Button>
              {goalError !== null && <FormError>{goalError}</FormError>}
            </form>
            <p className="text-muted-foreground">P を体重 × 2.0 g、F を 25 %、C を残りとして計算します。数値は仮設定で、個人の理想値は未確定です。計算例の変更は保存されません。</p>
            <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/" target="_blank" rel="noreferrer" className="inline-block text-primary underline">たんぱく質量の参考：ISSN の見解</a>
          </div>
        </details>
        {pending && <p role="status" className="text-sm text-muted-foreground">PFC を読み込んでいます。</p>}
        {errorMessage !== null && <FormError>{errorMessage}</FormError>}
        {days !== undefined && (
          <>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {dayLabel(selectedDate)}
                {selected === undefined ? "：食事の記録なし" : `：記録した ${selected.totalMeals} 食中 ${selected.analyzedMeals} 食を解析済み`}
              </p>
              {selected !== undefined && selected.analyzedMeals > 0
                ? (
                    <>
                      {selected.analyzedMeals < selected.totalMeals && <p className="text-xs text-muted-foreground">解析済み分の合計です。未解析の食事は含めていません。</p>}
                      <PfcNutrients grams={selected} goal={goal} />
                      <p className="text-xs text-muted-foreground">選択日の実績（解析済み分）</p>
                      <PfcComposition grams={selected} label="選択日の実績" />
                      <p className="text-xs text-muted-foreground">参考の構成比（計算例）</p>
                      <PfcComposition grams={goal} label="参考の構成比（計算例）" showLegend={false} />
                    </>
                  )
                : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{selected === undefined ? "この日の食事記録はありません。" : "PFC は未解析です。解析後に量と構成比を表示します。"}</p>}
            </div>
            <div className="max-h-80 overflow-auto rounded-xl border" role="region" aria-label="日別の PFC" tabIndex={0}>
              {dates.map((date) => {
                const day = days.find((entry) => entry.date === date);
                return (
                  <button key={date} type="button" aria-label={`${date} の PFC と食事を見る`} aria-pressed={date === selectedDay} className={`grid w-full grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b px-3 py-3 text-left last:border-b-0 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none ${date === selectedDay ? "bg-accent" : ""}`} onClick={() => onSelectDay(date)}>
                    <span className="row-span-2 text-xs">{dayLabel(date)}</span>
                    {day !== undefined && day.analyzedMeals > 0
                      ? (
                          <>
                            <PfcComposition grams={day} label={`${date} の構成比`} showLegend={false} />
                            <span className="text-[0.65rem] text-foreground">{`P ${formatPfcGrams(day.proteinGrams)} g · F ${formatPfcGrams(day.fatGrams)} g · C ${formatPfcGrams(day.carbohydrateGrams)} g${day.analyzedMeals < day.totalMeals ? "（一部）" : ""}`}</span>
                          </>
                        )
                      : <span className="text-xs text-foreground">{day === undefined ? "記録なし" : `PFC 未解析（${day.totalMeals} 食）`}</span>}
                  </button>
                );
              })}
            </div>
            {selectedDay !== undefined && <Button variant="outline" size="sm" onClick={() => onSelectDay(undefined)}>全日を見る</Button>}
          </>
        )}
        <p className="text-xs text-muted-foreground">日付を選ぶと食事一覧を絞り込みます。棒は PFC 由来のエネルギー構成比で、摂取量と併せて確認します。</p>
      </div>
    </Panel>
  );
};
