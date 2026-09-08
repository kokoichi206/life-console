import { expect, it } from "vitest";

import { app } from "../apps/api/src/app";

import { createJobStorage } from "./support/d1-storage";

it("食事の期間指定は日本時間の境界で絞り、100 件を超えても欠落させない", async () => {
  const { binding, database } = createJobStorage();
  try {
    const insert = database.prepare("INSERT INTO meals (id, client_id, memo, meal_kind, occurred_at, recorded_at, tags_json) VALUES (?, ?, '', 'snack', ?, ?, '[]')");
    for (let index = 0; index < 101; index++) insert.run(String(index), String(index), "2026-09-06T15:00:00Z", "2026-09-07T00:00:00Z");
    insert.run("before", "before", "2026-09-06T14:59:59Z", "2026-09-07T00:00:00Z");
    insert.run("after", "after", "2026-09-07T15:00:00Z", "2026-09-07T00:00:00Z");
    const environment = { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: binding };
    const response = await app.request("/api/v1/meals?from=2026-09-07&to=2026-09-07", {}, environment);
    const payload = await response.json() as { data: { id: string }[] };
    expect(payload.data).toHaveLength(101);
    expect(payload.data.some((meal) => ["before", "after"].includes(meal.id))).toBe(false);
    expect((await app.request("/api/v1/meals?from=2026-09-07", {}, environment)).status).toBe(400);
    expect((await app.request("/api/v1/meals", {}, environment)).status).toBe(200);
  } finally { database.close(); }
});
