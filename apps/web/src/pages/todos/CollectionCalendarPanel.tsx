import { collectionSettingsSchema, type CalendarEvent, type CollectionSettings } from "@life-console/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { api } from "../../api";
import { EmptyState, Field, FormError, Panel, SectionHeading } from "../../components/DesignSystem";
import { Button, buttonVariants } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { Textarea } from "../../components/ui/textarea";
import { collectionCalendarQuery, useRefreshCalendar } from "../../features/calendar/queries";
import { useJapanDate } from "../../features/calendar/use-japan-date";
import { PushNotificationSettings } from "../operations/PushNotificationSettings";

const dateLabel = (date: string) => `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日（${new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "UTC" }).format(new Date(date))}）`;

const CollectionSettingsForm = ({ settings }: { readonly settings: CollectionSettings | null }) => {
  const refresh = useRefreshCalendar();
  const [district, setDistrict] = useState(settings?.district ?? "");
  const [previousDayTime, setPreviousDayTime] = useState(settings?.previousDayTime ?? "");
  const [sameDayTime, setSameDayTime] = useState(settings?.sameDayTime ?? "");
  const [enabled, setEnabled] = useState(settings?.notificationsEnabled ?? false);
  const [inputError, setInputError] = useState<string | null>(null);
  const settingsDirty = district !== (settings?.district ?? "") || previousDayTime !== (settings?.previousDayTime ?? "") || sameDayTime !== (settings?.sameDayTime ?? "") || enabled !== (settings?.notificationsEnabled ?? false);
  useBlocker({ enableBeforeUnload: settingsDirty, shouldBlockFn: ({ next }) => settingsDirty && (next.routeId !== "/todos" || next.search.view !== "calendar") && !window.confirm("収集地区と通知の変更が未保存です。変更を破棄して移動しますか？") });
  const save = useMutation({ mutationFn: api.saveCollectionSettings, onSuccess: refresh });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = collectionSettingsSchema.safeParse({ district, previousDayTime: previousDayTime || null, sameDayTime: sameDayTime || null, notificationsEnabled: enabled });
    if (!parsed.success) {
      setInputError(parsed.error.issues[0]!.message);
      return;
    }
    setInputError(null);
    save.mutate(parsed.data);
  };
  return (
    <Panel mobileLayout="section">
      <SectionHeading eyebrow="Collection" title="収集地区と通知" />
      <form onSubmit={submit} className="space-y-4 sm:px-5">
        <p className="text-sm text-muted-foreground">徳島市の 2026 年度公式日程（2026 年 4 月〜2027 年 3 月）を取り込みます。建物のごみ置き場の案内と照合して、地区を選んでください。</p>
        <fieldset disabled={save.isPending} className="space-y-4">
          <Field label="収集地区">
            <NativeSelect aria-label="収集地区" required value={district} onChange={(event) => setDistrict(event.target.value)}>
              <option value="">地区を選択</option>
              <option value="D">D 地区（吉野本町の県道西側）</option>
              <option value="C">C 地区（吉野本町の県道東側）</option>
            </NativeSelect>
          </Field>
          <div className="flex flex-wrap gap-4">
            <Field label="前日通知（空欄なら通知しない）"><Input type="time" value={previousDayTime} onChange={(event) => setPreviousDayTime(event.target.value)} /></Field>
            <Field label="当日通知（8 時 30 分より前）"><Input type="time" max="08:29" value={sameDayTime} onChange={(event) => setSameDayTime(event.target.value)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            収集日の通知を有効にする
          </label>
          <p className="text-xs text-muted-foreground">通知を許可した端末へ送ります。準備を完了した回は、残りの通知を止めます。</p>
          <Button type="submit">{save.isPending ? "保存中" : "収集地区と通知を保存"}</Button>
        </fieldset>
        {(inputError ?? save.error?.message) && <FormError>{inputError ?? save.error?.message}</FormError>}
        {save.isSuccess && !settingsDirty && <p role="status" className="text-sm">収集地区と通知を保存しました。</p>}
      </form>
    </Panel>
  );
};

const CalendarEventEditor = ({ event }: { readonly event: CalendarEvent }) => {
  const refresh = useRefreshCalendar();
  const [date, setDate] = useState(event.date);
  const [notes, setNotes] = useState(event.notes);
  const [canceled, setCanceled] = useState(event.status === "canceled");
  const eventDirty = date !== event.date || notes !== event.notes || canceled !== (event.status === "canceled");
  useBlocker({ enableBeforeUnload: eventDirty, shouldBlockFn: ({ next }) => eventDirty && (next.routeId !== "/todos" || next.search.view !== "calendar" || next.search.eventId !== event.id) && !window.confirm("収集日の変更が未保存です。変更を破棄して移動しますか？") });
  const save = useMutation({ mutationFn: () => api.updateCalendarEvent(event.id, { date, notes, status: canceled ? "canceled" : "active", updatedAt: event.updatedAt }), onSuccess: refresh });
  const preparation = useMutation({ mutationFn: () => api.addCalendarPreparation(event.id), onSuccess: refresh });
  const complete = useMutation({ mutationFn: () => api.updateTask(event.preparation!.id, { status: event.preparation!.status === "done" ? "todo" : "done" }), onSuccess: refresh });
  const submit = (form: FormEvent) => {
    form.preventDefault();
    save.mutate();
  };
  return (
    <Panel className="px-4" aria-label="収集日の詳細">
      <h3 className="text-lg font-semibold">
        {dateLabel(event.date)}
        の
        {event.title}
      </h3>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <fieldset disabled={save.isPending} className="space-y-4">
          <Field label="収集日"><Input type="date" required min="2026-04-01" max="2027-03-31" value={date} onChange={(form) => setDate(form.target.value)} /></Field>
          <Field label="出し方・変更のメモ"><Textarea maxLength={2000} value={notes} onChange={(form) => setNotes(form.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={canceled} onChange={(form) => setCanceled(form.target.checked)} />
            この回の収集を中止する
          </label>
          <p className="text-xs text-muted-foreground">この回だけ変更します。中止しても準備タスクは残り、未送信の通知を止めます。</p>
          <Button type="submit">{save.isPending ? "保存中" : "収集日の変更を保存"}</Button>
        </fieldset>
        {save.error && <FormError>{save.error.message}</FormError>}
      </form>
      <div className="mt-5 space-y-3 border-t pt-4">
        {event.preparation === null
          ? <Button variant="outline" disabled={preparation.isPending || event.status === "canceled"} onClick={() => preparation.mutate()}>この回の準備を追加</Button>
          : (
              <>
                <p className="text-sm">
                  準備：
                  {event.preparation.title}
                  （
                  {event.preparation.status === "done" ? "完了" : event.preparation.status === "canceled" ? "中止" : "未完了"}
                  ）
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={complete.isPending} onClick={() => complete.mutate()}>{event.preparation.status === "done" ? "準備を未完了に戻す" : "準備を完了する"}</Button>
                  <Link from="/todos" to="/todos" search={{ view: "personal", taskId: event.preparation.id }} className={buttonVariants({ variant: "outline", size: "sm" })}>準備タスクを編集</Link>
                </div>
              </>
            )}
        {(preparation.error ?? complete.error) && <FormError>{(preparation.error ?? complete.error)!.message}</FormError>}
        <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">公式の収集日程を確認</a>
      </div>
    </Panel>
  );
};

export const CollectionCalendarPanel = () => {
  const search = useSearch({ from: "/todos" });
  const navigate = useNavigate({ from: "/todos" });
  const calendar = useQuery(collectionCalendarQuery);
  const today = useJapanDate();
  const month = search.month ?? today.slice(0, 7);
  const monthStart = new Date(`${month}-01T00:00:00Z`);
  const dayCount = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  const events = calendar.data?.events ?? [];
  const monthEvents = events.filter((event) => event.date.startsWith(month));
  const selected = events.find((event) => event.id === search.eventId);
  const selectedId = selected?.id;
  const detail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId !== undefined) {
      detail.current!.scrollIntoView({ block: "start" });
      detail.current!.focus({ preventScroll: true });
    }
  }, [selectedId]);
  const next = events.find((event) => event.status === "active" && event.date >= today);
  const cells = Array.from({ length: Math.ceil((monthStart.getUTCDay() + dayCount) / 7) * 7 }, (_, index) => index < monthStart.getUTCDay() || index >= monthStart.getUTCDay() + dayCount ? null : `${month}-${String(index - monthStart.getUTCDay() + 1).padStart(2, "0")}`);
  if (calendar.isPending) return <p role="status">収集カレンダーを読み込んでいます。</p>;
  if (calendar.error) return (
    <div className="space-y-3">
      <FormError>{calendar.error.message}</FormError>
      <Button variant="outline" onClick={() => { void calendar.refetch(); }}>再読み込み</Button>
    </div>
  );
  const details = calendar.data;
  return (
    <div className="space-y-6">
      <CollectionSettingsForm settings={details.settings} />
      {details.settings === null
        ? <EmptyState>地区を選んで保存すると、収集日が表示されます。</EmptyState>
        : (
            <Panel mobileLayout="section">
              <SectionHeading eyebrow="Calendar" title={`徳島市 ${details.settings.district} 地区の収集カレンダー`} />
              <div className="space-y-4 sm:px-5">
                {next && (
                  <p className="text-sm">
                    次の収集：
                    {dateLabel(next.date)}
                    {" "}
                    {next.title}
                  </p>
                )}
                <Field label="表示する月"><Input type="month" min="2026-04" max="2027-03" value={month} onChange={(event) => { if (event.target.value) void navigate({ search: (previous) => ({ ...previous, month: event.target.value }) }); }} /></Field>
                {month < "2026-04" || month > "2027-03"
                  ? <EmptyState>この月の公式日程はまだ取り込まれていません。</EmptyState>
                  : (
                      <>
                        <table className="w-full table-fixed border-collapse text-xs" aria-label={`${month} の収集カレンダー`}>
                          <thead><tr>{["日", "月", "火", "水", "木", "金", "土"].map((day) => <th key={day} scope="col" className="border bg-muted p-2 text-center">{day}</th>)}</tr></thead>
                          <tbody>
                            {Array.from({ length: cells.length / 7 }, (_, week) => (
                              <tr key={week}>
                                {cells.slice(week * 7, week * 7 + 7).map((date, index) => (
                                  <td key={date ?? `empty-${index}`} className="h-20 min-w-0 border bg-card p-1 align-top sm:h-24 sm:p-2">
                                    {date !== null && (
                                      <>
                                        <span className="font-semibold">{Number(date.slice(8))}</span>
                                        <div className="mt-1 space-y-1">{monthEvents.filter((event) => event.date === date && event.status === "active").map((event) => <Link key={event.id} from="/todos" to="/todos" search={(previous) => ({ ...previous, eventId: event.id })} className="block truncate rounded bg-accent px-1 py-1 text-[0.65rem] text-accent-foreground" title={`${dateLabel(date)} ${event.title}`}>{event.title}</Link>)}</div>
                                      </>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <ul className="divide-y">
                          {monthEvents.map((event) => (
                            <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                              <Link from="/todos" to="/todos" search={(previous) => ({ ...previous, eventId: event.id })} className="text-primary underline">
                                {dateLabel(event.date)}
                                {" "}
                                {event.title}
                              </Link>
                              <span className="text-xs text-muted-foreground">{event.status === "canceled" ? "収集中止" : event.preparation?.status === "done" ? "準備完了" : event.preparation !== null ? "準備あり" : ""}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                <p className="text-xs text-muted-foreground">適用期間：2026 年 4 月〜2027 年 3 月。建物独自の回収日程は含みません。</p>
                <a href={details.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">徳島市の公式収集日程</a>
              </div>
            </Panel>
          )}
      {selected && <div ref={detail} tabIndex={-1}><CalendarEventEditor key={`${selected.id}:${selected.updatedAt}`} event={selected} /></div>}
      {search.eventId && !selected && <EmptyState>この収集日は、現在選択している地区の日程にはありません。</EmptyState>}
      <PushNotificationSettings />
    </div>
  );
};
