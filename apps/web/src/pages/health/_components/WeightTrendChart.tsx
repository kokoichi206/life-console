import { weightCalendarDayTimestamp, type WeightGoal, type WeightPointWithMovingAverage } from "@life-console/contracts";
import { useEffect, useRef, useState, type PointerEvent } from "react";

import { EmptyState } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { constrainWeightWindow, gestureWeightWindow, WEIGHT_DAY_MS, type WeightWindow } from "../weight-window";

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

type WeightGesture = { readonly positions: readonly [number, number]; readonly window: WeightWindow };

export const WeightTrendChart = ({ points, window, bounds, onWindowChange, goal }: WeightTrendChartProps) => {
  const container = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, number>());
  const gesture = useRef<WeightGesture | null>(null);
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
  const weightValues = points.flatMap((point) => [point.weightKg, point.movingAverage7DaysKg]);
  if (goal !== null) weightValues.push(goal.targetWeightKg);
  const minimum = weightValues.length === 0 ? 0 : Math.min(...weightValues);
  const maximum = weightValues.length === 0 ? 2 : Math.max(...weightValues);
  const tickStep = Math.max(1, Math.ceil((maximum - minimum + 2) / 5));
  const yMinimum = Math.floor((minimum - 0.5) / tickStep) * tickStep;
  const yMaximum = Math.ceil((maximum + 0.5) / tickStep) * tickStep;
  const y = (weight: number) => PLOT_TOP + (yMaximum - weight) / (yMaximum - yMinimum) * plotHeight;
  const x = (timestamp: number) => PLOT_LEFT + (timestamp - window.start) / (window.end - window.start) * plotWidth;
  const positioned = points.map((point) => ({ ...point, x: x(weightCalendarDayTimestamp(point.occurredAt)), actualY: y(point.weightKg), averageY: y(point.movingAverage7DaysKg) }));
  const hovered = positioned.find((point) => point.id === hoveredId);
  const yTicks = Array.from({ length: Math.round((yMaximum - yMinimum) / tickStep) + 1 }, (_, index) => yMinimum + index * tickStep);
  const pointerX = (event: PointerEvent<SVGSVGElement>) => event.clientX - event.currentTarget.getBoundingClientRect().left - PLOT_LEFT;
  const startPointer = (event: PointerEvent<SVGSVGElement>) => {
    pointers.current.set(event.pointerId, pointerX(event));
    event.currentTarget.setPointerCapture(event.pointerId);
    const [first, second] = [...pointers.current.values()];
    if (first !== undefined && second !== undefined) {
      gesture.current = { positions: [first, second], window };
      setHoveredId(null);
    }
  };
  const movePointer = (event: PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, pointerX(event));
    const [first, second] = [...pointers.current.values()];
    if (gesture.current !== null && first !== undefined && second !== undefined) {
      onWindowChange(gestureWeightWindow(gesture.current.window, bounds, gesture.current.positions, [first, second], plotWidth));
      return;
    }
    const position = pointerX(event) + PLOT_LEFT;
    const nearest = positioned.reduce<typeof positioned[number] | undefined>((found, point) => found === undefined || Math.abs(point.x - position) < Math.abs(found.x - position) ? point : found, undefined);
    setHoveredId(nearest?.id ?? null);
  };
  const endPointer = (event: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    gesture.current = null;
  };
  const changeScale = (factor: number) => {
    const midpoint = (window.start + window.end) / 2;
    const halfSpan = (window.end - window.start) * factor / 2;
    onWindowChange(constrainWeightWindow({ start: midpoint - halfSpan, end: midpoint + halfSpan }, bounds));
  };
  const shiftWindow = (direction: number) => {
    const shift = direction * (window.end - window.start) / 2;
    onWindowChange(constrainWeightWindow({ start: window.start + shift, end: window.end + shift }, bounds));
  };
  return (
    <figure className="w-full px-4 pt-4 pb-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">kg</span>
        <div className="flex gap-1" role="group" aria-label="グラフの拡大と移動">
          <Button variant="ghost" size="icon" aria-label="前の期間" disabled={window.start <= bounds.start} onClick={() => shiftWindow(-1)}>←</Button>
          <Button variant="ghost" size="icon" aria-label="表示期間を広げる" disabled={window.end - window.start >= bounds.end - bounds.start} onClick={() => changeScale(2)}>−</Button>
          <Button variant="ghost" size="icon" aria-label="表示期間を狭める" disabled={window.end - window.start <= WEIGHT_DAY_MS} onClick={() => changeScale(0.5)}>＋</Button>
          <Button variant="ghost" size="icon" aria-label="次の期間" disabled={window.end >= bounds.end} onClick={() => shiftWindow(1)}>→</Button>
        </div>
      </div>
      <div ref={container} className="relative min-w-0">
        {points.length === 0 && <EmptyState>表示できる体重記録がありません。</EmptyState>}
        {(points.length > 0 || goal !== null) && (
          <svg
            className="block h-[300px] w-full touch-pan-y select-none"
            viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
            role="img"
            aria-label="体重の実測値と 7 日移動平均の推移"
            onPointerDown={startPointer}
            onPointerMove={movePointer}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onLostPointerCapture={endPointer}
            onPointerLeave={() => setHoveredId(null)}
          >
            {yTicks.map((tick) => (
              <g key={tick}>
                <line className="stroke-border" x1={PLOT_LEFT} x2={chartWidth - PLOT_RIGHT} y1={y(tick)} y2={y(tick)} />
                <text className="fill-muted-foreground text-[11px]" x={chartWidth - PLOT_RIGHT + 10} y={y(tick) + 4}>{tick}</text>
              </g>
            ))}
            {[0, 0.5, 1].map((fraction) => {
              const timestamp = window.start + (window.end - window.start) * fraction;
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
            <polyline className="fill-none stroke-primary stroke-[2.5]" strokeLinejoin="round" strokeLinecap="round" points={positioned.map((point) => `${point.x},${point.actualY}`).join(" ")} />
            {positioned.map((point) => <circle key={point.id} className="fill-card stroke-primary stroke-[2.5]" cx={point.x} cy={point.actualY} r="3.5" />)}
            <polyline className="fill-none stroke-chart-2 stroke-[2] opacity-80" strokeLinejoin="round" strokeLinecap="round" points={positioned.map((point) => `${point.x},${point.averageY}`).join(" ")} />
            {positioned.at(-1) !== undefined && <circle className="fill-primary" cx={positioned.at(-1)?.x} cy={positioned.at(-1)?.actualY} r="5" />}
            {hovered !== undefined && <line className="stroke-muted-foreground" strokeDasharray="3 4" x1={hovered.x} x2={hovered.x} y1={PLOT_TOP} y2={CHART_HEIGHT - PLOT_BOTTOM} />}
          </svg>
        )}
        {hovered !== undefined && (
          <div className="pointer-events-none absolute inset-x-2 top-0 z-10 grid gap-1 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm" role="tooltip">
            <strong>{new Date(hovered.occurredAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</strong>
            <span>{`実測 ${hovered.weightKg.toFixed(1)} kg · 7 日平均 ${hovered.movingAverage7DaysKg.toFixed(2)} kg`}</span>
            <small className="text-muted-foreground">{`窓内 ${hovered.movingAverageWindowSamples} 件`}</small>
          </div>
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
        <div className="grid grid-cols-2 gap-2">
          <label className="grid min-w-0 gap-1 text-[0.65rem] text-muted-foreground">
            開始日
            <Input aria-label="表示開始日" type="date" value={calendarDate(window.start)} max={calendarDate(window.end - WEIGHT_DAY_MS)} onChange={(event) => { if (event.target.validity.valid && event.target.value !== "") onWindowChange({ start: Date.parse(event.target.value), end: window.end }); }} />
          </label>
          <label className="grid min-w-0 gap-1 text-[0.65rem] text-muted-foreground">
            終了日
            <Input aria-label="表示終了日" type="date" value={calendarDate(window.end)} min={calendarDate(window.start + WEIGHT_DAY_MS)} onChange={(event) => { if (event.target.validity.valid && event.target.value !== "") onWindowChange({ start: window.start, end: Date.parse(event.target.value) }); }} />
          </label>
        </div>
        <p className="text-center text-[0.65rem] text-muted-foreground">横に 2 本指で広げる・縮めると拡大縮小、そろえて動かすと期間を移動</p>
      </figcaption>
    </figure>
  );
};
