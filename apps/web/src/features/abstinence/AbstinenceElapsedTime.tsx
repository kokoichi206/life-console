import type { AbstinenceEvent, AbstinenceGoal } from "@life-console/contracts";
import { useEffect, useState } from "react";

export const AbstinenceElapsedTime = ({ goal, events }: { readonly goal: AbstinenceGoal; readonly events: ReadonlyArray<AbstinenceEvent> }) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);
  const startedAt = events.reduce((latest, event) => Math.max(latest, Date.parse(event.occurredAt)), Date.parse(goal.startedAt));
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1_000));
  const units = [
    { label: "日", value: Math.floor(totalSeconds / 86_400) },
    { label: "時間", value: Math.floor(totalSeconds / 3_600) % 24 },
    { label: "分", value: Math.floor(totalSeconds / 60) % 60 },
    { label: "秒", value: totalSeconds % 60 },
  ];
  return (
    <h2 className="mt-1">
      <span role="timer" aria-label="禁欲の経過時間" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
        {units.map(({ label, value }) => (
          <span key={label} className="whitespace-nowrap text-3xl font-semibold tracking-tight sm:text-4xl">
            {value}
            {" "}
            <span className="text-sm font-normal text-muted-foreground">{label}</span>
          </span>
        ))}
      </span>
      <span className="mt-1 block text-sm font-normal text-muted-foreground">継続中</span>
    </h2>
  );
};
