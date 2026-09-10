import { Dialog } from "@base-ui/react/dialog";
import type { Meal, MealNutrition } from "@life-console/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Utensils, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api } from "../../../api";
import { Field, FormError, EmptyState, Panel, SectionHeading } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { nutritionIsPending, summarizeDailyNutrition } from "../nutrition-summary";
import { nutritionQuery } from "../queries";

const mealDateTime = (occurredAt: string): string => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(occurredAt));

const MealPhoto = ({ photoId, alt, className }: { readonly photoId: string; readonly alt: string; readonly className: string }) => {
  const [failed, setFailed] = useState(false);
  return failed
    ? <p className="grid h-full min-h-32 place-items-center px-3 text-center text-xs text-destructive">写真を読み込めませんでした。</p>
    : <img src={`/api/v1/meal-photos/${encodeURIComponent(photoId)}/content`} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />;
};

const mealCaloriesLabel = (nutrition: MealNutrition | undefined): string => {
  if (nutrition === undefined) return "カロリーを読み込み中";
  if (nutrition.manualCaloriesKcal !== null) return `${nutrition.manualCaloriesKcal} kcal（手入力）`;
  return nutrition.estimate === null ? "カロリー未記録" : `約 ${nutrition.estimate.caloriesKcal} kcal`;
};

const MealCaloriesForm = ({ nutrition }: { readonly nutrition: MealNutrition }) => {
  const queryClient = useQueryClient();
  const [caloriesKcal, setCaloriesKcal] = useState(String(nutrition.manualCaloriesKcal ?? nutrition.estimate?.caloriesKcal ?? ""));
  const save = useMutation({
    mutationFn: api.saveMealCalories,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: nutritionQuery.queryKey }); },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate({ mealId: nutrition.mealId, caloriesKcal: Number(caloriesKcal) });
  };
  return (
    <form onSubmit={submit} className="grid gap-3">
      <Field label="カロリー（kcal）">
        <Input
          required
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={caloriesKcal}
          disabled={save.isPending}
          onChange={(event) => {
            setCaloriesKcal(event.target.value);
            save.reset();
          }}
        />
      </Field>
      <Button type="submit" disabled={save.isPending || caloriesKcal === ""}>{save.isPending ? "保存しています…" : "カロリーを保存"}</Button>
      {save.isSuccess && <p role="status" className="text-sm text-muted-foreground">カロリーを保存しました。</p>}
      {save.error !== null && <FormError>{save.error.message}</FormError>}
    </form>
  );
};

export const MealGallery = ({ meals, selectedMealId, onSelectMeal, periodLabel = "新しい順・直近 100 件まで" }: {
  readonly periodLabel?: string;
  readonly meals: ReadonlyArray<Meal>;
  readonly selectedMealId: string | undefined;
  readonly onSelectMeal: (id: string | undefined) => void;
}) => {
  const queryClient = useQueryClient();
  const nutrition = useQuery(nutritionQuery);
  const analyze = useMutation({
    mutationFn: api.analyzeNutrition,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: nutritionQuery.queryKey }); },
  });
  const visibleMealIds = new Set(meals.map((meal) => meal.id));
  const visibleNutrition = nutrition.data?.filter((entry) => visibleMealIds.has(entry.mealId));
  const nutritionByMeal = new Map(nutrition.data?.map((entry) => [entry.mealId, entry]));
  const selectedNutrition = selectedMealId === undefined ? undefined : nutritionByMeal.get(selectedMealId);
  const pending = nutritionIsPending(selectedNutrition?.analysisStatus ?? null);
  const selectedMeal = meals.find((meal) => meal.id === selectedMealId);
  return (
    <Panel className="mb-6" id="meals">
      <SectionHeading eyebrow="MEALS" title="食事の記録" />
      <div className="px-5">
        <p className="mb-4 text-xs text-muted-foreground">{periodLabel}</p>
        <div className="mb-4 space-y-3">
          <p className="text-xs text-muted-foreground">カロリーが未入力の写真付き食事は、保存後に自動で解析します。写真とメモは設定した AI サービスへ送られ、Mac の runner が起動している間に概算します。</p>
          <Button variant="outline" size="sm" disabled={analyze.isPending || nutrition.data === undefined || nutrition.data.some((entry) => nutritionIsPending(entry.analysisStatus)) || !nutrition.data.some((entry) => entry.photoId !== null && entry.manualCaloriesKcal === null && entry.estimate === null)} onClick={() => analyze.mutate({})}>未解析の食事をまとめて解析</Button>
          {analyze.error !== null && <FormError>{analyze.error.message}</FormError>}
          {nutrition.isPending && <p role="status" className="text-sm text-muted-foreground">推定結果を読み込み中…</p>}
          {nutrition.error !== null && <FormError>{nutrition.error.message}</FormError>}
          {visibleNutrition !== undefined && visibleNutrition.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-xl border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" role="region" aria-label="日別のカロリー" tabIndex={0}>
              <table className="w-full text-sm tabular-nums">
                <caption className="p-3 text-left font-medium">日別のカロリー（日本時間・記録した食事の合計）</caption>
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left">日付</th>
                    <th className="px-3 py-2 text-right">合計</th>
                    <th className="px-3 py-2 text-right">記録済み</th>
                  </tr>
                </thead>
                <tbody>
                  {summarizeDailyNutrition(visibleNutrition).map((day) => (
                    <tr key={day.date}>
                      <td className="px-3 py-2">{day.date}</td>
                      <td className="px-3 py-2 text-right">{day.recordedMeals === 0 ? "未記録" : `${day.caloriesKcal} kcal`}</td>
                      <td className="px-3 py-2 text-right">
                        {`${day.recordedMeals} / ${day.totalMeals} 件`}
                        {day.recordedMeals < day.totalMeals && "（未記録あり）"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {meals.length === 0
          ? <EmptyState>まだ食事記録がありません。『食事を記録』から写真やメモを残せます。</EmptyState>
          : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {meals.map((meal) => (
                  <button key={meal.id} type="button" className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={() => onSelectMeal(meal.id)} aria-label={`${mealDateTime(meal.occurredAt)} の食事を開く`}>
                    <div className="aspect-square w-full shrink-0 overflow-hidden bg-muted">
                      {meal.photoId === null
                        ? (
                            <div className="grid h-full content-center justify-items-center gap-2 text-muted-foreground">
                              <Utensils aria-hidden="true" className="size-7" />
                              <span className="text-xs">メモのみ</span>
                            </div>
                          )
                        : <MealPhoto photoId={meal.photoId} alt="食事の写真" className="size-full object-cover" />}
                    </div>
                    <div className="grid w-full gap-2 p-3">
                      <time dateTime={meal.occurredAt} className="text-xs text-muted-foreground">{mealDateTime(meal.occurredAt)}</time>
                      <p className="text-sm font-medium tabular-nums">{mealCaloriesLabel(nutritionByMeal.get(meal.id))}</p>
                      {nutritionIsPending(nutritionByMeal.get(meal.id)?.analysisStatus ?? null) && <p className="text-xs text-muted-foreground">{nutritionByMeal.get(meal.id)?.manualCaloriesKcal != null ? "解析の中止待ち" : "解析待ち・解析中"}</p>}
                      {meal.memo !== "" && <p className="line-clamp-2 text-sm break-words whitespace-pre-wrap">{meal.memo}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
      </div>
      <Dialog.Root open={selectedMealId !== undefined} onOpenChange={(open) => { if (!open) onSelectMeal(undefined); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-card p-4 text-foreground shadow-2xl outline-none sm:p-6">
            <header className="mb-4 flex items-center justify-between gap-3">
              <Dialog.Title className="text-lg font-semibold">食事の記録</Dialog.Title>
              <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="食事の詳細を閉じる" />}><X /></Dialog.Close>
            </header>
            <Dialog.Description className="mb-4 text-sm text-muted-foreground">{selectedMeal === undefined ? "この食事記録は一覧にありません。" : mealDateTime(selectedMeal.occurredAt)}</Dialog.Description>
            {selectedMeal !== undefined && (
              <div className="grid gap-4">
                {selectedMeal.photoId !== null && <div className="overflow-hidden rounded-xl bg-muted"><MealPhoto key={selectedMeal.photoId} photoId={selectedMeal.photoId} alt="食事の写真" className="max-h-[60dvh] w-full object-contain" /></div>}
                {selectedMeal.memo !== "" && <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{selectedMeal.memo}</p>}
                {selectedNutrition !== undefined && selectedNutrition.manualCaloriesKcal !== null && <p className="text-xl font-semibold">{mealCaloriesLabel(selectedNutrition)}</p>}
                {selectedNutrition?.manualCaloriesKcal === null && selectedNutrition.estimate !== null && (
                  <div className="space-y-2 rounded-xl bg-muted/50 p-4">
                    <p className="text-xl font-semibold">{`推定 約 ${selectedNutrition.estimate.caloriesKcal} kcal`}</p>
                    <p className="text-sm">{`たんぱく質 ${selectedNutrition.estimate.proteinGrams} g ・ 脂質 ${selectedNutrition.estimate.fatGrams} g ・ 炭水化物 ${selectedNutrition.estimate.carbohydrateGrams} g`}</p>
                    <p className="text-xs text-muted-foreground">{`${selectedNutrition.estimate.model} ・ ${mealDateTime(selectedNutrition.estimate.analyzedAt)} に解析`}</p>
                    <p className="text-xs text-muted-foreground">写真からの推定値です。実際の分量や調理方法で変わります。</p>
                  </div>
                )}
                {selectedNutrition !== undefined && <MealCaloriesForm key={selectedMeal.id} nutrition={selectedNutrition} />}
                {selectedMeal.photoId !== null && selectedNutrition?.manualCaloriesKcal === null && <Button disabled={analyze.isPending || pending || nutrition.data === undefined} onClick={() => analyze.mutate({ mealId: selectedMeal.id })}>{pending ? "解析待ち・解析中" : selectedNutrition?.estimate == null ? "カロリーを解析" : "カロリーを再解析"}</Button>}
                {pending && <p role="status" className="text-sm text-muted-foreground">{selectedNutrition?.manualCaloriesKcal != null ? "画像解析の中止を待っています。" : "Mac の runner で順番に解析します。結果は自動で更新されます。"}</p>}
                {selectedNutrition?.analysisStatus === "failed" && <FormError>{selectedNutrition.analysisSummary ?? "解析に失敗しました。再解析できます。"}</FormError>}
                {analyze.error !== null && <FormError>{analyze.error.message}</FormError>}
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </Panel>
  );
};
