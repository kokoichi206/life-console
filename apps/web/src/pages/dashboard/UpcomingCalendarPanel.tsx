import type { CalendarEvent } from "@life-console/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { api } from "../../api";
import { EmptyState, FormError, Panel, SectionHeading } from "../../components/DesignSystem";
import { Badge } from "../../components/ui/badge";
import { Button, buttonVariants } from "../../components/ui/Button";
import { collectionCalendarQuery, useRefreshCalendar } from "../../features/calendar/queries";
import { upcomingCalendar } from "../../features/calendar/upcoming-calendar";
import { useJapanDate } from "../../features/calendar/use-japan-date";

const EventLink = ({ event, children }: { readonly event: CalendarEvent; readonly children: ReactNode }) => (
  <Link to="/todos" search={{ view: "calendar", month: event.date.slice(0, 7), eventId: event.id }} className="text-sm font-medium text-primary underline underline-offset-4">{children}</Link>
);

export const UpcomingCalendarPanel = () => {
  const calendar = useQuery(collectionCalendarQuery);
  const refresh = useRefreshCalendar();
  const complete = useMutation({ mutationFn: (id: string) => api.updateTask(id, { status: "done" }), onSuccess: refresh });
  const today = useJapanDate();
  const upcoming = upcomingCalendar(calendar.data?.events ?? [], new Date(`${today}T00:00:00+09:00`));
  return (
    <Panel mobileLayout="section" className="mb-6">
      <SectionHeading eyebrow="Upcoming" title="今日・明日の予定と準備" action={<Link to="/todos" search={{ view: "calendar" }} className={buttonVariants({ variant: "link", size: "sm" })}>カレンダー</Link>} />
      <div className="space-y-4 sm:px-5">
        {calendar.isPending
          ? <p role="status" className="text-sm">予定を読み込んでいます。</p>
          : calendar.error
            ? (
                <div className="space-y-3">
                  <FormError>{calendar.error.message}</FormError>
                  <Button variant="outline" onClick={() => { void calendar.refetch(); }}>予定を再読み込み</Button>
                </div>
              )
            : calendar.data.settings === null
              ? (
                  <EmptyState>カレンダーで収集地区を設定すると、ごみ収集の予定が表示されます。</EmptyState>
                )
              : upcoming.days.map((day, index) => (
                  <section key={day.date} aria-label={index === 0 ? "今日の予定と準備" : "明日の予定と準備"} className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
                    <h3 className="text-sm font-semibold">
                      {index === 0 ? "今日" : "明日"}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {Number(day.date.slice(5, 7))}
                        {" "}
                        月
                        {" "}
                        {Number(day.date.slice(8))}
                        {" "}
                        日
                      </span>
                    </h3>
                    {day.preparations.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground">必要な準備</h4>
                        {day.preparations.map((event) => (
                          <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent/40 p-3">
                            <div className="min-w-0 space-y-1">
                              <EventLink event={event}>{event.preparation!.title}</EventLink>
                              <p className="text-xs text-muted-foreground">{`予定：${Number(event.date.slice(5, 7))} 月 ${Number(event.date.slice(8))} 日 ${event.title}`}</p>
                            </div>
                            <Button variant="outline" size="sm" disabled={complete.isPending} aria-label={`${event.preparation!.title}を完了する`} onClick={() => complete.mutate(event.preparation!.id)}>{complete.isPending && complete.variables === event.preparation!.id ? "保存中" : "準備を完了"}</Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {day.date >= calendar.data.validFrom && day.date <= calendar.data.validThrough && day.events.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-muted-foreground">予定</h4>
                        {day.events.map((event) => (
                          <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                            <div>
                              <EventLink event={event}>{event.title}</EventLink>
                              <p className="mt-1 text-xs text-muted-foreground">ごみ収集 · 午前 8 時 30 分まで</p>
                            </div>
                            <Badge variant="secondary">{event.preparation === null ? "準備未登録" : event.preparation.status === "done" ? "準備完了" : event.preparation.status === "canceled" ? "準備中止" : "準備未完了"}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                    {(day.date < calendar.data.validFrom || day.date > calendar.data.validThrough) && <EmptyState>この日の収集日程は未登録です。公式の日程を確認してください。</EmptyState>}
                    {day.date >= calendar.data.validFrom && day.date <= calendar.data.validThrough && day.preparations.length === 0 && day.events.length === 0 && <p className="text-sm text-muted-foreground">登録されている予定・準備はありません。</p>}
                  </section>
                ))}
        {complete.error && <FormError>{complete.error.message}</FormError>}
        <p className="text-xs text-muted-foreground">現在はごみ収集の予定を表示しています。準備は必要な回にカレンダーから追加できます。</p>
      </div>
    </Panel>
  );
};
