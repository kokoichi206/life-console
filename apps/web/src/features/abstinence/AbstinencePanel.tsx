import { Dialog } from "@base-ui/react/dialog";
import type { AbstinenceGoalInput } from "@life-console/contracts";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api } from "../../api";
import { Field, FormError, Panel } from "../../components/DesignSystem";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";

import { abstinenceQuery } from "./queries";

const localDateTimeValue = (value: string): string => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const formatDateTime = (value: string): string => new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const formatDuration = (minutes: number): string => minutes < 60 ? String(minutes) + " 分" : String(Math.floor(minutes / 60)) + " 時間 " + String(minutes % 60) + " 分";

const GoalDialog = ({ open, onOpenChange, goal }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void; readonly goal: AbstinenceGoalInput | null }) => {
  const client = useQueryClient();
  const [name, setName] = useState(goal?.name ?? "");
  const [startedAt, setStartedAt] = useState(localDateTimeValue(goal?.startedAt ?? new Date().toISOString()));
  const [targetDays, setTargetDays] = useState(String(goal?.targetDays ?? 30));
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const save = useMutation({
    mutationFn: api.saveAbstinenceGoal,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: abstinenceQuery.queryKey });
      onOpenChange(false);
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate({ name, startedAt: new Date(startedAt).toISOString(), targetDays: Number(targetDays), targetDate: targetDate === "" ? null : targetDate });
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 max-h-[95dvh] overflow-y-auto rounded-t-3xl bg-card p-6 pb-[max(24px,env(safe-area-inset-bottom))] text-foreground shadow-2xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
          <header className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-xl font-semibold">禁欲目標を設定</Dialog.Title>
              <Dialog.Description className="mt-2 text-xs text-muted-foreground">避けたい行動と、我慢を始めた日時を記録します。</Dialog.Description>
            </div>
            <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="禁欲目標の設定を閉じる" />}><X /></Dialog.Close>
          </header>
          <form onSubmit={submit} className="mt-6 grid gap-5">
            <fieldset disabled={save.isPending} className="grid gap-5">
              <Field label="禁欲対象"><Input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="例: 夜更かし" /></Field>
              <Field label="開始日時"><Input required type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} /></Field>
              <Field label="目標日数"><Input required type="number" min="1" max="100000" step="1" inputMode="numeric" value={targetDays} onChange={(event) => setTargetDays(event.target.value)} /></Field>
              <Field label="目標日（任意）"><Input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></Field>
              <Button type="submit" className="h-11 rounded-xl">{save.isPending ? "保存しています…" : "目標を保存"}</Button>
              {goal !== null && <Button type="button" variant="ghost" onClick={() => save.mutate(null)}>目標を解除</Button>}
            </fieldset>
          </form>
          {save.error !== null && <div className="mt-3"><FormError>{save.error.message}</FormError></div>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const EventDialog = ({ open, onOpenChange }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void }) => {
  const client = useQueryClient();
  const [occurredAt, setOccurredAt] = useState(localDateTimeValue(new Date().toISOString()));
  const [durationMinutes, setDurationMinutes] = useState("");
  const [memo, setMemo] = useState("");
  const save = useMutation({
    mutationFn: api.createAbstinenceEvent,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: abstinenceQuery.queryKey });
      onOpenChange(false);
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate({ occurredAt: new Date(occurredAt).toISOString(), durationMinutes: durationMinutes === "" ? null : Number(durationMinutes), memo });
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 max-h-[95dvh] overflow-y-auto rounded-t-3xl bg-card p-6 pb-[max(24px,env(safe-area-inset-bottom))] text-foreground shadow-2xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
          <header className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-xl font-semibold">中断イベントを記録</Dialog.Title>
              <Dialog.Description className="mt-2 text-xs text-muted-foreground">発生日時と、振り返りに必要な内容だけを残します。</Dialog.Description>
            </div>
            <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="中断イベントの記録を閉じる" />}><X /></Dialog.Close>
          </header>
          <form onSubmit={submit} className="mt-6 grid gap-5">
            <fieldset disabled={save.isPending} className="grid gap-5">
              <Field label="発生日時"><Input autoFocus required type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></Field>
              <Field label="経過時間（分・任意）"><Input type="number" min="0" max="100000" step="1" inputMode="numeric" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} /></Field>
              <Field label="メモ（任意）"><Textarea maxLength={2000} value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="状況や次回に向けたメモ" /></Field>
              <Button type="submit" variant="destructive" className="h-11 rounded-xl">{save.isPending ? "保存しています…" : "イベントを記録"}</Button>
            </fieldset>
          </form>
          {save.error !== null && <div className="mt-3"><FormError>{save.error.message}</FormError></div>}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export const AbstinencePanel = () => {
  const { data } = useSuspenseQuery(abstinenceQuery);
  const [goalOpen, setGoalOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const goal = data.goal;
  return (
    <>
      <Panel mobileLayout="section" className="mb-6 rounded-3xl px-5">
        {goal === null
          ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold sm:text-sm">禁欲の継続</h2>
                  <p className="mt-1 text-xs text-muted-foreground">避けたい行動と目標を設定して、継続期間を記録します。</p>
                </div>
                <Button variant="outline" className="h-11 rounded-xl" onClick={() => setGoalOpen(true)}>禁欲目標を設定</Button>
              </div>
            )
          : (
              <>
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{goal.name}</p>
                    <h2 className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
                      {data.currentStreakDays}
                      <span className="ml-1 text-base font-normal text-muted-foreground">日継続中</span>
                    </h2>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="h-10 rounded-xl" onClick={() => setGoalOpen(true)}>禁欲目標を編集</Button>
                    <Button variant="destructive" className="h-10 rounded-xl" onClick={() => setEventOpen(true)}>イベントを記録</Button>
                  </div>
                </header>
                <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-muted/50 p-4 text-center sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">目標</dt>
                    <dd className="mt-1 text-xl font-semibold tabular-nums">
                      {goal.targetDays}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">日</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">最長</dt>
                    <dd className="mt-1 text-xl font-semibold tabular-nums">
                      {data.longestStreakDays}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">日</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">中断</dt>
                    <dd className="mt-1 text-xl font-semibold tabular-nums">
                      {data.events.length}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">回</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">累計時間</dt>
                    <dd className="mt-1 text-xl font-semibold tabular-nums">
                      {formatDuration(data.totalEventDurationMinutes)}
                    </dd>
                  </div>
                </dl>
                {data.events.length > 0 && (
                  <div className="mt-4 border-t pt-3">
                    <p className="text-xs font-semibold text-muted-foreground">最近の中断</p>
                    <div className="mt-2 grid gap-2">
                      {data.events.slice(0, 3).map((event) => (
                        <div key={event.id} className="flex items-center justify-between gap-3 text-xs">
                          <span>{formatDateTime(event.occurredAt)}</span>
                          <span className="truncate text-muted-foreground">{event.memo || "メモなし"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
      </Panel>
      <GoalDialog open={goalOpen} onOpenChange={setGoalOpen} goal={goal} />
      <EventDialog open={eventOpen} onOpenChange={setEventOpen} />
    </>
  );
};
