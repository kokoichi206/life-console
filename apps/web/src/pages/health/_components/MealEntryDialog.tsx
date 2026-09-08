import { Dialog } from "@base-ui/react/dialog";
import type { CreateMealInput } from "@life-console/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { api } from "../../../api";
import { Field, FormError } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { NativeSelect } from "../../../components/ui/native-select";
import { Textarea } from "../../../components/ui/textarea";
import { normalizeMealPhoto } from "../meal-photo";

const currentLocalDateTime = (): string => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const MealEntryForm = ({ onSaved }: { readonly onSaved: () => void }) => {
  const queryClient = useQueryClient();
  const [occurredAt, setOccurredAt] = useState(currentLocalDateTime);
  const [mealKind, setMealKind] = useState<CreateMealInput["mealKind"]>("dinner");
  const [memo, setMemo] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>();
  const photoLibraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (photo === null) {
      setPhotoPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const selectPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected !== undefined) setPhoto(selected);
    event.target.value = "";
  };
  const createMeal = useMutation({
    mutationFn: async () => {
      const clientId = crypto.randomUUID();
      let photoId: string | null = null;
      if (photo !== null) {
        const normalized = await normalizeMealPhoto(photo);
        const upload = await api.createMealUpload({ clientId, contentType: "image/jpeg" });
        const response = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: upload.requiredHeaders,
          body: normalized,
        });
        if (!response.ok) throw new Error("写真のアップロードに失敗しました。");
        photoId = upload.photoId;
      }
      return api.createMeal({ clientId, photoId, memo, mealKind, occurredAt: new Date(occurredAt).toISOString(), tags: [] });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["meals"] }),
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
          {photoPreviewUrl !== undefined && (
            <div className="relative overflow-hidden rounded-xl border bg-muted">
              <img src={photoPreviewUrl} alt="選択した食事の写真" className="max-h-52 w-full object-contain" />
              <Button type="button" variant="secondary" size="icon" className="absolute top-2 right-2" aria-label="選択した写真を取り消す" onClick={() => setPhoto(null)}><X /></Button>
            </div>
          )}
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
        <Field label="食事区分">
          <NativeSelect className="w-full" value={mealKind} onChange={(event) => setMealKind(event.target.value as CreateMealInput["mealKind"])}>
            <option value="breakfast">朝食</option>
            <option value="lunch">昼食</option>
            <option value="dinner">夕食</option>
            <option value="snack">間食</option>
          </NativeSelect>
        </Field>
        <Field label="食事の日時"><Input required type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></Field>
        <Field label="メモ"><Textarea rows={3} maxLength={2_000} placeholder="食べたものを記録" value={memo} onChange={(event) => setMemo(event.target.value)} /></Field>
        <Button type="submit" disabled={createMeal.isPending || (photo === null && memo.trim() === "")} className="h-12 w-full rounded-2xl text-base">
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
