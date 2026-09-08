import type { WeightGoal } from "@life-console/contracts";

import { Panel } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";

export const WeightGoalProgress = ({ goal, latestWeight, onEdit }: {
  readonly goal: WeightGoal | null;
  readonly latestWeight: number | undefined;
  readonly onEdit: () => void;
}) => {
  if (goal === null) return (
    <Panel className="mb-4 flex-row items-center justify-between gap-3 rounded-3xl px-5">
      <div>
        <h2 className="text-sm font-semibold">体重の目標</h2>
        <p className="mt-1 text-xs text-muted-foreground">目標体重と期限を決めて、進捗を確認</p>
      </div>
      <Button variant="outline" className="h-11 rounded-xl" onClick={onEdit}>目標を設定</Button>
    </Panel>
  );
  const difference = latestWeight === undefined ? undefined : latestWeight - goal.startWeightKg;
  const goalDifference = goal.targetWeightKg - goal.startWeightKg;
  const progress = difference === undefined ? 0 : goalDifference === 0 ? (latestWeight === goal.targetWeightKg ? 1 : 0) : Math.min(1, Math.max(0, difference / goalDifference));
  return (
    <Panel className="mb-4 rounded-3xl px-5">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">体重の目標</h2>
        <Button variant="ghost" className="h-10 text-primary" onClick={onEdit}>目標を編集</Button>
      </header>
      <div className="relative mx-auto mt-2 w-full max-w-80">
        <svg viewBox="0 0 320 175" className="w-full" role="img" aria-label={`目標の達成率 ${Math.round(progress * 100)}%`}>
          <path d="M 20 155 A 140 140 0 0 1 300 155" pathLength="100" className="fill-none stroke-primary/15 stroke-[11]" strokeLinecap="round" />
          <path d="M 20 155 A 140 140 0 0 1 300 155" pathLength="100" className="fill-none stroke-primary stroke-[11]" strokeDasharray={`${progress * 100} 100`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-x-0 bottom-5 text-center">
          <p className="text-4xl font-semibold tracking-tight tabular-nums">
            {difference === undefined ? "—" : `${difference > 0 ? "+" : ""}${difference.toFixed(1)}`}
            <span className="ml-1 text-xl">kg</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{latestWeight === undefined ? "記録を追加してください" : `${Math.round(progress * 100)}% 達成`}</p>
        </div>
      </div>
      <dl className="mx-auto mt-2 grid w-full max-w-sm grid-cols-3 text-center">
        {([["開始", goal.startWeightKg], ["現在", latestWeight], ["目標", goal.targetWeightKg]] as const).map(([label, weight]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {weight?.toFixed(1) ?? "—"}
              <span className="ml-1 text-xs font-normal text-muted-foreground">kg</span>
            </dd>
          </div>
        ))}
      </dl>
      {goal.targetDate !== null && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {`期限 ${goal.targetDate.replaceAll("-", "/")}`}
        </p>
      )}
    </Panel>
  );
};
