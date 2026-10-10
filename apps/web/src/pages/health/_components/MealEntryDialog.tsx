import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { api } from "../../../api";
import { Field, FormError } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { normalizeMealPhoto } from "../meal-photo";

const currentLocalDateTime = (): string => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

type PhotoPreview = { blob: Blob; url: string };
type PhotoError = { error: string };
type PreparedPhoto = { quarterTurns: number; preview: PhotoPreview | PhotoError };

const MealEntryForm = ({ onSaved }: { readonly onSaved: () => void }) => {
  const queryClient = useQueryClient();
  const initialOccurredAt = currentLocalDateTime();
  const [occurredAt, setOccurredAt] = useState(initialOccurredAt);
  const [caloriesKcal, setCaloriesKcal] = useState("");
  const [memo, setMemo] = useState("");
  const [photos, setPhotos] = useState<Array<{ id: string; file: File; quarterTurns: number }>>([]);
  const [preparedPhotos, setPreparedPhotos] = useState<Record<string, PreparedPhoto>>({});
  const photoCache = useRef(new Map<string, PreparedPhoto>());
  const previews = photos.map((photo) => {
    const prepared = preparedPhotos[photo.id];
    return prepared?.quarterTurns === photo.quarterTurns ? prepared.preview : undefined;
  });
  const readyPhotos = previews.every((preview): preview is PhotoPreview => preview !== undefined && "blob" in preview) ? previews : undefined;
  const photoLibraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    const rotations = new Map(photos.map((photo) => [photo.id, photo.quarterTurns]));
    for (const [id, prepared] of photoCache.current) {
      if (rotations.get(id) === prepared.quarterTurns) continue;
      if ("url" in prepared.preview) URL.revokeObjectURL(prepared.preview.url);
      photoCache.current.delete(id);
    }
    setPreparedPhotos(Object.fromEntries(photoCache.current));
    // 元の写真から変換し、回転を繰り返しても JPEG の再圧縮を重ねない。
    // 変換済みの写真を保持し、元画像のデコードを一度に走らせない。
    void (async () => {
      for (const photo of photos) {
        if (photoCache.current.has(photo.id)) continue;
        const preview = await normalizeMealPhoto(photo.file, photo.quarterTurns).then<PhotoPreview, PhotoError>(
          (blob) => ({ blob, url: URL.createObjectURL(blob) }),
          (reason: unknown) => ({ error: reason instanceof Error ? reason.message : String(reason) }),
        );
        if (cancelled) {
          if ("url" in preview) URL.revokeObjectURL(preview.url);
          return;
        }
        photoCache.current.set(photo.id, { quarterTurns: photo.quarterTurns, preview });
        setPreparedPhotos(Object.fromEntries(photoCache.current));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photos]);
  useEffect(() => {
    const cache = photoCache.current;
    return () => {
      for (const prepared of cache.values()) if ("url" in prepared.preview) URL.revokeObjectURL(prepared.preview.url);
      cache.clear();
    };
  }, []);
  const selectPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files!);
    setPhotos((current) => [...current, ...selected.map((file) => ({ id: crypto.randomUUID(), file, quarterTurns: 0 }))]);
    event.target.value = "";
  };
  const createMeal = useMutation({
    mutationFn: async () => {
      const clientId = crypto.randomUUID();
      const photoIds: string[] = [];
      for (const preview of readyPhotos!) {
        const upload = await api.createMealUpload({ clientId: crypto.randomUUID(), contentType: "image/jpeg" });
        const response = await fetch(upload.uploadUrl, {
          method: "PUT", headers: upload.requiredHeaders, body: preview.blob,
        });
        if (!response.ok) throw new Error("写真のアップロードに失敗しました。");
        photoIds.push(upload.photoId);
      }
      return api.createMeal({ clientId, photoId: photoIds[0] ?? null, additionalPhotoIds: photoIds.slice(1), ...(caloriesKcal === "" ? {} : { manualCaloriesKcal: Number(caloriesKcal) }), memo, occurredAt: new Date(occurredAt).toISOString(), tags: [] });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["meals"] }),
        queryClient.invalidateQueries({ queryKey: ["meal-gallery"] }),
        queryClient.invalidateQueries({ queryKey: ["meal-day-counts"] }),
        queryClient.invalidateQueries({ queryKey: ["nutrition"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      onSaved();
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMeal.mutate();
  };

  return (
    <form onSubmit={submit} className="mt-6">
      <fieldset disabled={createMeal.isPending} className="grid min-w-0 gap-4">
        <legend className="sr-only">食事の内容と日時</legend>
        <div className="grid gap-3">
          <p className="text-xs text-muted-foreground">{`写真（任意・${photos.length} 枚）`}</p>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((photo, index) => (
              <div key={photo.id} className={`min-w-0 space-y-2 ${photos.length === 1 ? "col-span-2" : ""}`}>
                <div className="relative overflow-hidden rounded-xl border bg-muted">
                  {previews?.[index] !== undefined && "url" in previews[index]
                    ? <img src={previews[index].url} alt={index === 0 ? "選択した食事の写真" : `選択した食事の写真 ${index + 1}`} className="h-36 w-full object-contain" />
                    : <p role="status" className="grid h-36 place-items-center text-xs text-muted-foreground">{previews?.[index] !== undefined ? "写真を読み込めませんでした。" : "写真を準備しています…"}</p>}
                  <Button type="button" variant="secondary" size="icon" className="absolute top-2 right-2" aria-label={index === 0 ? "選択した写真を取り消す" : `写真 ${index + 1} を取り消す`} onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))}><X /></Button>
                </div>
                {previews?.[index] !== undefined && "error" in previews[index] && <FormError>{previews[index].error}</FormError>}
                <div className="grid gap-2">
                  <p className="truncate text-xs text-muted-foreground">{`${index === 0 ? "代表写真 · " : ""}${photo.file.name}`}</p>
                  <Button type="button" variant="outline" size="sm" disabled={previews?.[index] === undefined || !("url" in previews[index])} aria-label={index === 0 ? "左に 90° 回転" : `写真 ${index + 1} を左に 90° 回転`} onClick={() => setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, quarterTurns: (item.quarterTurns + 3) % 4 } : item))}>
                    <RotateCcw />
                    左に 90° 回転
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-12" onClick={() => photoLibraryInput.current?.click()}>
              <ImagePlus />
              写真を選ぶ
            </Button>
            <Button type="button" variant="outline" className="h-12" onClick={() => cameraInput.current?.click()}>
              <Camera />
              カメラで撮る
            </Button>
          </div>
          <input ref={photoLibraryInput} type="file" accept="image/*" multiple aria-label="保存済みの写真" className="hidden" onChange={selectPhoto} />
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label="カメラで撮影する写真" className="hidden" onChange={selectPhoto} />
          <p className="text-xs text-muted-foreground">最初の写真を一覧に表示します。全ての写真とメモを同じ 1 回の食事として解析します。</p>
        </div>
        <Field label="食事の日時"><Input required type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></Field>
        <Field label="カロリー（kcal・任意）"><Input type="number" inputMode="numeric" min={0} step={1} value={caloriesKcal} onChange={(event) => setCaloriesKcal(event.target.value)} aria-describedby="meal-calories-help" /></Field>
        <p id="meal-calories-help" className="text-xs text-muted-foreground">入力した場合は自動解析しません。空欄なら写真またはメモから自動で推定します。</p>
        <Field label="メモ"><Textarea rows={3} maxLength={2_000} placeholder="例：おにぎり 2 個、味噌汁" value={memo} onChange={(event) => setMemo(event.target.value)} /></Field>
        <Button type="submit" disabled={createMeal.isPending || readyPhotos === undefined || (photos.length === 0 && memo.trim() === "")} className="h-12 w-full rounded-2xl text-base">
          {createMeal.isPending ? "保存しています…" : "食事を保存"}
        </Button>
      </fieldset>
      {createMeal.error !== null && <div className="mt-3"><FormError>{createMeal.error.message}</FormError></div>}
    </form>
  );
};

export const MealEntryDialog = ({ open, onOpenChange }: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm" />
      <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 max-h-[95dvh] overflow-y-auto rounded-t-3xl bg-card px-6 pt-6 pb-[max(24px,env(safe-area-inset-bottom))] text-foreground shadow-2xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-foreground/15 sm:hidden" aria-hidden="true" />
        <header className="flex items-start justify-between gap-3">
          <div>
            <Dialog.Title className="text-xl font-semibold tracking-tight">食事を記録</Dialog.Title>
            <Dialog.Description className="mt-1.5 text-xs text-muted-foreground">写真なしでも、食べたものをメモに入力して記録できます。</Dialog.Description>
          </div>
          <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="食事の記録を閉じる" />}><X /></Dialog.Close>
        </header>
        {open && <MealEntryForm onSaved={() => onOpenChange(false)} />}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
