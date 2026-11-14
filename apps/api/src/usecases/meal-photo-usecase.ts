import type { LifeConsoleRepository } from "@api/repositories/life-console-repository";
import { err, ok, safeTry, type Result } from "@life-console/core";
import type { MealPhotoContentType, MealPhotoVariant } from "@life-console/domain";
import { AwsClient } from "aws4fetch";

import { appError, type AppError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

const UPLOAD_LIFETIME_MILLISECONDS = 10 * 60 * 1_000;

type UploadConfiguration = {
  readonly mode: "worker" | "r2";
  readonly r2AccessKeyId: string | undefined;
  readonly r2AccountId: string | undefined;
  readonly r2BucketName: string | undefined;
  readonly r2SecretAccessKey: string | undefined;
};

export type MealPhotoUpload = {
  readonly photoId: string;
  readonly uploadUrl: string;
  readonly expiresAt: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
};

const sha256 = async (value: string): Promise<string> => {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const extensionFor = (contentType: MealPhotoContentType): string => {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
};

export interface MealPhotoUsecase {
  createUpload(clientId: string, contentType: MealPhotoContentType): Promise<Result<MealPhotoUpload, AppError>>;
  createBlurUpload(photoId: string, contentType: MealPhotoContentType): Promise<Result<MealPhotoUpload | null, AppError>>;
  confirmUploaded(photoId: string, variant?: MealPhotoVariant): Promise<Result<void, AppError>>;
  uploadViaWorker(photoId: string, token: string, contentType: string, body: ReadableStream, variant?: MealPhotoVariant): Promise<Result<void, AppError>>;
  read(photoId: string, variant?: MealPhotoVariant): Promise<Result<{ readonly body: ReadableStream; readonly contentType: string; readonly etag: string }, AppError>>;
}

export const createMealPhotoUsecase = (
  repository: LifeConsoleRepository,
  bucket: R2Bucket,
  configuration: UploadConfiguration,
  clock: Clock,
  idGenerator: IdGenerator,
): MealPhotoUsecase => {
  const getPhoto = (photoId: string, variant: MealPhotoVariant) => variant === "original" ? repository.getMealPhoto(photoId) : repository.getMealPhotoBlur(photoId);
  const markUploaded = (photoId: string, variant: MealPhotoVariant) => variant === "original" ? repository.markMealPhotoUploaded(photoId, clock.now().toISOString()) : repository.markMealPhotoBlurUploaded(photoId, clock.now().toISOString());
  const uploadResponse = async (photoId: string, objectKey: string, contentType: MealPhotoContentType, token: string, expiresAt: string, variant: MealPhotoVariant): Promise<Result<MealPhotoUpload, AppError>> => {
    if (configuration.mode === "worker") return ok({ photoId, uploadUrl: `/api/v1/meal-photos/${photoId}/content?token=${token}${variant === "blurred" ? "&variant=blurred" : ""}`, expiresAt, requiredHeaders: { "Content-Type": contentType } });
    const { r2AccessKeyId, r2AccountId, r2BucketName, r2SecretAccessKey } = configuration;
    if (r2AccessKeyId === undefined || r2AccountId === undefined || r2BucketName === undefined || r2SecretAccessKey === undefined) return err(appError.validation("R2 直接アップロード用の設定が不足しています。"));
    const client = new AwsClient({ accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey, service: "s3", region: "auto" });
    const url = new URL(`https://${r2AccountId}.r2.cloudflarestorage.com/${r2BucketName}/${objectKey}`);
    url.searchParams.set("X-Amz-Expires", String(UPLOAD_LIFETIME_MILLISECONDS / 1_000));
    const signed = await safeTry(() => client.sign(url, { method: "PUT", headers: { "Content-Type": contentType }, aws: { signQuery: true } }));
    if (!signed.ok) return err(appError.upstream("R2 upload URL の署名に失敗しました。", signed.error));
    return ok({ photoId, uploadUrl: signed.value.url, expiresAt, requiredHeaders: { "Content-Type": contentType } });
  };
  return {
    async createUpload(clientId, contentType) {
      const photoId = idGenerator.create();
      const token = idGenerator.create();
      const now = clock.now();
      const expiresAt = new Date(now.getTime() + UPLOAD_LIFETIME_MILLISECONDS).toISOString();
      const objectKey = `meals/${now.toISOString().slice(0, 10)}/${photoId}.${extensionFor(contentType)}`;
      const saved = await repository.createMealPhoto({ id: photoId, clientId, contentType, objectKey, tokenHash: await sha256(token), expiresAt, now: now.toISOString() });
      if (!saved.ok) return saved;
      return uploadResponse(photoId, objectKey, contentType, token, expiresAt, "original");
    },
    async createBlurUpload(photoId, contentType) {
      const original = await repository.getMealPhoto(photoId);
      if (!original.ok) return original;
      const token = idGenerator.create();
      const now = clock.now();
      const expiresAt = new Date(now.getTime() + UPLOAD_LIFETIME_MILLISECONDS).toISOString();
      const objectKey = `${original.value.objectKey}.blur.${extensionFor(contentType)}`;
      const reserved = await repository.reserveMealPhotoBlur({ photoId, contentType, objectKey, tokenHash: await sha256(token), expiresAt, now: now.toISOString() });
      if (!reserved.ok) return reserved;
      if (!reserved.value) return ok(null);
      return uploadResponse(photoId, objectKey, contentType, token, expiresAt, "blurred");
    },
    async confirmUploaded(photoId, variant = "original") {
      const photo = await getPhoto(photoId, variant);
      if (!photo.ok) return photo;
      const object = await safeTry(() => bucket.head(photo.value.objectKey));
      if (!object.ok) return err(appError.storage(object.error));
      if (object.value === null) return err(appError.validation("写真のアップロードが完了していません。"));
      if (photo.value.uploadedAt === null) return markUploaded(photoId, variant);
      return ok(undefined);
    },
    async uploadViaWorker(photoId, token, contentType, body, variant = "original") {
      if (configuration.mode !== "worker") return err(appError.forbidden("Worker 経由アップロードは無効です。"));
      const photo = await getPhoto(photoId, variant);
      if (!photo.ok) return photo;
      if (variant === "blurred" && photo.value.uploadedAt !== null) return err(appError.forbidden("ぼかし画像は保存済みです。"));
      if (photo.value.contentType !== contentType) return err(appError.validation("写真の Content-Type が一致しません。"));
      if (photo.value.expiresAt <= clock.now().toISOString()) return err(appError.forbidden("写真アップロード URL の期限が切れています。"));
      if (await sha256(token) !== photo.value.tokenHash) return err(appError.forbidden("写真アップロード URL が無効です。"));
      const uploaded = await safeTry(() => bucket.put(photo.value.objectKey, body, { httpMetadata: { contentType } }));
      if (!uploaded.ok) return err(appError.storage(uploaded.error));
      return markUploaded(photoId, variant);
    },
    async read(photoId, variant = "original") {
      const photo = await getPhoto(photoId, variant);
      if (!photo.ok) return photo;
      if (variant === "blurred" && photo.value.uploadedAt === null) return err(appError.notFound("ぼかし画像のアップロードが完了していません。"));
      const fetched = await safeTry(() => bucket.get(photo.value.objectKey));
      if (!fetched.ok) return err(appError.storage(fetched.error));
      if (fetched.value === null) return err(appError.notFound("写真が見つかりません。"));
      return ok({ body: fetched.value.body, contentType: photo.value.contentType, etag: fetched.value.httpEtag });
    },
  };
};
