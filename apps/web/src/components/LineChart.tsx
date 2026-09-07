type Point = {
  readonly label: string;
  readonly value: number;
  readonly secondaryValue?: number;
};

type Props = {
  readonly points: ReadonlyArray<Point>;
  readonly valueSuffix: string;
};

const WIDTH = 720;
const HEIGHT = 220;
const PADDING = 24;

const polyline = (values: ReadonlyArray<number>, minimum: number, range: number): string => {
  return values.map((value, index) => {
    const x = PADDING + index * ((WIDTH - PADDING * 2) / Math.max(1, values.length - 1));
    const y = HEIGHT - PADDING - ((value - minimum) / range) * (HEIGHT - PADDING * 2);
    return `${x},${y}`;
  }).join(" ");
};

export const LineChart = ({ points, valueSuffix }: Props) => {
  if (points.length === 0) return <EmptyState>表示する記録がありません。</EmptyState>;
  const values = points.flatMap((point) => point.secondaryValue === undefined
    ? [point.value]
    : [point.value, point.secondaryValue]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  return (
    <figure>
      <svg className="h-auto w-full overflow-visible" role="img" aria-label="推移グラフ" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <line className="stroke-border" x1={PADDING} y1={PADDING} x2={PADDING} y2={HEIGHT - PADDING} />
        <line className="stroke-border" x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} />
        <polyline className="fill-none stroke-chart-1 stroke-[3] [stroke-linecap:round] [stroke-linejoin:round] [vector-effect:non-scaling-stroke]" points={polyline(points.map((point) => point.value), minimum, range)} />
        {points.some((point) => point.secondaryValue !== undefined) && (
          <polyline className="fill-none stroke-chart-2 stroke-2 [stroke-dasharray:5_5] [stroke-linecap:round] [stroke-linejoin:round] [vector-effect:non-scaling-stroke]" points={polyline(points.map((point) => point.secondaryValue ?? point.value), minimum, range)} />
        )}
      </svg>
      <figcaption className="flex justify-between text-[0.65rem] text-muted-foreground">
        <span>{points[0]?.label}</span>
        <strong className="text-xs text-foreground tabular-nums">
          {points.at(-1)?.value.toLocaleString("ja-JP")}
          {valueSuffix}
        </strong>
        <span>{points.at(-1)?.label}</span>
      </figcaption>
    </figure>
  );
};
import { EmptyState } from "./DesignSystem";
