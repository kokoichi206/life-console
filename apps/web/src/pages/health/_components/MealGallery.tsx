import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog } from "@base-ui/react/dialog";
import { weightCalendarDate, type Meal, type MealNutrition } from "@life-console/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Utensils, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";

import { api } from "../../../api";
import { Field, FormError, EmptyState, Eyebrow, Panel } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { cn } from "../../../lib/class-names";
import type { MealGalleryLayout } from "../health-search";
import { nutritionIsPending, summarizeDailyNutrition } from "../nutrition-summary";
import { useHealthQueries } from "../queries";

import { PfcNutrients } from "./PfcNutrients";

const mealDateTime = (occurredAt: string): string => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(occurredAt));

const mealRecordedDateTime = (recordedAt: string): string => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
}).format(new Date(recordedAt));

const MealPhoto = ({ photoId, alt, className }: { readonly photoId: string; readonly alt: string; readonly className: string }) => {
  const { read } = useHealthQueries();
  const [failed, setFailed] = useState(false);
  return failed
    ? <p className="grid h-full min-h-32 place-items-center px-3 text-center text-xs text-destructive">写真を読み込めませんでした。</p>
    : <img src={read.mealPhotoUrl(photoId)} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />;
};

const mealCaloriesLabel = (nutrition: MealNutrition | undefined): string => {
  if (nutrition === undefined) return "カロリーを読み込み中";
  if (nutrition.manualCaloriesKcal !== null) return `${nutrition.manualCaloriesKcal} kcal（手入力）`;
  return nutrition.estimate === null ? "カロリー未記録" : `約 ${nutrition.estimate.caloriesKcal} kcal`;
};

const MealCaloriesForm = ({ nutrition }: { readonly nutrition: MealNutrition }) => {
  const { nutritionQueryKey, readOnly } = useHealthQueries();
  const queryClient = useQueryClient();
  const [caloriesKcal, setCaloriesKcal] = useState(String(nutrition.manualCaloriesKcal ?? nutrition.estimate?.caloriesKcal ?? ""));
  const save = useMutation({
    mutationFn: api.saveMealCalories,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: nutritionQueryKey }); },
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
          disabled={readOnly || save.isPending}
          onChange={(event) => {
            setCaloriesKcal(event.target.value);
            save.reset();
          }}
        />
      </Field>
      <Button type="submit" disabled={readOnly || save.isPending || caloriesKcal === ""}>{save.isPending ? "保存しています…" : "カロリーを保存"}</Button>
      {save.isSuccess && <p role="status" className="text-sm text-muted-foreground">カロリーを保存しました。</p>}
      {save.error !== null && <FormError>{save.error.message}</FormError>}
    </form>
  );
};

const MealDeleteConfirmation = ({ meal, onDeleted }: {
  readonly meal: Meal;
  readonly onDeleted: (meal: Meal) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const remove = useMutation({
    mutationFn: () => api.deleteMeal(meal.id),
    onSuccess: async () => {
      setOpen(false);
      await onDeleted(meal);
    },
  });
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (remove.isPending) return;
        setOpen(nextOpen);
        remove.reset();
      }}
    >
      <div className="border-t pt-4">
        <AlertDialog.Trigger render={<Button variant="destructive" />}>この食事を削除</AlertDialog.Trigger>
      </div>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <AlertDialog.Popup initialFocus={cancelButton} className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-card p-5 text-foreground shadow-2xl outline-none">
          <AlertDialog.Title className="text-lg font-semibold">この食事を削除しますか？</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">削除する 1 件を確認してください。一覧とカロリー・PFC の集計から除外します。</AlertDialog.Description>
          <div className="my-4 space-y-3 rounded-xl border p-3">
            <p className="text-sm font-medium">{`食事日時：${mealDateTime(meal.occurredAt)}`}</p>
            <p className="text-xs text-muted-foreground">{`登録日時：${mealRecordedDateTime(meal.recordedAt)}`}</p>
            {meal.photoId !== null && <MealPhoto photoId={meal.photoId} alt="削除対象の食事の代表写真" className="max-h-40 w-full rounded-lg object-contain" />}
            {meal.additionalPhotoIds.length > 0 && <p className="text-xs text-muted-foreground">{`写真 ${meal.additionalPhotoIds.length + 1} 枚の食事記録`}</p>}
            <p className="text-sm break-words whitespace-pre-wrap">{meal.memo === "" ? "メモなし" : meal.memo}</p>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">ページを再読み込み・移動するまでは、直前に削除した 1 件を「元に戻す」ことができます。</p>
          {remove.error !== null && <FormError>{remove.error.message}</FormError>}
          <div className="mt-4 flex justify-end gap-3">
            <AlertDialog.Close render={<Button ref={cancelButton} variant="outline" disabled={remove.isPending} />}>キャンセル</AlertDialog.Close>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "削除しています…" : "確認した食事を削除"}</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};

export const MealGallery = ({ meals, layout, onLayoutChange, selectedMealId, onSelectMeal, selectedDay, onShowAll, hasMore = false, loadingMore = false, onLoadMore, periodLabel = "新しい順・直近 7 日間" }: {
  readonly periodLabel?: string;
  readonly meals: ReadonlyArray<Meal>;
  readonly layout: MealGalleryLayout;
  readonly onLayoutChange: (layout: MealGalleryLayout) => void;
  readonly selectedMealId: string | undefined;
  readonly onSelectMeal: (id: string | undefined) => void;
  readonly selectedDay?: string | undefined;
  readonly onShowAll?: () => void;
  readonly hasMore?: boolean;
  readonly loadingMore?: boolean;
  readonly onLoadMore?: () => void;
}) => {
  const galleryRef = useRef<HTMLDivElement>(null);
  const layoutControlsRef = useRef<HTMLDivElement>(null);
  const horizontalPositions = useRef(new Map<string, number>());
  const layoutAnchor = useRef<{ date: string; top: number } | undefined>(undefined);
  useLayoutEffect(() => {
    const gallery = galleryRef.current;
    if (gallery === null) return;
    if (layout === "horizontal") {
      for (const row of gallery.querySelectorAll<HTMLDivElement>("[data-meal-row]")) {
        row.scrollTo({ left: horizontalPositions.current.get(row.dataset.mealRow!) ?? 0, behavior: "instant" });
      }
    }
    if (layoutAnchor.current !== undefined) {
      const anchor = layoutAnchor.current;
      const section = gallery.querySelector<HTMLElement>(`[data-meal-day="${anchor.date}"]`)!;
      window.scrollBy({ top: section.getBoundingClientRect().top - anchor.top, behavior: "instant" });
      layoutAnchor.current = undefined;
    }
  }, [layout]);
  const changeLayout = (next: MealGalleryLayout) => {
    if (next === layout) return;
    const controlsBottom = layoutControlsRef.current!.getBoundingClientRect().bottom;
    const visibleDay = [...galleryRef.current!.querySelectorAll<HTMLElement>("[data-meal-day]")]
      .find((section) => section.getBoundingClientRect().bottom > controlsBottom && section.getBoundingClientRect().top < window.innerHeight);
    if (visibleDay !== undefined) {
      layoutAnchor.current = { date: visibleDay.dataset.mealDay!, top: Math.max(visibleDay.getBoundingClientRect().top, controlsBottom + 12) };
    }
    if (layout === "horizontal") {
      for (const row of galleryRef.current!.querySelectorAll<HTMLDivElement>("[data-meal-row]")) {
        horizontalPositions.current.set(row.dataset.mealRow!, row.scrollLeft);
      }
    }
    onLayoutChange(next);
  };
  const { nutritionQuery, nutritionQueryKey, readOnly } = useHealthQueries();
  const queryClient = useQueryClient();
  const [deletedMeal, setDeletedMeal] = useState<Meal>();
  const refreshMeals = async () => {
    await Promise.all(["meals", "meal-gallery", "meal-day-counts", "nutrition", "dashboard"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
  };
  const restore = useMutation({
    mutationFn: api.restoreMeal,
    onSuccess: async (_result, id) => {
      await refreshMeals();
      setDeletedMeal((current) => current?.id === id ? undefined : current);
    },
  });
  const today = weightCalendarDate(new Date().toISOString());
  const mealDates = meals.map((meal) => weightCalendarDate(meal.occurredAt)).sort();
  const nutrition = useQuery({
    ...nutritionQuery(mealDates[0] ?? today, mealDates.at(-1) ?? today),
    enabled: meals.length > 0,
  });
  const analyze = useMutation({
    mutationFn: api.analyzeNutrition,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: nutritionQueryKey }); },
  });
  const visibleMealIds = new Set(meals.map((meal) => meal.id));
  const visibleNutrition = nutrition.data?.filter((entry) => visibleMealIds.has(entry.mealId));
  const nutritionByMeal = new Map(nutrition.data?.map((entry) => [entry.mealId, entry]));
  const selectedNutrition = selectedMealId === undefined ? undefined : nutritionByMeal.get(selectedMealId);
  const pending = nutritionIsPending(selectedNutrition?.analysisStatus ?? null);
  const selectedMeal = meals.find((meal) => meal.id === selectedMealId);
  const visibleMeals = selectedDay === undefined ? meals : meals.filter((meal) => weightCalendarDate(meal.occurredAt) === selectedDay);
  const mealsByDay = new Map<string, Meal[]>();
  for (const meal of visibleMeals) {
    const date = weightCalendarDate(meal.occurredAt);
    const day = mealsByDay.get(date) ?? [];
    day.push(meal);
    mealsByDay.set(date, day);
  }
  const dailyNutrition = new Map(summarizeDailyNutrition(visibleNutrition ?? []).map((day) => [day.date, day]));
  return (
    <Panel mobileLayout="section" className="mb-6 overflow-visible" id="meals">
      <header className="space-y-1.5 pb-4 sm:px-5">
        <Eyebrow className="max-sm:hidden">MEALS</Eyebrow>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold sm:text-base">{selectedDay === undefined ? "食事の記録" : `${selectedDay} の食事`}</h2>
          <Button variant="outline" size="sm" disabled={nutrition.isFetching} onClick={() => { void queryClient.invalidateQueries({ queryKey: nutritionQueryKey }); }}>{nutrition.isFetching ? "更新中…" : "栄養の結果を更新"}</Button>
        </div>
      </header>
      <div className="sm:px-5">
        {!readOnly && deletedMeal !== undefined && (
          <div className="mb-4 space-y-3 rounded-xl border p-3" aria-label="食事の削除取り消し">
            <p role="status" className="text-sm">{`${mealDateTime(deletedMeal.occurredAt)} の食事を削除しました。`}</p>
            <Button variant="outline" disabled={restore.isPending} onClick={() => restore.mutate(deletedMeal.id)}>{restore.isPending ? "元に戻しています…" : "元に戻す"}</Button>
            {restore.error !== null && <FormError>{restore.error.message}</FormError>}
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{selectedDay === undefined ? periodLabel : "選択日の記録・新しい順"}</p>
          {selectedDay !== undefined && <Button variant="outline" size="sm" onClick={onShowAll}>全日を見る</Button>}
        </div>
        <div className="mb-4 space-y-3">
          <p className="text-xs text-muted-foreground">{readOnly ? "保存済みの食事と栄養の推定値を表示しています。" : "カロリーが未入力の食事は、写真またはメモから保存後に自動で解析します。写真とメモは設定した AI サービスへ送られ、Mac の runner が起動している間に概算します。"}</p>
          <Button variant="outline" size="sm" disabled={readOnly || analyze.isPending || nutrition.data === undefined || nutrition.data.some((entry) => nutritionIsPending(entry.analysisStatus)) || !nutrition.data.some((entry) => entry.manualCaloriesKcal === null && entry.estimate === null)} onClick={() => analyze.mutate({})}>未解析の食事をまとめて解析</Button>
          {analyze.error !== null && <FormError>{analyze.error.message}</FormError>}
          {meals.length > 0 && nutrition.isPending && <p role="status" className="text-sm text-muted-foreground">推定結果を読み込み中…</p>}
          {nutrition.error !== null && <FormError>{nutrition.error.message}</FormError>}
        </div>
        {visibleMeals.length === 0
          ? <EmptyState>{selectedDay !== undefined ? "この日の食事記録はありません。" : readOnly ? "まだ食事記録がありません。" : "まだ食事記録がありません。『食事』から写真やメモを残せます。"}</EmptyState>
          : (
              <div ref={galleryRef}>
                <div ref={layoutControlsRef} role="group" aria-label="食事一覧の表示形式" className="sticky top-0 z-20 mb-4 flex items-center gap-3 bg-background/95 py-2 backdrop-blur sm:bg-card/95">
                  <span className="shrink-0 text-xs text-muted-foreground">並べ方</span>
                  <div className="flex flex-1 gap-1 rounded-xl border bg-muted p-1 sm:flex-none">
                    <Button type="button" variant={layout === "horizontal" ? "default" : "ghost"} className="min-h-11 flex-1" aria-pressed={layout === "horizontal"} onClick={() => changeLayout("horizontal")}>横スクロール</Button>
                    <Button type="button" variant={layout === "wrapped" ? "default" : "ghost"} className="min-h-11 flex-1" aria-pressed={layout === "wrapped"} onClick={() => changeLayout("wrapped")}>2 列折り返し</Button>
                  </div>
                </div>
                <div className="space-y-6">
                  {[...mealsByDay].sort(([left], [right]) => right.localeCompare(left)).map(([date, dayMeals]) => {
                    const summary = dailyNutrition.get(date);
                    return (
                      <section key={date} data-meal-day={date} aria-label={`${date} の食事`}>
                        <header className="mb-3 space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold"><time dateTime={date}>{date}</time></h3>
                            <p className="text-xs text-muted-foreground">{`${dayMeals.length} 件の食事`}</p>
                          </div>
                          {summary !== undefined && (
                            <p className="text-sm font-medium tabular-nums" aria-label={`${date} の記録済みカロリー`}>
                              {summary.recordedMeals === 0 ? "カロリー未記録" : `${summary.caloriesKcal} kcal`}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">{`カロリー記録 ${summary.recordedMeals} / ${summary.totalMeals} 件${summary.recordedMeals < summary.totalMeals ? "（未記録あり）" : ""}`}</span>
                            </p>
                          )}
                        </header>
                        <div
                          data-meal-row={date}
                          role="region"
                          aria-label={`${date} の食事の一覧`}
                          tabIndex={layout === "horizontal" ? 0 : undefined}
                          className={cn("-m-1 gap-3 p-1 focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", layout === "horizontal" ? "flex snap-x snap-proximity overflow-x-auto" : "grid grid-cols-2")}
                          onScroll={(event) => { if (layout === "horizontal") horizontalPositions.current.set(date, event.currentTarget.scrollLeft); }}
                        >
                          {dayMeals.map((meal) => {
                            const mealNutrition = nutritionByMeal.get(meal.id);
                            return (
                              <button key={meal.id} type="button" className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", layout === "horizontal" && "w-[43%] max-w-52 min-w-36 shrink-0 snap-start")} onClick={() => onSelectMeal(meal.id)} aria-label={`${mealDateTime(meal.occurredAt)} の食事を開く`}>
                                <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-muted">
                                  {meal.photoId === null
                                    ? (
                                        <div className="grid h-full content-center justify-items-center gap-2 text-muted-foreground">
                                          <Utensils aria-hidden="true" className="size-7" />
                                          <span className="text-xs">メモのみ</span>
                                        </div>
                                      )
                                    : <MealPhoto photoId={meal.photoId} alt="食事の写真" className="size-full object-cover" />}
                                  {meal.additionalPhotoIds.length > 0 && <span className="absolute right-2 bottom-2 rounded-md bg-card/95 px-2 py-1 text-xs text-foreground">{`${1 + meal.additionalPhotoIds.length} 枚`}</span>}
                                </div>
                                <div className="grid w-full gap-2 p-3">
                                  <time dateTime={meal.occurredAt} className="text-xs text-muted-foreground">{mealDateTime(meal.occurredAt)}</time>
                                  <p className="text-sm font-medium tabular-nums">{mealCaloriesLabel(nutritionByMeal.get(meal.id))}</p>
                                  {mealNutrition?.estimate != null
                                    ? <p className="text-[0.65rem] text-muted-foreground">{`P ${mealNutrition.estimate.proteinGrams} g · F ${mealNutrition.estimate.fatGrams} g · C ${mealNutrition.estimate.carbohydrateGrams} g`}</p>
                                    : nutritionByMeal.has(meal.id) && <p className="text-[0.65rem] text-muted-foreground">PFC 未解析</p>}
                                  {nutritionIsPending(nutritionByMeal.get(meal.id)?.analysisStatus ?? null) && <p className="text-xs text-muted-foreground">解析待ち・解析中</p>}
                                  {meal.memo !== "" && <p className="line-clamp-2 text-sm break-words whitespace-pre-wrap">{meal.memo}</p>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
        {hasMore && selectedDay === undefined && <div className="mt-4 flex justify-center"><Button variant="outline" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "読み込んでいます…" : "もっと見る"}</Button></div>}
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
                {selectedMeal.photoId !== null && (
                  <div className="space-y-2">
                    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-xl" role="region" aria-label="食事の写真" tabIndex={0}>
                      {[selectedMeal.photoId, ...selectedMeal.additionalPhotoIds].map((photoId, index) => (
                        <div key={photoId} className={`w-full shrink-0 snap-center overflow-hidden rounded-xl bg-muted ${selectedMeal.additionalPhotoIds.length > 0 ? "aspect-[4/3]" : ""}`}><MealPhoto photoId={photoId} alt={`食事の写真 ${index + 1}`} className={selectedMeal.additionalPhotoIds.length > 0 ? "size-full object-contain" : "max-h-[60dvh] w-full object-contain"} /></div>
                      ))}
                    </div>
                    {selectedMeal.additionalPhotoIds.length > 0 && <p className="text-xs text-muted-foreground">{`${1 + selectedMeal.additionalPhotoIds.length} 枚 · 横にスワイプで写真を切り替え`}</p>}
                  </div>
                )}
                {selectedMeal.memo !== "" && <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{selectedMeal.memo}</p>}
                {selectedNutrition !== undefined && selectedNutrition.manualCaloriesKcal !== null && <p className="text-xl font-semibold">{mealCaloriesLabel(selectedNutrition)}</p>}
                {selectedNutrition !== undefined && selectedNutrition.estimate !== null && (
                  <div className="space-y-2 rounded-xl bg-muted/50 p-4">
                    {selectedNutrition.manualCaloriesKcal === null && <p className="text-xl font-semibold">{`推定 約 ${selectedNutrition.estimate.caloriesKcal} kcal`}</p>}
                    <PfcNutrients grams={selectedNutrition.estimate} />
                    <p className="text-xs text-muted-foreground">{`${selectedNutrition.estimate.model} ・ ${mealDateTime(selectedNutrition.estimate.analyzedAt)} に解析`}</p>
                    <p className="text-xs text-muted-foreground">栄養素は写真・メモからの推定値です。実際の分量や調理方法で変わります。</p>
                  </div>
                )}
                {selectedNutrition !== undefined && <MealCaloriesForm key={selectedMeal.id} nutrition={selectedNutrition} />}
                {(selectedMeal.photoId !== null || selectedMeal.memo.trim() !== "") && <Button disabled={readOnly || analyze.isPending || pending || nutrition.data === undefined} onClick={() => analyze.mutate({ mealId: selectedMeal.id })}>{pending ? "解析待ち・解析中" : selectedNutrition?.estimate == null ? "栄養を解析" : "栄養を再解析"}</Button>}
                {selectedNutrition?.manualCaloriesKcal != null && <p className="text-xs text-muted-foreground">解析しても手入力したカロリーは変わりません。</p>}
                {pending && <p role="status" className="text-sm text-muted-foreground">Mac の runner で順番に解析します。「栄養の結果を更新」で結果を確認できます。</p>}
                <Button variant="outline" disabled={nutrition.isFetching} onClick={() => { void queryClient.invalidateQueries({ queryKey: nutritionQueryKey }); }}>{nutrition.isFetching ? "更新中…" : "栄養の結果を更新"}</Button>
                {nutrition.error !== null && <FormError>{nutrition.error.message}</FormError>}
                {selectedNutrition?.analysisStatus === "failed" && <FormError>{selectedNutrition.analysisSummary ?? "解析に失敗しました。再解析できます。"}</FormError>}
                {analyze.error !== null && <FormError>{analyze.error.message}</FormError>}
                {!readOnly && (
                  <MealDeleteConfirmation
                    key={`delete:${selectedMeal.id}`}
                    meal={selectedMeal}
                    onDeleted={async (meal) => {
                      restore.reset();
                      setDeletedMeal(meal);
                      onSelectMeal(undefined);
                      await refreshMeals();
                    }}
                  />
                )}
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </Panel>
  );
};
