import { type ReplyCalendarRequest } from "@life-console/contracts";
import { err, ok, type Result } from "@life-console/core";
import { z } from "zod";

import { runnerError, type RunnerError } from "../errors";

import type { CommandRepository } from "./command-repository";
import { parseCliJson } from "./connectors";
import { resolveGmailAccount } from "./gmail-connector";

const busyIntervalSchema = z.object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) })
  .refine((interval) => Date.parse(interval.start) < Date.parse(interval.end));
const freebusySchema = z.object({ calendars: z.object({ primary: z.object({
  // gog の Go SDK は空の busy 配列を omitempty で省略する。
  busy: z.array(busyIntervalSchema).default([]),
  errors: z.array(z.object({ reason: z.string() })).optional(),
}) }) });

export type ReplyCalendarSlot = { readonly id: string; readonly start: string; readonly end: string; readonly label: string };
export type ReplyCalendarContext = {
  readonly account: string;
  readonly checkedAt: string;
  readonly request: ReplyCalendarRequest;
  readonly slots: ReadonlyArray<ReplyCalendarSlot>;
};

export const availableReplySlots = (request: ReplyCalendarRequest, busy: ReadonlyArray<z.infer<typeof busyIntervalSchema>>, now: Date): ReadonlyArray<ReplyCalendarSlot> => {
  const slots: ReplyCalendarSlot[] = [];
  const dateLabel = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
  const timeLabel = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let day = Date.parse(request.from); day <= Date.parse(request.through); day += 86_400_000) {
    const date = new Date(day);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const ymd = date.toISOString().slice(0, 10);
    const dayEnd = Date.parse(`${ymd}T${request.dayEnd}:00+09:00`);
    for (let start = Date.parse(`${ymd}T${request.dayStart}:00+09:00`); start + request.durationMinutes * 60_000 <= dayEnd; start += 30 * 60_000) {
      const end = start + request.durationMinutes * 60_000;
      if (start <= now.getTime() || busy.some((interval) => start < Date.parse(interval.end) && end > Date.parse(interval.start))) continue;
      slots.push({ id: String(slots.length), start: new Date(start).toISOString(), end: new Date(end).toISOString(),
        label: `${dateLabel.format(start)} ${timeLabel.format(start)}〜${timeLabel.format(end)}（日本時間）` });
    }
  }
  return slots;
};

export interface ReplyCalendarRepository {
  read(request: ReplyCalendarRequest, signal: AbortSignal): Promise<Result<ReplyCalendarContext, RunnerError>>;
}

export const createReplyCalendarRepository = (commands: CommandRepository, gmailAccount: string | undefined): ReplyCalendarRepository => ({
  async read(request, signal) {
    const account = await resolveGmailAccount(commands, gmailAccount, signal);
    if (!account.ok) return account;
    const checkedAt = new Date();
    const exclusiveEnd = new Date(Date.parse(`${request.through}T00:00:00+09:00`) + 86_400_000).toISOString();
    const fetched = await commands.execute("gog", ["calendar", "freebusy", "primary", "--account", account.value,
      "--from", `${request.from}T00:00:00+09:00`, "--to", exclusiveEnd,
      "--json", "--no-input", "--gmail-no-send", "--enable-commands-exact", "calendar.freebusy"], { signal });
    if (!fetched.ok) return err(runnerError("calendar_read_failed", "カレンダーを取得できませんでした。空き時間は未確認です。gog の認証と Calendar 権限を確認してください。", fetched.error));
    const parsed = await parseCliJson(fetched.value.stdout, freebusySchema);
    if (!parsed.ok) return parsed;
    const calendar = parsed.value.calendars.primary;
    if ((calendar.errors?.length ?? 0) > 0) {
      return err(runnerError("calendar_freebusy_incomplete", "カレンダーの空き時間を確認できませんでした。空きとして扱わず、作成を中止しました。"));
    }
    return ok({ account: account.value, checkedAt: checkedAt.toISOString(), request,
      slots: availableReplySlots(request, calendar.busy, checkedAt) });
  },
});
