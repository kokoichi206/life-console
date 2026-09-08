import { weightCalendarDayTimestamp, type WeightGoal, type WeightPointWithMovingAverage } from "@life-console/contracts";
import { useEffect, useId, useRef, useState } from "react";

import { EmptyState } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { constrainWeightWindow, snapWeightWindow, WEIGHT_DAY_MS, type WeightWindow } from "../weight-window";

import { useWeightChartGesture } from "./use-weight-chart-gesture";

const CHART_HEIGHT = 300;
const PLOT_LEFT = 12;
const PLOT_RIGHT = 44;
const PLOT_TOP = 28;
const PLOT_BOTTOM = 32;
const calendarDate = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
const tickDate = (timestamp: number) => new Intl.DateTimeFormat("ja-JP", { timeZone: "UTC", month: "numeric", day: "numeric" }).format(timestamp);

type WeightTrendChartProps = {
  readonly points: ReadonlyArray<WeightPointWithMovingAverage>;
  readonly window: WeightWindow;
  readonly bounds: WeightWindow;
  readonly onWindowChange: (window: WeightWindow) => void;
  readonly goal: WeightGoal | null;
};

export const WeightTrendChart = ({ points, window, bounds, onWindowChange, goal }: WeightTrendChartProps) => {
  const container = useRef<HTMLDivElement>(null);
  const clipId = useId();
  const helpId = useId();
  const [chartWidth, setChartWidth] = useState(360);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setChartWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const plotWidth = Math.max(1, chartWidth - PLOT_LEFT - PLOT_RIGHT);
  const plotHeight = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const committedPoints = points.filter((point) => {
    const day = weightCalendarDayTimestamp(point.occurredAt);
    return day >= window.start && day <= window.end;
  });
  const { preview, dragging, pointerHandlers, dismissInspection } = useWeightChartGesture({
    window, bounds, plotWidth, plotLeft: PLOT_LEFT, onWindowChange,
    onInspect: (position) => {
      if (position === null) {
        setHoveredId(null);
        return;
      }
      const timestamp = window.start + (position - PLOT_LEFT) / plotWidth * (window.end - window.start);
      const nearest = committedPoints.reduce<typeof points[number] | undefined>((found, point) => found === undefined || Math.abs(weightCalendarDayTimestamp(point.occurredAt) - timestamp) < Math.abs(weightCalendarDayTimestamp(found.occurredAt) - timestamp) ? point : found, undefined);
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
  const x = (timestamp: number) => PLOT_LEFT + (timestamp - displayedWindow.start) / (displayedWindow.end - displayedWindow.start) * plotWidth;
  const positioned = points.map((point) => ({ ...point, x: x(weightCalendarDayTimestamp(point.occurredAt)), actualY: y(point.weightKg), averageY: y(point.movingAverage7DaysKg) }));
  const visiblePoints = positioned.filter((point) => point.x >= PLOT_LEFT && point.x <= chartWidth - PLOT_RIGHT);
  const hovered = visiblePoints.find((point) => point.id === hoveredId);
  const detailPoint = hovered ?? visiblePoints.at(-1);
  // 点が重なって線を隠さないよう、拡大して間隔が取れるときだけ各記録の点を描く。
  const showSampleMarkers = visiblePoints.length <= plotWidth / 8;
  const latestPoint = points.at(-1);
  const latestDay = latestPoint === undefined ? undefined : weightCalendarDayTimestamp(latestPoint.occurredAt);
  const yTicks = Array.from({ length: Math.round((yMaximum - yMinimum) / tickStep) + 1 }, (_, index) => yMinimum + index * tickStep);
  const selectWindow = (next: WeightWindow) => {
    dismissInspection();
    onWindowChange(snapWeightWindow(next));
  };
  const returnToLatest = () => {
    if (latestDay !== undefined) selectWindow({ start: latestDay - (window.end - window.start), end: latestDay });
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
    <figure className="w-full px-4 pt-4 pb-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{`${tickDate(displayedWindow.start)} 〜 ${tickDate(displayedWindow.end)}`}</span>
        <div className="flex items-center gap-1" role="group" aria-label="グラフの拡大と移動">
          <Button variant="ghost" className="size-11" size="icon" aria-label="表示期間を広げる" disabled={window.end - window.start >= bounds.end - bounds.start} onClick={() => changeScale(2)}>−</Button>
          <Button variant="ghost" className="size-11" size="icon" aria-label="表示期間を狭める" disabled={window.end - window.start <= WEIGHT_DAY_MS} onClick={() => changeScale(0.5)}>＋</Button>
          <Button variant="outline" className="h-11 shrink-0" size="sm" disabled={latestDay === undefined || window.end === latestDay} onClick={returnToLatest}>最新へ</Button>
        </div>
      </div>
      <div ref={container} className="relative min-w-0">
        {points.length > 0 && (
          <div className="mb-2 flex min-h-24 items-center rounded-lg bg-muted/30 px-3 py-2">
            {detailPoint === undefined
              ? (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>この期間の体重記録はありません</p>
                    <p>横に動かすか『最新へ』で記録のある期間へ戻れます</p>
                  </div>
                )
              : (
                  <div className="grid gap-1 text-xs tabular-nums" role={hovered === undefined ? undefined : "tooltip"}>
                    <strong>{new Date(detailPoint.occurredAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</strong>
                    <span>{`実測 ${detailPoint.weightKg.toFixed(1)} kg · 7 日平均 ${detailPoint.movingAverage7DaysKg.toFixed(2)} kg`}</span>
                    <small className="text-muted-foreground">{`窓内 ${detailPoint.movingAverageWindowSamples} 件`}</small>
                  </div>
                )}
          </div>
        )}
        {points.length === 0 && goal === null
          ? <EmptyState>表示できる体重記録がありません。</EmptyState>
          : (
              <svg
                className={`block h-[300px] w-full touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-ring ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
                viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
                role="img"
                tabIndex={0}
                aria-label="体重の実測値と 7 日移動平均の推移"
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
                <defs><clipPath id={clipId}><rect x={PLOT_LEFT - 4} y={0} width={plotWidth + 8} height={CHART_HEIGHT - PLOT_BOTTOM + 4} /></clipPath></defs>
                {yTicks.map((tick) => (
                  <g key={tick}>
                    <line className="stroke-border" x1={PLOT_LEFT} x2={chartWidth - PLOT_RIGHT} y1={y(tick)} y2={y(tick)} />
                    <text className="fill-muted-foreground text-[11px]" x={chartWidth - PLOT_RIGHT + 10} y={y(tick) + 4}>{tick}</text>
                  </g>
                ))}
                {[0, 0.5, 1].map((fraction) => {
                  const timestamp = displayedWindow.start + (displayedWindow.end - displayedWindow.start) * fraction;
                  return <text key={fraction} className="fill-muted-foreground text-[11px]" x={x(timestamp)} y={CHART_HEIGHT - 7} textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}>{tickDate(timestamp)}</text>;
                })}
                {goal !== null && (
                  <g aria-label={`目標 ${goal.targetWeightKg} kg`}>
                    <line className="stroke-primary stroke-[1.5]" strokeDasharray="5 5" x1={PLOT_LEFT} x2={chartWidth - PLOT_RIGHT} y1={y(goal.targetWeightKg)} y2={y(goal.targetWeightKg)} />
                    <text className="fill-primary text-[11px] font-semibold" x={PLOT_LEFT + 3} y={y(goal.targetWeightKg) - 9}>
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
        <div className="flex justify-end gap-4 text-[0.65rem] text-muted-foreground">
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
          <span className="mt-1 block">タップで体重・長押しでなぞる</span>
          <span className="sr-only">。キーボードの左右キーで移動、プラス・マイナスで拡大縮小、End で最新へ戻ります。</span>
        </p>
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
              <Input aria-label="表示終了日" type="date" value={calendarDate(window.end)} min={calendarDate(window.start + WEIGHT_DAY_MS)} onChange={(event) => { if (event.target.validity.valid && event.target.value !== "") selectWindow({ start: window.start, end: Date.parse(event.target.value) }); }} />
            </label>
          </div>
        </details>
      </figcaption>
    </figure>
  );
};
