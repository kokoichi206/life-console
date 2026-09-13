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

const detailRepository = (respond: (activityId: string) => Response) => createStravaApiRepository(
  { clientId: "123", clientSecret: "test", redirectUri: "http://localhost/api/v1/strava/callback" },
  vi.fn(async (input: string | URL | Request) => respond(new URL(String(input)).pathname.replace("/api/v3/activities/", ""))),
);

it("値を持たない活動の消費カロリーを 0 kcal と扱わない", async () => {
  const bodies: Record<string, Record<string, unknown>> = {
    measured: { calories: 320.4, moving_time: 1800 },
    omitted: { moving_time: 1800 },
    empty: { calories: null, moving_time: 1800 },
    zeroWithTime: { calories: 0, moving_time: 1800 },
    zeroWithoutTime: { calories: 0, moving_time: 0 },
  };
  const repository = detailRepository((activityId) => Response.json(bodies[activityId]));
  const read = async (activityId: string) => {
    const result = await repository.activityDetail("test", activityId);
    return result.ok ? result.value.caloriesKcal : result.error.code;
  };
  expect(await Promise.all(Object.keys(bodies).map(read))).toEqual([320, null, null, null, 0]);
});

it("読み取り上限と全体上限の使用率のうち厳しい方を結果に添える", async () => {
  const repository = detailRepository(() => Response.json({ calories: 300, moving_time: 1800 }, {
    headers: { "X-ReadRateLimit-Limit": "100,1000", "X-ReadRateLimit-Usage": "20,100", "X-RateLimit-Limit": "200,2000", "X-RateLimit-Usage": "90,200" },
  }));
  const result = await repository.activityDetail("test", "1");
  expect(result).toMatchObject({ ok: true, value: { rateLimit: { fifteenMinuteRatio: 0.45, dailyRatio: 0.1 } } });
});

it("使用量ヘッダーがなければ使用率を推測しない", async () => {
  const repository = detailRepository(() => Response.json({ calories: 300, moving_time: 1800 }));
  expect(await repository.activityDetail("test", "1")).toMatchObject({ ok: true, value: { rateLimit: null } });
});

it("詳細取得の 429 と 404 を種別で区別する", async () => {
  const repository = detailRepository((activityId) => new Response(null, { status: activityId === "limited" ? 429 : 404 }));
  expect(await repository.activityDetail("test", "limited")).toMatchObject({ ok: false, error: { code: "rate_limited" } });
  expect(await repository.activityDetail("test", "missing")).toMatchObject({ ok: false, error: { code: "not_found" } });
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
