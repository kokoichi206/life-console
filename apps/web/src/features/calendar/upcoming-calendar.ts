import type { CalendarEvent } from "@life-console/contracts";

export const japanDate = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}-${parts.find((part) => part.type === "day")!.value}`;
};

export const upcomingCalendar = (events: ReadonlyArray<CalendarEvent>, now = new Date()) => {
  const today = japanDate(now);
  const tomorrow = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
  const active = events.filter((event) => event.status === "active");
  const preparationDate = (event: CalendarEvent) => event.preparation!.dueAt === null ? event.date : japanDate(new Date(event.preparation!.dueAt));
  const preparations = active.filter((event) => event.preparation !== null && event.preparation.status !== "done" && event.preparation.status !== "canceled")
    .toSorted((left, right) => preparationDate(left).localeCompare(preparationDate(right)) || left.title.localeCompare(right.title, "ja"));
  return { today, tomorrow, days: [today, tomorrow].map((date) => ({
    date,
    preparations: preparations.filter((event) => date === today ? preparationDate(event) <= today : preparationDate(event) === tomorrow),
    events: active.filter((event) => event.date === date).toSorted((left, right) => left.title.localeCompare(right.title, "ja")),
  })) };
};
