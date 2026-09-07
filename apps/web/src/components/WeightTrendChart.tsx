import type { WeightPointWithMovingAverage } from "@life-console/contracts";
import { useState, type PointerEvent } from "react";

import { cn } from "../lib/class-names";

import { EmptyState } from "./DesignSystem";

const CHART_WIDTH = 900;
const CHART_HEIGHT = 340;
const PLOT_LEFT = 54;
const PLOT_RIGHT = 24;
const PLOT_TOP = 22;
const PLOT_BOTTOM = 42;

type WeightTrendChartProps = {
  readonly points: ReadonlyArray<WeightPointWithMovingAverage>;
};

type PositionedWeightPoint = WeightPointWithMovingAverage & {
  readonly x: number;
  readonly actualY: number;
  readonly averageY: number;
};

const formatDate = (occurredAt: string): string => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
}).format(new Date(occurredAt));

const uniqueIndexes = (indexes: ReadonlyArray<number>): ReadonlyArray<number> => [...new Set(indexes)];

export const WeightTrendChart = ({ points }: WeightTrendChartProps) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (points.length === 0) return <EmptyState>表示できる体重記録がありません。</EmptyState>;

  const timestamps = points.map((point) => new Date(point.occurredAt).getTime());
  const weights = points.flatMap((point) => [point.weightKg, point.movingAverage7DaysKg]);
  const firstTimestamp = timestamps[0] ?? 0;
  const lastTimestamp = timestamps.at(-1) ?? firstTimestamp;
  const timeSpan = Math.max(lastTimestamp - firstTimestamp, 1);
  const minimumWeight = Math.min(...weights);
  const maximumWeight = Math.max(...weights);
  const yMinimum = Math.floor((minimumWeight - 0.6) / 2) * 2;
  const yMaximumCandidate = Math.ceil((maximumWeight + 0.6) / 2) * 2;
  const yMaximum = yMaximumCandidate === yMinimum ? yMinimum + 2 : yMaximumCandidate;
  const ySpan = yMaximum - yMinimum;
  const plotWidth = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT;
  const plotHeight = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const positionedPoints: ReadonlyArray<PositionedWeightPoint> = points.map((point, index) => {
    const timestamp = timestamps[index] ?? firstTimestamp;
    return {
      ...point,
      x: PLOT_LEFT + ((timestamp - firstTimestamp) / timeSpan) * plotWidth,
      actualY: PLOT_TOP + ((yMaximum - point.weightKg) / ySpan) * plotHeight,
      averageY: PLOT_TOP + ((yMaximum - point.movingAverage7DaysKg) / ySpan) * plotHeight,
    };
  });
  const actualLine = positionedPoints.map((point) => `${point.x},${point.actualY}`).join(" ");
  const averageLine = positionedPoints.map((point) => `${point.x},${point.averageY}`).join(" ");
  const yTicks = Array.from({ length: Math.round(ySpan / 2) + 1 }, (_, index) => yMinimum + (index * 2));
  const xTickIndexes = uniqueIndexes([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  const hoveredPoint = hoveredIndex === null ? undefined : positionedPoints[hoveredIndex];
  const lastPoint = positionedPoints.at(-1);

  const trackPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * CHART_WIDTH;
    let nearestIndex = 0;
    positionedPoints.forEach((point, index) => {
      if (Math.abs(point.x - pointerX) < Math.abs((positionedPoints[nearestIndex]?.x ?? point.x) - pointerX)) nearestIndex = index;
    });
    setHoveredIndex(nearestIndex);
  };

  return (
    <figure className="w-full px-4 pt-4 pb-2">
      <div className="relative">
        <svg
          className="block h-auto w-full touch-none"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label="体重の実測値と7日移動平均の推移"
          onPointerMove={trackPointer}
          onPointerLeave={() => setHoveredIndex(null)}
        >
          {yTicks.map((tick) => {
            const y = PLOT_TOP + ((yMaximum - tick) / ySpan) * plotHeight;
            return (
              <g key={tick}>
                <line className="stroke-border [vector-effect:non-scaling-stroke]" x1={PLOT_LEFT} x2={CHART_WIDTH - PLOT_RIGHT} y1={y} y2={y} />
                <text className="fill-muted-foreground text-[10px]" x={PLOT_LEFT - 10} y={y + 4} textAnchor="end">{tick}</text>
              </g>
            );
          })}
          {xTickIndexes.map((index) => {
            const point = positionedPoints[index];
            if (point === undefined) return null;
            return (
              <text key={point.id} className="fill-muted-foreground text-[10px]" x={point.x} y={CHART_HEIGHT - 12} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}>
                {formatDate(point.occurredAt)}
              </text>
            );
          })}
          <polyline className="fill-none stroke-chart-4 stroke-[1.5] opacity-35 [stroke-linecap:round] [stroke-linejoin:round] [vector-effect:non-scaling-stroke]" points={actualLine} />
          {positionedPoints.map((point) => (
            <circle key={point.id} className="fill-chart-4 stroke-card stroke-[1.5] [vector-effect:non-scaling-stroke]" cx={point.x} cy={point.actualY} r="3.5" />
          ))}
          <polyline className="fill-none stroke-chart-2 stroke-[3] [stroke-linecap:round] [stroke-linejoin:round] [vector-effect:non-scaling-stroke]" points={averageLine} />
          {lastPoint !== undefined && (
            <>
              <circle className="fill-chart-2 stroke-card stroke-2 [vector-effect:non-scaling-stroke]" cx={lastPoint.x} cy={lastPoint.averageY} r="5" />
              <text className="fill-chart-2 text-[11px] font-bold" x={lastPoint.x - 9} y={lastPoint.averageY - 11} textAnchor="end">
                {lastPoint.movingAverage7DaysKg.toFixed(1)}
                {" "}
                kg
              </text>
            </>
          )}
          {hoveredPoint !== undefined && <line className="stroke-muted-foreground opacity-70 [stroke-dasharray:3_4] [vector-effect:non-scaling-stroke]" x1={hoveredPoint.x} x2={hoveredPoint.x} y1={PLOT_TOP} y2={CHART_HEIGHT - PLOT_BOTTOM} />}
        </svg>
        {hoveredPoint !== undefined && (
          <div
            className={cn(
              "pointer-events-none absolute z-10 grid min-w-36 translate-x-2.5 -translate-y-[calc(100%+10px)] gap-1 rounded-lg border bg-popover p-2.5 text-[0.65rem] text-popover-foreground shadow-xl",
              hoveredPoint.x > CHART_WIDTH * 0.7 && "-translate-x-[calc(100%+10px)]",
            )}
            style={{ left: `${(hoveredPoint.x / CHART_WIDTH) * 100}%`, top: `${(Math.min(hoveredPoint.actualY, hoveredPoint.averageY) / CHART_HEIGHT) * 100}%` }}
          >
            <strong className="text-xs">{new Date(hoveredPoint.occurredAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</strong>
            <span>
              実測
              {hoveredPoint.weightKg.toFixed(1)}
              {" "}
              kg
            </span>
            <span>
              7日平均
              {hoveredPoint.movingAverage7DaysKg.toFixed(2)}
              {" "}
              kg
            </span>
            <small className="text-muted-foreground">
              窓内
              {hoveredPoint.movingAverageWindowSamples}
              {" "}
              件
            </small>
          </div>
        )}
      </div>
      <figcaption className="flex justify-end gap-4 px-1 pt-1 text-[0.65rem] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <i className="block h-0.5 w-4 bg-chart-4" />
          実測値
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="block h-0.5 w-4 bg-chart-2" />
          7日移動平均
        </span>
      </figcaption>
    </figure>
  );
};
