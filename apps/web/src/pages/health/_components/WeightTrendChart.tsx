import { weightCalendarDayTimestamp, type WeightGoal, type WeightPointWithMovingAverage } from "@life-console/contracts";
import { useEffect, useId, useRef, useState } from "react";

import { EmptyState } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import type { ExerciseChartWeek } from "../exercise-chart-weeks";
import { constrainWeightWindow, snapWeightWindow, WEIGHT_DAY_MS, type WeightWindow } from "../weight-window";

import { useWeightChartGesture } from "./use-weight-chart-gesture";

const CHART_HEIGHT = 300;
const PLOT_RIGHT = 44;
const PLOT_TOP = 28;
const PLOT_BOTTOM = 32;
const calendarDate = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
const tickDate = (timestamp: number) => new Intl.DateTimeFormat("ja-JP", { timeZone: "UTC", month: "numeric", day: "numeric" }).format(timestamp);

type WeightTrendChartProps = {
  readonly showBodyFat: boolean;
  readonly showExerciseCalories: boolean;
  readonly chartWeeks: ReadonlyArray<ExerciseChartWeek> | undefined;
  readonly onSelectWeek: (period: { from: string; to: string }) => void;
  readonly latestDay: number;
  readonly points: ReadonlyArray<WeightPointWithMovingAverage>;
  readonly window: WeightWindow;
  readonly bounds: WeightWindow;
  readonly onWindowChange: (window: WeightWindow) => void;
  readonly goal: WeightGoal | null;
};

export const WeightTrendChart = ({ points, window, bounds, onWindowChange, goal, latestDay, chartWeeks, onSelectWeek, showBodyFat, showExerciseCalories }: WeightTrendChartProps) => {
  const container = useRef<HTMLDivElement>(null);
  const clipId = useId();
  const helpId = useId();
  const [chartWidth, setChartWidth] = useState(360);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [inspectedDay, setInspectedDay] = useState<number | null>(null);
  const plotLeft = chartWeeks === undefined && !showBodyFat ? 12 : 44;
  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setChartWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const plotWidth = Math.max(1, chartWidth - plotLeft - PLOT_RIGHT);
  const plotHeight = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const committedPoints = points.filter((point) => {
    const day = weightCalendarDayTimestamp(point.occurredAt);
    return day >= window.start && day <= window.end;
  });
  const { preview, dragging, pointerHandlers, dismissInspection } = useWeightChartGesture({
    window, bounds, plotWidth, plotLeft, onWindowChange,
    onInspect: (position) => {
      if (position === null) {
        setHoveredId(null);
        setInspectedDay(null);
        return;
      }
      const timestamp = window.start + Math.round((position - plotLeft) / plotWidth * (window.end - window.start) / WEIGHT_DAY_MS) * WEIGHT_DAY_MS;
      setInspectedDay(timestamp);
      const week = chartWeeks?.find((entry) => timestamp >= Date.parse(entry.visibleFrom) && timestamp < Date.parse(entry.visibleTo) + WEIGHT_DAY_MS);
      const weekPoints = chartWeeks === undefined ? committedPoints : committedPoints.filter((point) => week !== undefined && weightCalendarDayTimestamp(point.occurredAt) >= Date.parse(week.visibleFrom) && weightCalendarDayTimestamp(point.occurredAt) <= Date.parse(week.visibleTo));
      const nearest = weekPoints.reduce<typeof points[number] | undefined>((found, point) => found === undefined || Math.abs(weightCalendarDayTimestamp(point.occurredAt) - timestamp) < Math.abs(weightCalendarDayTimestamp(found.occurredAt) - timestamp) ? point : found, undefined);
      setHoveredId(nearest?.id ?? null);
    },
  });
  const displayedWindow = preview ?? window;
  // 操作中に縦軸まで伸縮すると横移動を追いにくいため、確定済みの期間の目盛りを維持する。
  const weightValues = committedPoints.flatMap((point) => [point.weightKg, point.movingAverage7DaysKg]);
  if (goal !== null) weightValues.push(goal.targetWeightKg);
  const minimum = weightValues.length === 0 ? 0 : Math.min(...weightValues);
  const maximum = weightValues.length === 0 ? 2 : Math.max(...weightValues);
  const tickStep = Math.max(1, Math.ceil((maximum - minimum + 2) / 5));
  const yMinimum = Math.floor((minimum - 0.5) / tickStep) * tickStep;
  const yMaximum = Math.ceil((maximum + 0.5) / tickStep) * tickStep;
  const y = (weight: number) => PLOT_TOP + (yMaximum - weight) / (yMaximum - yMinimum) * plotHeight;
  const x = (timestamp: number) => plotLeft + (timestamp - displayedWindow.start) / (displayedWindow.end - displayedWindow.start) * plotWidth;
  const positioned = points.map((point) => ({ ...point, x: x(weightCalendarDayTimestamp(point.occurredAt)), actualY: y(point.weightKg), averageY: y(point.movingAverage7DaysKg) }));
  const visiblePoints = positioned.filter((point) => point.x >= plotLeft && point.x <= chartWidth - PLOT_RIGHT);
  const hovered = visiblePoints.find((point) => point.id === hoveredId);
  const inspectedWeek = chartWeeks?.find((week) => inspectedDay !== null && inspectedDay >= Date.parse(week.visibleFrom) && inspectedDay < Date.parse(week.visibleTo) + WEIGHT_DAY_MS);
  const detailWeek = inspectedWeek ?? chartWeeks?.[0];
  const detailPoints = detailWeek === undefined ? visiblePoints : visiblePoints.filter((point) => weightCalendarDayTimestamp(point.occurredAt) >= Date.parse(detailWeek.visibleFrom) && weightCalendarDayTimestamp(point.occurredAt) <= Date.parse(detailWeek.visibleTo));
  const detailPoint = hovered ?? detailPoints.at(-1);
  const maximumExercise = Math.max(0, ...chartWeeks?.map((week) => week.value ?? 0) ?? []);
  const exerciseTickUnit = showExerciseCalories ? 500 : 5;
  const exerciseStep = Math.max(exerciseTickUnit, Math.ceil(maximumExercise / 4 / exerciseTickUnit) * exerciseTickUnit);
  const exerciseMaximum = exerciseStep * 4;
  const exerciseY = (value: number) => PLOT_TOP + (1 - value / exerciseMaximum) * plotHeight;
  const exerciseLabel = showExerciseCalories ? "消費カロリー" : "走行距離";
  const bodyFatValues = committedPoints.flatMap((point) => point.bodyFatPercent === null ? [] : [point.bodyFatPercent]);
  const bodyFatMinimum = Math.max(0, Math.floor((Math.min(...bodyFatValues, 100) - 1) / 5) * 5);
  const bodyFatMaximum = Math.min(100, Math.ceil((Math.max(...bodyFatValues, 0) + 1) / 5) * 5);
  const bodyFatY = (percent: number) => PLOT_TOP + (bodyFatMaximum - percent) / (bodyFatMaximum - bodyFatMinimum) * plotHeight;
  const bodyFatPath = positioned.map((point, index) => point.bodyFatPercent === null
    ? ""
    : `${index === 0 || positioned[index - 1]!.bodyFatPercent === null ? "M" : "L"}${point.x},${bodyFatY(point.bodyFatPercent)}`).join(" ");
  // 点が重なって線を隠さないよう、拡大して間隔が取れるときだけ各記録の点を描く。
  const showSampleMarkers = visiblePoints.length <= plotWidth / 8;
  const yTicks = Array.from({ length: Math.round((yMaximum - yMinimum) / tickStep) + 1 }, (_, index) => yMinimum + index * tickStep);
  const selectWindow = (next: WeightWindow) => {
    dismissInspection();
    onWindowChange(snapWeightWindow(next));
  };
  const returnToLatest = () => {
    selectWindow({ start: latestDay - (window.end - window.start), end: latestDay });
  };
  const changeScale = (factor: number) => {
    const midpoint = (window.start + window.end) / 2;
    const halfSpan = (window.end - window.start) * factor / 2;
    selectWindow(constrainWeightWindow({ start: midpoint - halfSpan, end: midpoint + halfSpan }, bounds));
  };
  const shiftWindow = (direction: number) => {
    const shift = direction * (window.end - window.start) / 2;
    selectWindow(constrainWeightWindow({ start: window.start + shift, end: window.end + shift }, bounds));
  };
  return (
    <figure className="w-full pt-2 pb-2 sm:px-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{`${tickDate(displayedWindow.start)} 〜 ${tickDate(displayedWindow.end)}`}</span>
        <div className="flex items-center gap-1" role="group" aria-label="グラフの拡大と移動">
          <Button variant="ghost" className="size-11" size="icon" aria-label="表示期間を広げる" disabled={window.end - window.start >= bounds.end - bounds.start} onClick={() => changeScale(2)}>−</Button>
          <Button variant="ghost" className="size-11" size="icon" aria-label="表示期間を狭める" disabled={window.end - window.start <= WEIGHT_DAY_MS} onClick={() => changeScale(0.5)}>＋</Button>
          <Button variant="outline" className="h-11 shrink-0" size="sm" disabled={window.end === latestDay} onClick={returnToLatest}>最新へ</Button>
        </div>
      </div>
      <div ref={container} className="relative min-w-0">
        {(points.length > 0 || detailWeek !== undefined) && (
          <div className="mb-1 grid items-start gap-2 py-2 sm:grid-cols-2 sm:rounded-lg sm:bg-muted/30 sm:px-3">
            {detailPoint === undefined
              ? (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>{detailWeek === undefined ? "この期間の体重記録はありません" : "この週の体重記録はありません"}</p>
                    <p>横に動かすか、日付を指定して記録のある期間を選べます</p>
                  </div>
                )
              : (
                  <div className="grid content-start gap-1 text-xs tabular-nums" role={hovered === undefined ? undefined : "tooltip"}>
                    <strong>{new Date(detailPoint.occurredAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</strong>
                    <span>{`実測 ${detailPoint.weightKg.toFixed(1)} kg · 7 日平均 ${detailPoint.movingAverage7DaysKg.toFixed(2)} kg`}</span>
                    {showBodyFat && <span>{detailPoint.bodyFatPercent === null ? "体脂肪率 未記録" : `体脂肪率 ${detailPoint.bodyFatPercent.toFixed(1)} %`}</span>}
                    <small className="text-muted-foreground">{`窓内 ${detailPoint.movingAverageWindowSamples} 件`}</small>
                  </div>
                )}
            {detailWeek !== undefined && (
              <div className="space-y-1 text-xs tabular-nums">
                <strong>{`${tickDate(Date.parse(detailWeek.visibleFrom))} 〜 ${tickDate(Date.parse(detailWeek.visibleTo))}${detailWeek.periodLabel}`}</strong>
                <p className="text-base font-semibold text-chart-4">{detailWeek.summary}</p>
                {showExerciseCalories && <p className="text-muted-foreground">{`ラン ${(detailWeek.distanceMeters / 1000).toFixed(1)} km ・ 運動 ${detailWeek.runCount + detailWeek.otherCount} 回`}</p>}
                <Button size="sm" variant="outline" onClick={() => onSelectWeek({ from: detailWeek.from, to: detailWeek.to })}>{showExerciseCalories ? "この週の運動と食事を見る" : "この週のランと食事を見る"}</Button>
              </div>
            )}
          </div>
        )}
        {points.length === 0 && goal === null && chartWeeks === undefined
          ? <EmptyState>表示できる体重記録がありません。</EmptyState>
          : (
              <svg
                className={`block h-[300px] w-full touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-ring ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
                viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
                role="img"
                tabIndex={0}
                aria-label={showBodyFat ? "体重と体脂肪率の推移" : chartWeeks === undefined ? "体重の実測値と 7 日移動平均の推移" : `体重と週ごとの${exerciseLabel}の推移`}
                aria-describedby={helpId}
                {...pointerHandlers}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") shiftWindow(-1);
                  else if (event.key === "ArrowRight") shiftWindow(1);
                  else if (event.key === "+" || event.key === "=") changeScale(0.5);
                  else if (event.key === "-") changeScale(2);
                  else if (event.key === "End") returnToLatest();
                  else if (event.key === "Escape") dismissInspection();
                  else return;
                  event.preventDefault();
                }}
              >
                <defs><clipPath id={clipId}><rect x={plotLeft - 4} y={0} width={plotWidth + 8} height={CHART_HEIGHT - PLOT_BOTTOM + 4} /></clipPath></defs>
                {weightValues.length > 0 && <text className="fill-muted-foreground text-[11px]" x={chartWidth - PLOT_RIGHT + 10} y={14}>kg</text>}
                {weightValues.length > 0 && yTicks.map((tick) => (
                  <g key={tick}>
                    <line className="stroke-border" x1={plotLeft} x2={chartWidth - PLOT_RIGHT} y1={y(tick)} y2={y(tick)} />
                    <text className="fill-muted-foreground text-[11px]" x={chartWidth - PLOT_RIGHT + 10} y={y(tick) + 4}>{tick}</text>
                  </g>
                ))}
                {chartWeeks !== undefined && (
                  <>
                    <text className="fill-chart-4 text-[11px]" x={0} y={14}>{showExerciseCalories ? "kcal / 週" : "km / 週"}</text>
                    {[0, 1, 2, 3, 4].map((step) => <text key={step} className="fill-chart-4 text-[11px]" x={plotLeft - 8} y={exerciseY(step * exerciseStep) + 4} textAnchor="end">{step * exerciseStep}</text>)}
                    <g clipPath={`url(#${clipId})`} aria-label={`週ごとの${exerciseLabel}`}>
                      {chartWeeks.map((week) => {
                        // 日付の点を中心に幅を取り、表示最終日だけの週も棒が消えないようにする。
                        const left = Math.max(plotLeft, x(Date.parse(week.visibleFrom) - WEIGHT_DAY_MS / 2));
                        const right = Math.min(chartWidth - PLOT_RIGHT, x(Date.parse(week.visibleTo) + WEIGHT_DAY_MS / 2));
                        const barWidth = Math.max(0, right - left);
                        const barGap = Math.min(1, barWidth / 4);
                        if (week.value === null) return (
                          <text key={week.from} className="fill-muted-foreground text-[11px]" x={(left + right) / 2} y={CHART_HEIGHT - PLOT_BOTTOM - 8} textAnchor="middle">
                            <title>{`${week.visibleFrom} 〜 ${week.visibleTo}${week.periodLabel}: ${week.summary}`}</title>
                            —
                          </text>
                        );
                        const top = exerciseY(week.value);
                        return <rect key={week.from} className={`fill-chart-4 ${week.incomplete ? "stroke-chart-4" : ""}`} strokeDasharray={week.incomplete ? "3 3" : undefined} fillOpacity={week.from === detailWeek?.from ? 0.4 : 0.18} x={left + barGap} y={top} width={barWidth - barGap * 2} height={CHART_HEIGHT - PLOT_BOTTOM - top} rx={3}><title>{`${week.visibleFrom} 〜 ${week.visibleTo}${week.periodLabel}: ${week.summary}`}</title></rect>;
                      })}
                    </g>
                  </>
                )}
                {showBodyFat && bodyFatValues.length > 0 && (
                  <>
                    <text className="fill-chart-5 dark:fill-chart-3 text-[11px]" x={0} y={14}>%</text>
                    {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                      const percent = bodyFatMinimum + (bodyFatMaximum - bodyFatMinimum) * fraction;
                      return <text key={fraction} className="fill-chart-5 dark:fill-chart-3 text-[11px]" x={plotLeft - 8} y={bodyFatY(percent) + 4} textAnchor="end">{Number(percent.toFixed(1))}</text>;
                    })}
                    <g clipPath={`url(#${clipId})`} aria-label="体脂肪率の実測値">
                      <path className="fill-none stroke-chart-5 dark:stroke-chart-3 stroke-2" strokeLinejoin="round" d={bodyFatPath} />
                      {visiblePoints.filter((point) => point.bodyFatPercent !== null).map((point) => <circle key={point.id} className="fill-chart-5 dark:fill-chart-3" cx={point.x} cy={bodyFatY(point.bodyFatPercent!)} r={3}><title>{`${tickDate(weightCalendarDayTimestamp(point.occurredAt))}: ${point.bodyFatPercent!.toFixed(1)} %`}</title></circle>)}
                    </g>
                  </>
                )}
                {[0, 0.5, 1].map((fraction) => {
                  const timestamp = displayedWindow.start + (displayedWindow.end - displayedWindow.start) * fraction;
                  return <text key={fraction} className="fill-muted-foreground text-[11px]" x={x(timestamp)} y={CHART_HEIGHT - 7} textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}>{tickDate(timestamp)}</text>;
                })}
                {goal !== null && (
                  <g aria-label={`目標 ${goal.targetWeightKg} kg`}>
                    <line className="stroke-primary stroke-[1.5]" strokeDasharray="5 5" x1={plotLeft} x2={chartWidth - PLOT_RIGHT} y1={y(goal.targetWeightKg)} y2={y(goal.targetWeightKg)} />
                    <text className="fill-primary text-[11px] font-semibold" x={plotLeft + 3} y={y(goal.targetWeightKg) - 9}>
                      {`目標 ${goal.targetWeightKg.toFixed(1)} kg`}
                    </text>
                  </g>
                )}
                <g clipPath={`url(#${clipId})`}>
                  <polyline className="fill-none stroke-primary stroke-[2.5]" strokeLinejoin="round" strokeLinecap="round" points={positioned.map((point) => `${point.x},${point.actualY}`).join(" ")} />
                  {showSampleMarkers && visiblePoints.map((point) => <circle key={point.id} className="fill-card stroke-primary stroke-[2.5]" cx={point.x} cy={point.actualY} r="3.5" />)}
                  <polyline className="fill-none stroke-chart-2 stroke-[2] opacity-80" strokeLinejoin="round" strokeLinecap="round" points={positioned.map((point) => `${point.x},${point.averageY}`).join(" ")} />
                  {visiblePoints.at(-1) !== undefined && <circle className="fill-primary" cx={visiblePoints.at(-1)?.x} cy={visiblePoints.at(-1)?.actualY} r="5" />}
                </g>
                {hovered !== undefined && <circle className="fill-primary stroke-card stroke-2" cx={hovered.x} cy={hovered.actualY} r="6" />}
                {hovered !== undefined && <line className="stroke-muted-foreground" strokeDasharray="3 4" x1={hovered.x} x2={hovered.x} y1={PLOT_TOP} y2={CHART_HEIGHT - PLOT_BOTTOM} />}
              </svg>
            )}
      </div>
      <figcaption className="mt-3 space-y-3">
        <div className="flex flex-wrap justify-end gap-4 text-[0.65rem] text-muted-foreground">
          {chartWeeks !== undefined && (
            <span className="inline-flex items-center gap-1.5">
              <i className="h-3 w-4 rounded-sm bg-chart-4/30" />
              {`週の${exerciseLabel}`}
            </span>
          )}
          {showBodyFat && (
            <span className="inline-flex items-center gap-1.5">
              <i className="h-0.5 w-4 bg-chart-5 dark:bg-chart-3" />
              体脂肪率
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <i className="h-0.5 w-4 bg-primary" />
            実測値
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-0.5 w-4 bg-chart-2" />
            7 日移動平均
          </span>
        </div>
        <p id={helpId} className="text-center text-xs text-muted-foreground">
          横にスワイプで移動・ピンチで拡大縮小
          <span className="mt-1 block">{showBodyFat ? "タップで体重と体脂肪率を確認・長押しでなぞる" : chartWeeks === undefined ? "タップで体重・長押しでなぞる" : `タップで体重と週の${exerciseLabel}を確認・長押しでなぞる`}</span>
          <span className="sr-only">。キーボードの左右キーで移動、プラス・マイナスで拡大縮小、End で最新へ戻ります。</span>
        </p>
        {showBodyFat && bodyFatValues.length === 0 && <p className="text-center text-xs text-muted-foreground">この期間の体脂肪率の記録はありません。</p>}
        {chartWeeks !== undefined && (
          <p className="text-center text-xs text-muted-foreground">
            {showExerciseCalories ? "消費カロリーは保存済みの運動の推定値（全種目）。未同期の運動・基準消費量は含みません。破線は途中・一部の週、または取得済み分だけの合計です。— は全件未取得です。" : "走行距離は月曜始まり。期間の端の週は、表示されている日だけの合計です。"}
            {showExerciseCalories && "月曜始まり・表示されている日だけの合計です。"}
            Powered by Strava
          </p>
        )}
        <details className="rounded-lg border px-3">
          <summary className="cursor-pointer py-3 text-xs">日付を指定・ボタンで移動</summary>
          <div className="mb-3 flex justify-between gap-2">
            <Button variant="outline" className="h-11" size="sm" disabled={window.start <= bounds.start} onClick={() => shiftWindow(-1)}>前の期間</Button>
            <Button variant="outline" className="h-11" size="sm" disabled={window.end >= bounds.end} onClick={() => shiftWindow(1)}>次の期間</Button>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <label className="grid min-w-0 gap-1 text-[0.65rem] text-muted-foreground">
              開始日
              <Input aria-label="表示開始日" type="date" value={calendarDate(window.start)} max={calendarDate(window.end - WEIGHT_DAY_MS)} onChange={(event) => { if (event.target.validity.valid && event.target.value !== "") selectWindow({ start: Date.parse(event.target.value), end: window.end }); }} />
            </label>
            <label className="grid min-w-0 gap-1 text-[0.65rem] text-muted-foreground">
              終了日
              <Input aria-label="表示終了日" type="date" value={calendarDate(window.end)} min={calendarDate(window.start + WEIGHT_DAY_MS)} max={calendarDate(bounds.end)} onChange={(event) => { if (event.target.validity.valid && event.target.value !== "") selectWindow({ start: window.start, end: Date.parse(event.target.value) }); }} />
            </label>
          </div>
        </details>
      </figcaption>
    </figure>
  );
};
