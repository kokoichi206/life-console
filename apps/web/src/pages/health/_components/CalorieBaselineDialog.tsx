import { Dialog } from "@base-ui/react/dialog";
import type { CalorieBaseline } from "@life-console/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api } from "../../../api";
import { Field, FormError } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { calorieBaselineQuery } from "../queries";

const CalorieBaselineForm = ({ baseline, onSaved }: {
  readonly baseline: CalorieBaseline | null;
  readonly onSaved: () => void;
}) => {
  const client = useQueryClient();
  const [dailyExpenditure, setDailyExpenditure] = useState(String(baseline?.dailyExpenditureKcal ?? ""));
  const save = useMutation({
    mutationFn: api.saveCalorieBaseline,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: calorieBaselineQuery.queryKey });
      onSaved();
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate({ dailyExpenditureKcal: Number(dailyExpenditure) });
  };
  return (
    <form onSubmit={submit} className="mt-6">
      <fieldset disabled={save.isPending} className="grid gap-5">
        <legend className="sr-only">1 日の基準消費量</legend>
        <Field label="1 日の基準消費量（kcal）">
          <Input autoFocus required type="number" min="1" max="10000" step="1" inputMode="numeric" value={dailyExpenditure} onChange={(event) => setDailyExpenditure(event.target.value)} />
        </Field>
        <Button type="submit" className="h-11 rounded-xl">{save.isPending ? "保存しています…" : "基準消費量を保存"}</Button>
        {baseline !== null && <Button type="button" variant="ghost" onClick={() => save.mutate(null)}>基準消費量を解除</Button>}
      </fieldset>
      {save.error !== null && <div className="mt-3"><FormError>{save.error.message}</FormError></div>}
    </form>
  );
};

export const CalorieBaselineDialog = ({ open, onOpenChange, baseline }: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly baseline: CalorieBaseline | null;
}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" />
      <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 max-h-[95dvh] overflow-y-auto rounded-t-3xl bg-card p-6 pb-[max(24px,env(safe-area-inset-bottom))] text-foreground shadow-2xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
        <header className="flex items-start justify-between gap-3">
          <div>
            <Dialog.Title className="text-xl font-semibold">1 日の基準消費量を設定</Dialog.Title>
            <Dialog.Description className="mt-2 text-xs text-muted-foreground">基礎代謝と日常の活動で 1 日に使う量の目安。運動は Strava の記録から別に加えます。</Dialog.Description>
          </div>
          <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="基準消費量の設定を閉じる" />}><X /></Dialog.Close>
        </header>
        <CalorieBaselineForm baseline={baseline} onSaved={() => onOpenChange(false)} />
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
