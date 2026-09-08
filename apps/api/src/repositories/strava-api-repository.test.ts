import { expect, it, vi } from "vitest";

import { createStravaApiRepository } from "./strava-api-repository";

it("Workers が扱えるモードで認可し、リダイレクト先へ認証情報を送らない", async () => {
  const request = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    expect(init?.redirect).toBe("manual");
    return new Response(null, { status: 302, headers: { Location: "https://other.example/token" } });
  });
  const repository = createStravaApiRepository({ clientId: "123", clientSecret: "test", redirectUri: "http://localhost/api/v1/strava/callback" }, request);
  expect(await repository.authorize("test-code")).toMatchObject({ ok: false, error: { code: "upstream_error" } });
  expect(request).toHaveBeenCalledTimes(1);
});

it("未計測の心拍を補わず、取得範囲の端を暦日どおりに扱う", async () => {
  const activity = { name: "架空の運動", sport_type: "Run", start_date: "2026-09-06T15:00:00Z", distance: 5000, moving_time: 1800, elapsed_time: 1800 };
  const request = vi.fn(async () => Response.json([
    { ...activity, id: 1 }, { ...activity, id: 2, average_heartrate: null }, { ...activity, id: 3, average_heartrate: 0 },
    { ...activity, id: 4, average_heartrate: 150 },
    { ...activity, id: 5, start_date: "2026-09-06T14:59:59Z" },
    { ...activity, id: 6, start_date: "2026-09-07T15:00:00Z" },
  ]));
  const repository = createStravaApiRepository({ clientId: "123", clientSecret: "test", redirectUri: "http://localhost/api/v1/strava/callback" }, request);
  const result = await repository.activities("test", { from: "2026-09-07", to: "2026-09-07", page: 1 });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.activities.map((entry) => entry.averageHeartrate)).toEqual([null, null, null, 150]);
  expect(result.value.nextPage).toBe(2);
});
