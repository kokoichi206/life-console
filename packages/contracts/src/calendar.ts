import { calendarEventSources, calendarEventStatuses, tokushimaCollectionDistricts } from "@life-console/domain";
import { z } from "zod";

const notificationTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u).nullable();
export const collectionSettingsSchema = z.object({
  district: z.enum(tokushimaCollectionDistricts),
  previousDayTime: notificationTime,
  sameDayTime: notificationTime,
  notificationsEnabled: z.boolean(),
}).refine((input) => !input.notificationsEnabled || input.previousDayTime !== null || input.sameDayTime !== null, { message: "通知する時刻を指定してください。" })
  .refine((input) => input.sameDayTime === null || input.sameDayTime < "08:30", { path: ["sameDayTime"], message: "当日通知は収集期限の 8 時 30 分より前にしてください。" });
export const calendarRangeSchema = z.object({ from: z.iso.date(), through: z.iso.date() })
  .refine((input) => input.from <= input.through && Date.parse(input.through) - Date.parse(input.from) <= 366 * 86_400_000, { message: "表示期間は 1 年以内にしてください。" });
export const updateCalendarEventSchema = z.object({
  date: z.iso.date().refine((date) => date >= "2026-04-01" && date <= "2027-03-31", "登録できる日付は 2026 年度内です。"),
  notes: z.string().trim().max(2000),
  status: z.enum(calendarEventStatuses),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type CollectionSettings = z.infer<typeof collectionSettingsSchema>;
export type CalendarRange = z.infer<typeof calendarRangeSchema>;
export type UpdateCalendarEvent = z.infer<typeof updateCalendarEventSchema>;
export type CalendarEvent = {
  readonly id: string; readonly source: typeof calendarEventSources[number]; readonly sourceKey: string;
  readonly title: string; readonly date: string; readonly notes: string; readonly status: typeof calendarEventStatuses[number];
  readonly sourceUrl: string; readonly updatedAt: string;
  readonly preparation: { readonly id: string; readonly status: string; readonly title: string; readonly dueAt: string | null } | null;
};
export type CollectionCalendar = {
  readonly settings: CollectionSettings | null;
  readonly events: ReadonlyArray<CalendarEvent>;
  readonly validFrom: string; readonly validThrough: string; readonly sourceUrl: string;
};
