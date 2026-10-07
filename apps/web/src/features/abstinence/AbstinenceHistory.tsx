import type { AbstinenceEvent, AbstinenceGoal } from "@life-console/contracts";
import { useState } from "react";

import { Button } from "../../components/ui/Button";

const RECENT_EVENT_COUNT = 3;
const HISTORY_PAGE_SIZE = 20;

const formatDateTime = (value: string): string => new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const formatStreakDuration = (milliseconds: number): string => {
  const minutes = Math.floor(milliseconds / 60_000);
  return `${Math.floor(minutes / 1_440)} 日 ${Math.floor(minutes / 60) % 24} 時間 ${minutes % 60} 分`;
};

export const AbstinenceHistory = ({ goal, events }: { readonly goal: AbstinenceGoal; readonly events: ReadonlyArray<AbstinenceEvent> }) => {
  const [visiblePastCount, setVisiblePastCount] = useState(HISTORY_PAGE_SIZE);
  const orderedEvents = events.toSorted((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
  const remainingPastCount = orderedEvents.length - RECENT_EVENT_COUNT - visiblePastCount;
  const rows = orderedEvents.slice(0, RECENT_EVENT_COUNT + visiblePastCount).map((event, index) => {
    const startedAt = Math.max(Date.parse(goal.startedAt), Date.parse(orderedEvents[index + 1]?.occurredAt ?? goal.startedAt));
    const occurredAt = Date.parse(event.occurredAt);
    return (
      <li key={event.id} className={event.memo === "" ? "px-3 py-1 text-xs" : "rounded-xl bg-muted/30 p-3 text-xs"}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
          <span className="font-medium tabular-nums">{occurredAt < Date.parse(goal.startedAt) ? "現在の開始日時より前" : `${formatStreakDuration(occurredAt - startedAt)} 継続`}</span>
        </div>
        {event.memo !== "" && (
          <details className="mt-2 text-muted-foreground">
            <summary className="w-fit cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-ring">メモ</summary>
            <p className="mt-1 whitespace-pre-wrap break-words text-foreground">{event.memo}</p>
          </details>
        )}
      </li>
    );
  });
  return (
    <div className="mt-4 border-t pt-3">
      <p className="text-xs font-semibold text-muted-foreground">最近の中断</p>
      <ul className="mt-2 grid gap-2">{rows.slice(0, RECENT_EVENT_COUNT)}</ul>
      {orderedEvents.length > RECENT_EVENT_COUNT && (
        <details
          className="mt-3"
          onToggle={(event) => {
            if (!event.currentTarget.open) setVisiblePastCount(HISTORY_PAGE_SIZE);
          }}
        >
          <summary className="w-fit cursor-pointer rounded-sm py-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring">
            過去の中断を表示（
            {orderedEvents.length - RECENT_EVENT_COUNT}
            {" "}
            件）
          </summary>
          <ul className="mt-2 grid gap-2">{rows.slice(RECENT_EVENT_COUNT)}</ul>
          {remainingPastCount > 0 && (
            <Button variant="outline" className="mt-3" onClick={() => setVisiblePastCount((count) => count + HISTORY_PAGE_SIZE)}>
              さらに表示（次の
              {" "}
              {Math.min(HISTORY_PAGE_SIZE, remainingPastCount)}
              {" "}
              件）
            </Button>
          )}
        </details>
      )}
    </div>
  );
};
