import { Dialog } from "@base-ui/react/dialog";
import type { Meal } from "@life-console/contracts";
import { Utensils, X } from "lucide-react";
import { useState } from "react";

import { EmptyState, Panel, SectionHeading } from "../../../components/DesignSystem";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/Button";

const mealKindLabel = (kind: string): string => ({ breakfast: "朝食", lunch: "昼食", dinner: "夕食", snack: "間食" }[kind] ?? kind);
const mealDateTime = (occurredAt: string): string => new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(occurredAt));

const MealPhoto = ({ photoId, alt, className }: { readonly photoId: string; readonly alt: string; readonly className: string }) => {
  const [failed, setFailed] = useState(false);
  return failed
    ? <p className="grid h-full min-h-32 place-items-center px-3 text-center text-xs text-destructive">写真を読み込めませんでした。</p>
    : <img src={`/api/v1/meal-photos/${encodeURIComponent(photoId)}/content`} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />;
};

export const MealGallery = ({ meals, selectedMealId, onSelectMeal }: {
  readonly meals: ReadonlyArray<Meal>;
  readonly selectedMealId: string | undefined;
  readonly onSelectMeal: (id: string | undefined) => void;
}) => {
  const selectedMeal = meals.find((meal) => meal.id === selectedMealId);
  return (
    <Panel className="mb-6" id="meals">
      <SectionHeading eyebrow="MEALS" title="食事の記録" />
      <div className="px-5">
        <p className="mb-4 text-xs text-muted-foreground">新しい順・直近 100 件まで</p>
        {meals.length === 0
          ? <EmptyState>まだ食事記録がありません。『食事を記録』から写真やメモを残せます。</EmptyState>
          : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {meals.map((meal) => (
                  <button key={meal.id} type="button" className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={() => onSelectMeal(meal.id)} aria-label={`${mealDateTime(meal.occurredAt)} の${mealKindLabel(meal.mealKind)}を開く`}>
                    <div className="aspect-square w-full shrink-0 overflow-hidden bg-muted">
                      {meal.photoId === null
                        ? (
                            <div className="grid h-full content-center justify-items-center gap-2 text-muted-foreground">
                              <Utensils aria-hidden="true" className="size-7" />
                              <span className="text-xs">メモのみ</span>
                            </div>
                          )
                        : <MealPhoto photoId={meal.photoId} alt={`${mealKindLabel(meal.mealKind)}の写真`} className="size-full object-cover" />}
                    </div>
                    <div className="grid w-full gap-2 p-3">
                      <Badge variant="secondary">{mealKindLabel(meal.mealKind)}</Badge>
                      <time dateTime={meal.occurredAt} className="text-xs text-muted-foreground">{mealDateTime(meal.occurredAt)}</time>
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
              <Dialog.Title className="text-lg font-semibold">{selectedMeal === undefined ? "食事の記録" : mealKindLabel(selectedMeal.mealKind)}</Dialog.Title>
              <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="食事の詳細を閉じる" />}><X /></Dialog.Close>
            </header>
            <Dialog.Description className="mb-4 text-sm text-muted-foreground">{selectedMeal === undefined ? "この食事記録は一覧にありません。" : mealDateTime(selectedMeal.occurredAt)}</Dialog.Description>
            {selectedMeal !== undefined && (
              <div className="grid gap-4">
                {selectedMeal.photoId !== null && <div className="overflow-hidden rounded-xl bg-muted"><MealPhoto key={selectedMeal.photoId} photoId={selectedMeal.photoId} alt={`${mealKindLabel(selectedMeal.mealKind)}の写真`} className="max-h-[60dvh] w-full object-contain" /></div>}
                {selectedMeal.memo !== "" && <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{selectedMeal.memo}</p>}
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </Panel>
  );
};
