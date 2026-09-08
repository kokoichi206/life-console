import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "../apps/api/src/app";
import { createStravaApiRepository } from "../apps/api/src/repositories/strava-api-repository";
import { createStravaConnectionRepository } from "../apps/api/src/repositories/strava-connection-repository";
import { appError } from "../apps/api/src/shared/app-error";
import { createStravaUsecase } from "../apps/api/src/usecases/strava-usecase";
import { err } from "../packages/core/src/index";

import { createJobStorage } from "./support/d1-storage";

const credentials = { athleteId: 42, accessToken: "test-access", refreshToken: "test-refresh", expiresAt: 2_000_000_000 };
const settings = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", STRAVA_CLIENT_ID: "123", STRAVA_CLIENT_SECRET: "test-client-secret", STRAVA_TOKEN_KEY: "ab".repeat(32), STRAVA_REDIRECT_URI: "http://localhost/api/v1/strava/callback" };
const origin = { Origin: "http://localhost" };
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("Strava の接続と HTTP", () => {
  it("接続情報を暗号化し、競合と期限切れの保存を拒否する", async () => {
    const { binding, database } = createJobStorage();
    try {
      const repository = createStravaConnectionRepository(binding, settings.STRAVA_TOKEN_KEY);
      expect(await repository.read()).toEqual({ ok: true, value: null });
      expect(await repository.claim("first", 1000)).toEqual({ ok: true, value: true });
      expect(await repository.claim("busy", 2000)).toEqual({ ok: true, value: false });
      expect((await repository.write(credentials, "first", 2000)).ok).toBe(true);
      expect(JSON.stringify(database.prepare("SELECT * FROM strava_connection").all())).not.toContain("test-access");
      expect(await repository.read()).toEqual({ ok: true, value: credentials });
      expect((await repository.write(credentials, "first", 100_000)).ok).toBe(false);
      expect(await repository.claim("second", 100_000)).toEqual({ ok: true, value: true });
      expect((await repository.write(null, "second", 100_001)).ok).toBe(true);
      expect((await repository.write(credentials, "first", 100_002)).ok).toBe(false);
      expect(await repository.read()).toEqual({ ok: true, value: null });
    } finally { database.close(); }
  });
  it("OAuth state を検証し、接続・ページング・解除まで通して秘密を返さない", async () => {
    const { binding, database } = createJobStorage();
    const environment = { ...settings, DB: binding };
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/oauth/token") return Response.json({ access_token: credentials.accessToken, refresh_token: credentials.refreshToken, expires_at: credentials.expiresAt, athlete: { id: 42 } });
      if (url.pathname === "/oauth/revoke") return new Response(null, { status: 200 });
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-access");
      expect(url.searchParams.get("after")).toBe(String(Date.parse("2026-09-06T15:00:00Z") / 1000 - 1));
      expect(url.searchParams.get("before")).toBe(String(Date.parse("2026-09-13T15:00:00Z") / 1000));
      return Response.json(url.searchParams.get("page") === "1" ? [{ id: 1, name: "架空のラン", sport_type: "Run", start_date: "2026-09-07T00:00:00Z", distance: 5000, moving_time: 1800, elapsed_time: 2000 }] : []);
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      expect((await app.request("/api/v1/strava/authorize", { method: "POST", headers: { Origin: "https://other.example" } }, environment)).status).toBe(403);
      const authorized = await app.request("/api/v1/strava/authorize", { method: "POST", headers: origin }, environment);
      const cookie = authorized.headers.get("Set-Cookie")!.split(";")[0]!;
      const url = new URL((await authorized.json() as { data: string }).data);
      expect(url.searchParams.get("scope")).toBe("activity:read_all");
      const invalid = await app.request("/api/v1/strava/callback?state=invalid&code=code&scope=activity:read_all", { headers: { Cookie: cookie } }, environment);
      expect(invalid.headers.get("Location")).toBe("http://localhost/health?strava=error");
      expect(fetcher).not.toHaveBeenCalled();
      const callback = await app.request(`/api/v1/strava/callback?state=${url.searchParams.get("state")}&code=code&scope=activity:read_all`, { headers: { Cookie: cookie } }, environment);
      expect(callback.headers.get("Location")).toBe("http://localhost/health?strava=connected");
      const status = await app.request("/api/v1/strava/status", {}, environment);
      expect(await status.json()).toEqual({ data: { configured: true, athleteId: 42 } });
      expect(status.headers.get("Cache-Control")).toBe("no-store");
      const page = await app.request("/api/v1/strava/activities?from=2026-09-07&to=2026-09-13&page=1", {}, environment);
      expect(await page.json()).toEqual({ data: { activities: [{ id: "1", name: "架空のラン", sportType: "Run", occurredAt: "2026-09-07T00:00:00Z", distanceMeters: 5000, movingSeconds: 1800, elapsedSeconds: 2000, averageHeartrate: null }], nextPage: 2 } });
      const last = await app.request("/api/v1/strava/activities?from=2026-09-07&to=2026-09-13&page=2", {}, environment);
      expect(await last.json()).toEqual({ data: { activities: [], nextPage: null } });
      expect((await app.request("/api/v1/strava/connection", { method: "DELETE", headers: origin }, environment)).status).toBe(200);
      expect(await createStravaConnectionRepository(binding, settings.STRAVA_TOKEN_KEY).read()).toEqual({ ok: true, value: null });
    } finally { database.close(); }
  });
  it.each([401, 429, 503])("外部 API の %s を空の活動一覧に変換しない", async (status) => {
    const { binding, database } = createJobStorage();
    try {
      const repository = createStravaConnectionRepository(binding, settings.STRAVA_TOKEN_KEY);
      await repository.claim("setup", Date.now());
      await repository.write(credentials, "setup", Date.now());
      await repository.release("setup");
      vi.stubGlobal("fetch", vi.fn(async () => new Response("private upstream content", { status })));
      const response = await app.request("/api/v1/strava/activities?from=2026-09-07&to=2026-09-13", {}, { ...settings, DB: binding });
      expect(response.status).toBe(502);
      const body = await response.text();
      expect(body).not.toContain("private upstream content");
      expect(body).not.toContain("\"data\"");
    } finally { database.close(); }
  });
});

it("期限切れの認証を 1 件ずつ更新し、返された最新の refresh token を保持する", async () => {
  const { binding, database } = createJobStorage();
  try {
    const repository = createStravaConnectionRepository(binding, settings.STRAVA_TOKEN_KEY);
    await repository.claim("setup", Date.now());
    await repository.write({ ...credentials, expiresAt: 1 }, "setup", Date.now());
    await repository.release("setup");
    let notifyRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => {
      notifyRefreshStarted = resolve;
    });
    let completeRefresh!: (response: Response) => void;
    const refreshResponse = new Promise<Response>((resolve) => {
      completeRefresh = resolve;
    });
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/oauth/token")) {
        expect(String(init?.body)).toContain("refresh_token=test-refresh");
        notifyRefreshStarted();
        return refreshResponse;
      }
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer new-access");
      return Response.json([]);
    });
    vi.stubGlobal("fetch", fetcher);
    const environment = { ...settings, DB: binding };
    const path = "/api/v1/strava/activities?from=2026-09-07&to=2026-09-13";
    const first = app.request(path, {}, environment);
    await refreshStarted;
    expect((await app.request(path, {}, environment)).status).toBe(409);
    completeRefresh(Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_at: credentials.expiresAt }));
    expect((await first).status).toBe(200);
    expect(await repository.read()).toEqual({ ok: true, value: { ...credentials, accessToken: "new-access", refreshToken: "new-refresh" } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { database.close(); }
});

it("更新した token の保存に失敗したときは再接続を案内し、lease を迂回しない", async () => {
  const { binding, database } = createJobStorage();
  try {
    const repository = createStravaConnectionRepository(binding, settings.STRAVA_TOKEN_KEY);
    const expired = { ...credentials, expiresAt: 1 };
    await repository.claim("setup", Date.now());
    await repository.write(expired, "setup", Date.now());
    await repository.release("setup");
    const failure = appError.storage(new Error("synthetic storage failure"));
    const write = vi.spyOn(repository, "write").mockResolvedValueOnce(err(failure));
    const fetcher = vi.fn(async () => Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_at: credentials.expiresAt }));
    const configuration = { clientId: settings.STRAVA_CLIENT_ID, clientSecret: settings.STRAVA_CLIENT_SECRET, redirectUri: settings.STRAVA_REDIRECT_URI };
    const usecase = createStravaUsecase(repository, createStravaApiRepository(configuration, fetcher), configuration, { now: () => new Date() }, { create: () => "refresh-failure" });
    const result = await usecase.activities({ from: "2026-09-07", to: "2026-09-13", page: 1 });
    expect(result).toEqual({ ok: false, error: { ...failure, message: "更新した接続情報を保存できませんでした。Strava に再接続してください。" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(await repository.read()).toEqual({ ok: true, value: expired });
    expect(await repository.claim("reconnect", Date.now())).toEqual({ ok: true, value: true });
  } finally { database.close(); }
});

it("解除に失敗したときは接続情報を残し、成功と表示しない", async () => {
  const { binding, database } = createJobStorage();
  try {
    const repository = createStravaConnectionRepository(binding, settings.STRAVA_TOKEN_KEY);
    await repository.claim("setup", Date.now());
    await repository.write(credentials, "setup", Date.now());
    await repository.release("setup");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const response = await app.request("/api/v1/strava/connection", { method: "DELETE", headers: origin }, { ...settings, DB: binding });
    expect(response.status).toBe(502);
    expect(await repository.read()).toEqual({ ok: true, value: credentials });
  } finally { database.close(); }
});
