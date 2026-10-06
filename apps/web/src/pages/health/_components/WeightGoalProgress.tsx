import { weightCalendarDate, type WeightGoal } from "@life-console/contracts";
import { useEffect, useState } from "react";

import { Panel } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";

export const WeightGoalProgress = ({ goal, latestWeight, onEdit, readOnly = false }: {
  readonly goal: WeightGoal | null;
  readonly latestWeight: number | undefined;
  readonly readOnly?: boolean;
  readonly onEdit: () => void;
}) => {
  const [today, setToday] = useState(() => weightCalendarDate(new Date().toISOString()));
  useEffect(() => {
    const interval = window.setInterval(() => setToday(weightCalendarDate(new Date().toISOString())), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  if (goal === null) return (
    <Panel mobileLayout="section" className="mb-4 flex-row items-center justify-between gap-3 rounded-3xl px-5 max-sm:border-t-0 max-sm:border-b">
      <div>
        <h2 className="text-xl font-semibold sm:text-sm">体重の目標</h2>
        <p className="mt-1 text-xs text-muted-foreground">目標体重と期限を決めて、進捗を確認</p>
      </div>
      <Button disabled={readOnly} variant="outline" className="h-11 rounded-xl" onClick={onEdit}>目標を設定</Button>
    </Panel>
  );
  const difference = latestWeight === undefined ? undefined : latestWeight - goal.startWeightKg;
  const goalDifference = goal.targetWeightKg - goal.startWeightKg;
  const progress = difference === undefined ? 0 : goalDifference === 0 ? (latestWeight === goal.targetWeightKg ? 1 : 0) : Math.min(1, Math.max(0, difference / goalDifference));
  const duration = goal.startDate === null || goal.targetDate === null ? null : Date.parse(goal.targetDate) - Date.parse(goal.startDate);
  const dateProgress = goal.startDate === null || duration === null ? null : duration === 0 ? (today >= goal.startDate ? 1 : 0) : Math.min(1, Math.max(0, (Date.parse(today) - Date.parse(goal.startDate)) / duration));
  return (
    <Panel mobileLayout="section" className="mb-4 rounded-3xl px-5 max-sm:border-t-0 max-sm:border-b">
      <header className="flex items-center justify-between">
        <h2 className="text-xl font-semibold sm:text-sm">体重の目標</h2>
        <Button disabled={readOnly} variant="ghost" className="h-10 text-primary" onClick={onEdit}>目標を編集</Button>
      </header>
      <div className="relative mx-auto mt-2 w-full max-w-80">
        <svg viewBox="0 0 320 175" className="w-full" role="img" aria-label={goal.startDate === null ? `目標の達成率 ${Math.round(progress * 100)}%` : `体重 ${Math.round(progress * 100)}% 達成、日付 ${dateProgress === null ? "未設定" : `${Math.round(dateProgress * 100)}% 経過`}`}>
          <path d="M 20 155 A 140 140 0 0 1 300 155" pathLength="100" className="fill-none stroke-primary/15 stroke-[11]" strokeLinecap="round" />
          <path d="M 20 155 A 140 140 0 0 1 300 155" pathLength="100" className="fill-none stroke-primary stroke-[11]" strokeDasharray={`${progress * 100} 100`} strokeLinecap="round" />
          {goal.startDate !== null && <path d="M 40 155 A 120 120 0 0 1 280 155" pathLength="100" className="fill-none stroke-chart-2/15 stroke-[11]" strokeLinecap="round" />}
          {dateProgress !== null && <path d="M 40 155 A 120 120 0 0 1 280 155" pathLength="100" className="fill-none stroke-chart-2 stroke-[11]" strokeDasharray={`${dateProgress * 100} 100`} strokeLinecap="round" />}
        </svg>
        <div className="absolute inset-x-0 bottom-5 text-center">
          <p className="text-4xl font-semibold tracking-tight tabular-nums">
            {difference === undefined ? "—" : `${difference > 0 ? "+" : ""}${difference.toFixed(1)}`}
            <span className="ml-1 text-xl">kg</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{latestWeight === undefined ? "記録がありません" : `${Math.round(progress * 100)}% 達成`}</p>
        </div>
      </div>
      {goal.startDate !== null && (
        <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs">
          <p className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
            体重
            {" "}
            {latestWeight === undefined ? "記録なし" : `${Math.round(progress * 100)}% 達成`}
          </p>
          <p className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2 rounded-full bg-chart-2" />
            日付
            {" "}
            {dateProgress === null ? "未設定" : `${Math.round(dateProgress * 100)}% 経過`}
          </p>
        </div>
      )}
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
      {goal.startDate !== null
        ? (
            <dl className="mx-auto mt-4 grid w-full max-w-sm grid-cols-3 text-center">
              {([["開始日", goal.startDate], ["今日", today], ["期限", goal.targetDate]] as const).map(([label, date]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-xs tabular-nums">{date?.replaceAll("-", "/") ?? "未設定"}</dd>
                </div>
              ))}
            </dl>
          )
        : goal.targetDate !== null && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {`期限 ${goal.targetDate.replaceAll("-", "/")}`}
          </p>
        )}
    </Panel>
  );
};
