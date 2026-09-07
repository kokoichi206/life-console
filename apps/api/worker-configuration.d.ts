interface Env {
  readonly APP_ENV: "local" | "development" | "production";
  readonly ASSETS: Fetcher;
  readonly DB: D1Database;
  readonly MEAL_PHOTOS: R2Bucket;
  readonly PHOTO_UPLOAD_MODE: "worker" | "r2";
  readonly RUNNER_TOKEN?: string;
  readonly R2_ACCESS_KEY_ID?: string;
  readonly R2_ACCOUNT_ID?: string;
  readonly R2_BUCKET_NAME?: string;
  readonly R2_SECRET_ACCESS_KEY?: string;
}
