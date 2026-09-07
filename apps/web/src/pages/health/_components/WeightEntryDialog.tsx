import { Dialog } from "@base-ui/react/dialog";
import type { WeightPoint } from "@life-console/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api } from "../../../api";
import { Field, FormError } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";

import { WeightWheel } from "./WeightWheel";

const currentLocalDateTime = (): string => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const WeightEntryForm = ({ previousWeight, onSaved }: {
  readonly previousWeight: WeightPoint | undefined;
  readonly onSaved: () => void;
}) => {
  const queryClient = useQueryClient();
  const [weight, setWeight] = useState(() => previousWeight?.weightKg.toFixed(1) ?? "");
  const [numericEntry, setNumericEntry] = useState(previousWeight === undefined);
  const [occurredAt, setOccurredAt] = useState(currentLocalDateTime);
  const [date, time] = occurredAt.split("T");
  const tenths = Math.round(Number(weight) * 10);
  const kilograms = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  const validWeight = weight !== "" && Number(weight) >= 0.1 && Number(weight) <= 500;
  const createWeight = useMutation({
    mutationFn: api.createWeight,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["weights"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      onSaved();
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createWeight.mutate({ source: "manual", sourceKey: crypto.randomUUID(), weightKg: Number(weight), occurredAt: new Date(occurredAt).toISOString() });
  };

  return (
    <form onSubmit={submit} className="mt-6">
      <fieldset disabled={createWeight.isPending}>
        <legend className="sr-only">体重と計測日時</legend>
        <div className="grid grid-cols-[1.5fr_1fr] gap-3">
          <label className="grid gap-2 text-xs text-muted-foreground dark:text-white/60">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              日付
            </span>
            <input required aria-label="計測日" type="date" value={date} onChange={(event) => setOccurredAt(`${event.target.value}T${time}`)} className="h-12 min-w-0 rounded-full bg-muted px-4 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-white/10 dark:text-white dark:[color-scheme:dark]" />
          </label>
          <label className="grid gap-2 text-xs text-muted-foreground dark:text-white/60">
            <span className="flex items-center gap-1.5">
              <Clock3 className="size-3.5" />
              時刻
            </span>
            <input required aria-label="計測時刻" type="time" value={time} onChange={(event) => setOccurredAt(`${date}T${event.target.value}`)} className="h-12 min-w-0 rounded-full bg-muted px-4 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-white/10 dark:text-white dark:[color-scheme:dark]" />
          </label>
        </div>
        <div className="mt-5 text-center">
          <p className="text-xs text-muted-foreground dark:text-white/60">
            {previousWeight === undefined ? "最初の体重を入力してください" : `前回 ${previousWeight.weightKg.toFixed(1)} kg から調整`}
          </p>
          {numericEntry
            ? (
                <div className="flex h-60 items-center justify-center px-12">
                  <Field label="体重 (kg)" className="w-full">
                    <Input autoFocus required type="number" min="0.1" max="500" step="0.1" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} className="h-16 text-center text-3xl! tabular-nums" />
                  </Field>
                </div>
              )
            : (
                <div inert={createWeight.isPending} className="relative mt-1 grid grid-cols-[1fr_20px_1fr_48px] items-center" aria-label="体重の選択">
                  <div className="pointer-events-none absolute inset-x-0 top-24 h-12 rounded-2xl bg-primary/8 dark:bg-white/10" />
                  <WeightWheel label="体重の整数部" value={kilograms} minimum={0} maximum={500} onChange={(value) => setWeight((Math.min(5000, Math.max(1, value * 10 + decimal)) / 10).toFixed(1))} />
                  <span className="z-10 text-3xl dark:text-white" aria-hidden="true">.</span>
                  <WeightWheel label="体重の小数部" value={decimal} minimum={kilograms === 0 ? 1 : 0} maximum={kilograms === 500 ? 0 : 9} onChange={(value) => setWeight(((kilograms * 10 + value) / 10).toFixed(1))} />
                  <span className="z-10 text-xl text-foreground dark:text-white/80" aria-hidden="true">kg</span>
                </div>
              )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={numericEntry && !validWeight}
            onClick={() => {
              setWeight(Number(weight).toFixed(1));
              setNumericEntry((current) => !current);
            }}
            className="text-xs text-muted-foreground dark:text-white/60"
          >
            {numericEntry ? "ホイールで選ぶ" : "数字で入力する"}
          </Button>
        </div>
        <Button type="submit" disabled={!validWeight || createWeight.isPending} className="mt-6 h-12 w-full rounded-2xl text-base">
          {createWeight.isPending ? "保存しています…" : "体重を保存"}
        </Button>
      </fieldset>
      {createWeight.error !== null && <div className="mt-3"><FormError>{createWeight.error.message}</FormError></div>}
    </form>
  );
};

export const WeightEntryDialog = ({ open, previousWeight, onOpenChange }: {
  readonly open: boolean;
  readonly previousWeight: WeightPoint | undefined;
  readonly onOpenChange: (open: boolean) => void;
}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" />
      <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 max-h-[95dvh] overflow-y-auto rounded-t-3xl bg-card px-6 pt-6 pb-[max(24px,env(safe-area-inset-bottom))] text-foreground shadow-2xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl dark:bg-[#2b2d40] dark:text-white">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-foreground/15 sm:hidden dark:bg-white/20" aria-hidden="true" />
        <header className="flex items-start justify-between gap-3">
          <div>
            <Dialog.Title className="text-xl font-semibold tracking-tight">体重を記録</Dialog.Title>
            <Dialog.Description className="mt-1.5 text-xs text-muted-foreground dark:text-white/60">計測した体重と日時を残しましょう。</Dialog.Description>
          </div>
          <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="体重の記録を閉じる" />}><X /></Dialog.Close>
        </header>
        <WeightEntryForm previousWeight={previousWeight} onSaved={() => onOpenChange(false)} />
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
