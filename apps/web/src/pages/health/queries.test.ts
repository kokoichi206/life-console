import type { StravaActivity } from "@life-console/contracts";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createJobStorage } from "../../../../../tests/support/d1-storage";
import { app } from "../../../../api/src/app";
import { createStravaCaloriesRepository } from "../../../../api/src/repositories/strava-calories-repository";
import { createHealthReadApi } from "../../api";

import { exerciseCaloriesByDay } from "./exercise-calories";
import { exerciseChartWeeks } from "./exercise-chart-weeks";
import { exerciseWeeks } from "./exercise-weeks";
import { createHealthQueries } from "./queries";

const settings = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", STRAVA_CLIENT_ID: "123", STRAVA_CLIENT_SECRET: "test-client-secret", STRAVA_TOKEN_KEY: "ab".repeat(32), STRAVA_REDIRECT_URI: "http://localhost/api/v1/strava/callback" };
const activity = (id: string, occurredAt: string, sportType = "Run"): StravaActivity => ({ id, occurredAt, sportType, name: "架空の運動", distanceMeters: 5000, movingSeconds: 1800, elapsedSeconds: 1800, averageHeartrate: null });

afterEach(() => vi.unstubAllGlobals());

describe("健康画面のカロリー取得", () => {
  it("保存済みの全ページとカロリーを HTTP API から読み、週の合計と取得状態へ反映する", async () => {
    const storage = createJobStorage();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      const repository = createStravaCaloriesRepository(storage.binding);
      const records = Array.from({ length: 101 }, (_, index) => activity(String(index), "2026-09-06T15:00:00.000Z", index === 0 ? "Walk" : "Run"));
      expect(await repository.registerOrTouch([...records, activity("outside", "2026-09-06T14:59:59.999Z")], "2026-09-14T00:00:00Z")).toMatchObject({ ok: true });
      expect(await repository.saveMeasured("0", 250, "2026-09-14T00:00:00Z")).toMatchObject({ ok: true });
      expect(await repository.markUnavailable("1", "2026-09-14T00:00:00Z")).toMatchObject({ ok: true });
      const calls: string[] = [];
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        calls.push(url.pathname);
        return app.request(new Request(url, init), {}, { ...settings, DB: storage.binding });
      }));
      const read = createHealthReadApi("http://localhost/api/v1");
      const queries = createHealthQueries(read, []);
      const signal = new AbortController().signal;
      const first = await read.stravaActivities("2026-09-07", "2026-09-13", 1, signal);
      expect(first.nextPage).toBe(2);
      const second = await read.stravaActivities("2026-09-07", "2026-09-13", first.nextPage!, signal);
      expect(second.nextPage).toBeNull();
      const activities = [...first.activities, ...second.activities];
      const calories = await client.fetchQuery(queries.stravaCaloriesQuery("2026-09-07", "2026-09-13", true));
      expect(calories).toHaveLength(101);
      const weeks = exerciseChartWeeks(exerciseWeeks("2026-09-07", "2026-09-13", activities, [], []), { kind: "calories", byDay: exerciseCaloriesByDay(activities, calories) }, "2026-09-19");
      expect(weeks[0]).toMatchObject({ value: 250, summary: "250 kcal（取得済み分） ・ 未取得 99 件 ・ 取得不可 1 件" });
      expect(await repository.saveMeasured("2", 500, "2026-09-14T01:00:00Z")).toMatchObject({ ok: true });
      await client.invalidateQueries({ queryKey: ["strava-calories"] });
      const refreshed = await client.fetchQuery(queries.stravaCaloriesQuery("2026-09-07", "2026-09-13", true));
      expect(exerciseChartWeeks(exerciseWeeks("2026-09-07", "2026-09-13", activities, [], []), { kind: "calories", byDay: exerciseCaloriesByDay(activities, refreshed) }, "2026-09-19")[0]).toMatchObject({ value: 750 });
      expect(calls).toEqual(["/api/v1/strava/activities", "/api/v1/strava/activities", "/api/v1/strava/calories", "/api/v1/strava/calories"]);
    } finally {
      client.clear();
      storage.database.close();
    }
  });

  it("期間の取得を中断するとカロリーの HTTP リクエストも中断する", async () => {
    const client = new QueryClient();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      requestSignal = init!.signal!;
      requestSignal.addEventListener("abort", () => reject(requestSignal!.reason), { once: true });
    })));
    try {
      const queries = createHealthQueries(createHealthReadApi("http://localhost/api/v1"), []);
      const query = queries.stravaCaloriesQuery("2026-09-07", "2026-09-13", true);
      const result = client.fetchQuery(query).catch((error: unknown) => error);
      await vi.waitFor(() => expect(requestSignal).toBeDefined());
      await client.cancelQueries({ queryKey: query.queryKey });
      await result;
      expect(requestSignal!.aborted).toBe(true);
      expect(client.getQueryData(query.queryKey)).toBeUndefined();
    } finally { client.clear(); }
  });
});
