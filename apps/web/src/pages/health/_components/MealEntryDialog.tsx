import { Dialog } from "@base-ui/react/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, RotateCw, X } from "lucide-react";
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

const MealEntryForm = ({ onSaved }: { readonly onSaved: () => void }) => {
  const queryClient = useQueryClient();
  const initialOccurredAt = currentLocalDateTime();
  const [occurredAt, setOccurredAt] = useState(initialOccurredAt);
  const [caloriesKcal, setCaloriesKcal] = useState("");
  const [memo, setMemo] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [preparedPhoto, setPreparedPhoto] = useState<{ source: File; quarterTurns: number; blob: Blob; url: string }>();
  const [photoError, setPhotoError] = useState<string>();
  const photoPreview = preparedPhoto?.source === photo && preparedPhoto.quarterTurns === quarterTurns ? preparedPhoto : undefined;
  const photoLibraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setPhotoError(undefined);
    if (photo === null) {
      setPreparedPhoto(undefined);
      return;
    }
    let cancelled = false;
    let previewUrl: string | undefined;
    // 元の写真から変換し、回転を繰り返しても JPEG の再圧縮を重ねない。
    void normalizeMealPhoto(photo, quarterTurns).then((blob) => {
      if (cancelled) return;
      previewUrl = URL.createObjectURL(blob);
      setPreparedPhoto({ source: photo, quarterTurns, blob, url: previewUrl });
    }).catch((error: unknown) => {
      if (!cancelled) setPhotoError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
      if (previewUrl !== undefined) URL.revokeObjectURL(previewUrl);
    };
  }, [photo, quarterTurns]);
  const selectPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected !== undefined) {
      setPhoto(selected);
      setQuarterTurns(0);
    }
    event.target.value = "";
  };
  const createMeal = useMutation({
    mutationFn: async () => {
      const clientId = crypto.randomUUID();
      let photoId: string | null = null;
      if (photoPreview !== undefined) {
        const upload = await api.createMealUpload({ clientId, contentType: "image/jpeg" });
        const response = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: upload.requiredHeaders,
          body: photoPreview.blob,
        });
        if (!response.ok) throw new Error("写真のアップロードに失敗しました。");
        photoId = upload.photoId;
      }
      return api.createMeal({ clientId, photoId, ...(caloriesKcal === "" ? {} : { manualCaloriesKcal: Number(caloriesKcal) }), memo, occurredAt: new Date(occurredAt).toISOString(), tags: [] });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["meals"] }),
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
          <p className="text-xs text-muted-foreground">写真</p>
          {photo !== null && (
            <div className="relative overflow-hidden rounded-xl border bg-muted">
              {photoPreview !== undefined
                ? <img src={photoPreview.url} alt="選択した食事の写真" className="h-52 w-full object-contain" />
                : <p role="status" className="grid h-52 place-items-center text-xs text-muted-foreground">{photoError === undefined ? "写真を準備しています…" : "写真を読み込めませんでした。"}</p>}
              <Button type="button" variant="secondary" size="icon" className="absolute top-2 right-2" aria-label="選択した写真を取り消す" onClick={() => setPhoto(null)}><X /></Button>
            </div>
          )}
          {photo !== null && (
            <Button type="button" variant="outline" className="h-11" disabled={photoPreview === undefined} onClick={() => setQuarterTurns((turns) => (turns + 1) % 4)}>
              <RotateCw />
              右に 90° 回転
            </Button>
          )}
          {photoError !== undefined && <FormError>{photoError}</FormError>}
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
          <input ref={photoLibraryInput} type="file" accept="image/*" aria-label="保存済みの写真" className="hidden" onChange={selectPhoto} />
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label="カメラで撮影する写真" className="hidden" onChange={selectPhoto} />
          {photo !== null && <p className="truncate text-xs text-muted-foreground">{photo.name}</p>}
        </div>
        <Field label="食事の日時"><Input required type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></Field>
        <Field label="カロリー（kcal・任意）"><Input type="number" inputMode="numeric" min={0} step={1} value={caloriesKcal} onChange={(event) => setCaloriesKcal(event.target.value)} aria-describedby="meal-calories-help" /></Field>
        <p id="meal-calories-help" className="text-xs text-muted-foreground">入力した場合は画像解析しません。空欄なら写真から自動で推定します。</p>
        <Field label="メモ"><Textarea rows={3} maxLength={2_000} placeholder="食べたものを記録" value={memo} onChange={(event) => setMemo(event.target.value)} /></Field>
        <Button type="submit" disabled={createMeal.isPending || (photo !== null && photoPreview === undefined) || (photo === null && memo.trim() === "")} className="h-12 w-full rounded-2xl text-base">
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
            <Dialog.Description className="mt-1.5 text-xs text-muted-foreground">写真やメモで、食べたものを残しましょう。</Dialog.Description>
          </div>
          <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="食事の記録を閉じる" />}><X /></Dialog.Close>
        </header>
        {open && <MealEntryForm onSaved={() => onOpenChange(false)} />}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
