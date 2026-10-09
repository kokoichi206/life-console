import type { CSSProperties } from "react";

import { formatPfcGrams, pfcEnergyPercentages, type PfcGrams } from "../nutrition-summary";
import { pfcDifference } from "../pfc-review";

const nutrients = [
  { key: "proteinGrams", percentKey: "proteinPercent", letter: "P", label: "たんぱく質", color: "bg-chart-1" },
  { key: "fatGrams", percentKey: "fatPercent", letter: "F", label: "脂質", color: "bg-chart-2" },
  { key: "carbohydrateGrams", percentKey: "carbohydratePercent", letter: "C", label: "炭水化物", color: "bg-chart-3" },
] as const;

export const PfcNutrients = ({ grams, goal, complete = true }: { readonly grams: PfcGrams; readonly goal?: PfcGrams; readonly complete?: boolean }) => {
  const scale = goal === undefined ? 1 : Math.max(1.25, ...nutrients.map(({ key }) => grams[key] / goal[key]));
  return (
    <dl className="grid grid-cols-3 gap-2 sm:gap-3">
      {nutrients.map(({ key, letter, label, color }) => {
        const difference = goal === undefined ? undefined : pfcDifference(grams[key], goal[key]);
        return (
          <div key={key} className={`min-w-0 rounded-xl border p-2.5 sm:p-4 ${difference !== undefined && difference > 0 ? "border-warning/60 bg-warning/5" : ""}`}>
            <dt className="min-h-8 text-[0.65rem] sm:min-h-0 sm:text-xs">
              <span aria-hidden="true" className={`mr-1 inline-block size-1.5 rounded-full ${color}`} />
              {`${letter} ${label}`}
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">
              {formatPfcGrams(grams[key])}
              {" "}
              <span className="text-xs font-normal text-muted-foreground">g</span>
            </dd>
            {goal !== undefined && difference !== undefined && (
              <>
                <dd className="mt-2 text-[0.65rem] text-muted-foreground sm:text-xs">{`計算例 約 ${formatPfcGrams(goal[key])} g / 日`}</dd>
                <dd className="mt-3">
                  <div aria-hidden="true" className="relative flex h-2 rounded-full bg-muted">
                    <span className={`h-full w-(--pfc-fill) rounded-l-full ${color}`} style={{ "--pfc-fill": `${Math.min(grams[key] / goal[key], 1) / scale * 100}%` } as CSSProperties} />
                    <span className="h-full w-(--pfc-over) rounded-r-full bg-warning bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--foreground)_3px_4px)]" style={{ "--pfc-over": `${Math.max(grams[key] / goal[key] - 1, 0) / scale * 100}%` } as CSSProperties} />
                    <span className="absolute -top-1 left-(--pfc-marker) h-4 border-l-2 border-foreground" style={{ "--pfc-marker": `${100 / scale}%` } as CSSProperties} />
                  </div>
                  <span className="mt-2 block text-[0.65rem] font-medium sm:text-xs">
                    {difference > 0 ? `計算例より +${formatPfcGrams(difference)} g` : !complete ? "未解析あり" : difference < 0 ? `計算例より −${formatPfcGrams(-difference)} g` : "計算例と同じ"}
                  </span>
                </dd>
              </>
            )}
          </div>
        );
      })}
    </dl>
  );
};

export const PfcComposition = ({ grams, label, showLegend = true }: { readonly grams: PfcGrams; readonly label: string; readonly showLegend?: boolean }) => {
  const percentages = pfcEnergyPercentages(grams);
  if (percentages === undefined) return <p className="text-xs text-foreground">PFC は全て 0 g のため、構成比はありません。</p>;
  return (
    <div className="space-y-2">
      <div role="img" aria-label={`${label}：${nutrients.map(({ percentKey, letter }) => `${letter} ${percentages[percentKey].toFixed(1)} %`).join("、")}`} className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {nutrients.map(({ key, percentKey, color }) => <span key={key} className={`h-full w-(--pfc-width) ${color}`} style={{ "--pfc-width": `${percentages[percentKey]}%` } as CSSProperties} />)}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem] text-muted-foreground sm:text-xs">
          {nutrients.map(({ key, percentKey, letter, color }) => (
            <span key={key}>
              <span aria-hidden="true" className={`mr-1 inline-block size-1.5 rounded-full ${color}`} />
              {`${letter} ${percentages[percentKey].toFixed(1)} %`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
