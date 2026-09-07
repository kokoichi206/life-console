import type { LifeConsoleRepository } from "@api/repositories/life-console-repository";
import { err, ok, safeTry, type Result } from "@life-console/core";
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

const extensionFor = (contentType: string): string => {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
};

export interface MealPhotoUsecase {
  createUpload(clientId: string, contentType: string, requestOrigin: string): Promise<Result<MealPhotoUpload, AppError>>;
  confirmUploaded(photoId: string): Promise<Result<void, AppError>>;
  uploadViaWorker(photoId: string, token: string, contentType: string, body: ReadableStream): Promise<Result<void, AppError>>;
  read(photoId: string): Promise<Result<{ readonly body: ReadableStream; readonly contentType: string; readonly etag: string }, AppError>>;
}

export const createMealPhotoUsecase = (
  repository: LifeConsoleRepository,
  bucket: R2Bucket,
  configuration: UploadConfiguration,
  clock: Clock,
  idGenerator: IdGenerator,
): MealPhotoUsecase => ({
  async createUpload(clientId, contentType, requestOrigin) {
    const photoId = idGenerator.create();
    const token = idGenerator.create();
    const now = clock.now();
    const expiresAt = new Date(now.getTime() + UPLOAD_LIFETIME_MILLISECONDS).toISOString();
    const objectKey = `meals/${now.toISOString().slice(0, 10)}/${photoId}.${extensionFor(contentType)}`;
    const tokenHash = await sha256(token);
    const saved = await repository.createMealPhoto({
      id: photoId,
      clientId,
      contentType,
      objectKey,
      tokenHash,
      expiresAt,
      now: now.toISOString(),
    });
    if (!saved.ok) return saved;

    if (configuration.mode === "worker") {
      return ok({
        photoId,
        uploadUrl: `${requestOrigin}/api/v1/meal-photos/${photoId}/content?token=${token}`,
        expiresAt,
        requiredHeaders: { "Content-Type": contentType },
      });
    }

    const { r2AccessKeyId, r2AccountId, r2BucketName, r2SecretAccessKey } = configuration;
    if (r2AccessKeyId === undefined || r2AccountId === undefined || r2BucketName === undefined || r2SecretAccessKey === undefined) {
      return err(appError.validation("R2 直接アップロード用の設定が不足しています。"));
    }
    const client = new AwsClient({
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
      service: "s3",
      region: "auto",
    });
    const url = new URL(`https://${r2AccountId}.r2.cloudflarestorage.com/${r2BucketName}/${objectKey}`);
    url.searchParams.set("X-Amz-Expires", String(UPLOAD_LIFETIME_MILLISECONDS / 1_000));
    const signed = await safeTry(() => client.sign(url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      aws: { signQuery: true },
    }));
    if (!signed.ok) return err(appError.upstream("R2 upload URL の署名に失敗しました。", signed.error));
    return ok({
      photoId,
      uploadUrl: signed.value.url,
      expiresAt,
      requiredHeaders: { "Content-Type": contentType },
    });
  },
  async confirmUploaded(photoId) {
    const photo = await repository.getMealPhoto(photoId);
    if (!photo.ok) return photo;
    const object = await safeTry(() => bucket.head(photo.value.objectKey));
    if (!object.ok) return err(appError.storage(object.error));
    if (object.value === null) return err(appError.validation("写真のアップロードが完了していません。"));
    if (photo.value.uploadedAt === null) {
      return repository.markMealPhotoUploaded(photoId, clock.now().toISOString());
    }
    return ok(undefined);
  },
  async uploadViaWorker(photoId, token, contentType, body) {
    if (configuration.mode !== "worker") return err(appError.forbidden("Worker 経由アップロードは無効です。"));
    const photo = await repository.getMealPhoto(photoId);
    if (!photo.ok) return photo;
    if (photo.value.contentType !== contentType) return err(appError.validation("写真の Content-Type が一致しません。"));
    if (photo.value.expiresAt <= clock.now().toISOString()) return err(appError.forbidden("写真アップロード URL の期限が切れています。"));
    if (await sha256(token) !== photo.value.tokenHash) return err(appError.forbidden("写真アップロード URL が無効です。"));
    const uploaded = await safeTry(() => bucket.put(photo.value.objectKey, body, {
      httpMetadata: { contentType },
    }));
    if (!uploaded.ok) return err(appError.storage(uploaded.error));
    return repository.markMealPhotoUploaded(photoId, clock.now().toISOString());
  },
  async read(photoId) {
    const photo = await repository.getMealPhoto(photoId);
    if (!photo.ok) return photo;
    const fetched = await safeTry(() => bucket.get(photo.value.objectKey));
    if (!fetched.ok) return err(appError.storage(fetched.error));
    if (fetched.value === null) return err(appError.notFound("写真が見つかりません。"));
    return ok({
      body: fetched.value.body,
      contentType: photo.value.contentType,
      etag: fetched.value.httpEtag,
    });
  },
});
