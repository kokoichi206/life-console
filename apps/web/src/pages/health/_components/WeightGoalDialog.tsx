import { Dialog } from "@base-ui/react/dialog";
import type { WeightGoal } from "@life-console/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api } from "../../../api";
import { Field, FormError } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { weightGoalQuery } from "../queries";

const WeightGoalForm = ({ goal, initialWeight, onSaved }: {
  readonly goal: WeightGoal | null;
  readonly initialWeight: number | undefined;
  readonly onSaved: () => void;
}) => {
  const client = useQueryClient();
  const [startWeight, setStartWeight] = useState(String(goal?.startWeightKg ?? initialWeight ?? ""));
  const [targetWeight, setTargetWeight] = useState(String(goal?.targetWeightKg ?? ""));
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const save = useMutation({
    mutationFn: api.saveWeightGoal,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: weightGoalQuery.queryKey });
      onSaved();
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate({ startWeightKg: Number(startWeight), targetWeightKg: Number(targetWeight), targetDate: targetDate === "" ? null : targetDate });
  };
  return (
    <form onSubmit={submit} className="mt-6">
      <fieldset disabled={save.isPending} className="grid gap-5">
        <legend className="sr-only">体重の目標</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="開始体重 (kg)"><Input required type="number" min="0.1" max="500" step="0.1" inputMode="decimal" value={startWeight} onChange={(event) => setStartWeight(event.target.value)} /></Field>
          <Field label="目標体重 (kg)"><Input autoFocus required type="number" min="0.1" max="500" step="0.1" inputMode="decimal" value={targetWeight} onChange={(event) => setTargetWeight(event.target.value)} /></Field>
        </div>
        <Field label="期限（任意）"><Input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></Field>
        <Button type="submit" className="h-11 rounded-xl">{save.isPending ? "保存しています…" : "目標を保存"}</Button>
        {goal !== null && <Button type="button" variant="ghost" onClick={() => save.mutate(null)}>目標を解除</Button>}
      </fieldset>
      {save.error !== null && <div className="mt-3"><FormError>{save.error.message}</FormError></div>}
    </form>
  );
};

export const WeightGoalDialog = ({ open, onOpenChange, goal, initialWeight }: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly goal: WeightGoal | null;
  readonly initialWeight: number | undefined;
}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" />
      <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 max-h-[95dvh] overflow-y-auto rounded-t-3xl bg-card p-6 pb-[max(24px,env(safe-area-inset-bottom))] text-foreground shadow-2xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
        <header className="flex items-start justify-between gap-3">
          <div>
            <Dialog.Title className="text-xl font-semibold">体重の目標を設定</Dialog.Title>
            <Dialog.Description className="mt-2 text-xs text-muted-foreground">開始体重を基準に、最新の記録で進捗を表示します。</Dialog.Description>
          </div>
          <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="目標の設定を閉じる" />}><X /></Dialog.Close>
        </header>
        <WeightGoalForm goal={goal} initialWeight={initialWeight} onSaved={() => onOpenChange(false)} />
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
