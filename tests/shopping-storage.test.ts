import { describe, expect, it } from "vitest";

import { app } from "../apps/api/src/app";
import type { ShoppingList, Task } from "../packages/contracts/src/index";

import { createJobStorage } from "./support/d1-storage";

const setup = () => {
  const storage = createJobStorage();
  const request = (path: string, method = "GET", body?: unknown) => app.request(`/api/v1/${path}`, {
    method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, { APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker", DB: storage.binding });
  const list = async () => (await (await request("shopping")).json() as { data: ShoppingList }).data;
  return { ...storage, request, list };
};

describe("場所別の買い物の保存", () => {
  it("場所の中で作成し、複数の場所で共有した購入状態を戻せる", async () => {
    const { database, request, list } = setup();
    try {
      for (const name of ["スーパー", "薬局"]) expect((await request("shopping/places", "POST", { name })).status).toBe(200);
      const places = (await list()).places;
      const first = places[0]!.id;
      const second = places[1]!.id;
      expect((await request(`shopping/places/${first}/items`, "POST", { name: "石けん" })).status).toBe(200);
      const itemId = (await list()).items[0]!.id;
      expect((await request(`shopping/items/${itemId}/places/${second}`, "PUT", { linked: true })).status).toBe(200);
      expect((await request(`shopping/items/${itemId}/places/${second}`, "PUT", { linked: true })).status).toBe(200);
      expect((await list()).items).toEqual([{ id: itemId, name: "石けん", purchasedAt: null, placeIds: expect.arrayContaining([first, second]) }]);
      expect((await list()).items[0]!.placeIds).toHaveLength(2);
      expect((await request(`shopping/items/${itemId}`, "PATCH", { purchased: true })).status).toBe(200);
      expect((await list()).items[0]!.purchasedAt).not.toBeNull();
      expect((await request(`shopping/items/${itemId}`, "PATCH", { name: "せっけん" })).status).toBe(200);
      expect((await list()).items[0]!.purchasedAt).not.toBeNull();
      expect((await request(`shopping/items/${itemId}`, "PATCH", { purchased: false })).status).toBe(200);
      expect((await list()).items[0]).toMatchObject({ name: "せっけん", purchasedAt: null });
      for (const placeId of [first, second]) expect((await request(`shopping/items/${itemId}/places/${placeId}`, "PUT", { linked: false })).status).toBe(200);
      expect((await list()).items[0]!.placeIds).toEqual([]);
      expect((await request(`shopping/items/${itemId}/places/${second}`, "PUT", { linked: true })).status).toBe(200);
      expect((await request(`shopping/places/${second}`, "PATCH", { name: "駅前の薬局" })).status).toBe(200);
      expect((await list()).places.find((place) => place.id === second)?.name).toBe("駅前の薬局");
      expect((await request(`shopping/items/${itemId}`, "DELETE")).status).toBe(200);
      expect((await list()).items).toEqual([]);
      expect(database.prepare("SELECT * FROM shopping_item_places").all()).toEqual([]);
    } finally { database.close(); }
  });

  it("存在しない場所への追加を 404 にし、品だけを残さない", async () => {
    const { database, request, list } = setup();
    try {
      expect((await request("shopping/places/missing/items", "POST", { name: "牛乳" })).status).toBe(404);
      expect((await list()).items).toEqual([]);
      expect((await request("shopping/places", "POST", { name: "  " })).status).toBe(400);
      expect((await request("shopping/items/missing", "PATCH", { purchased: true })).status).toBe(404);
      expect((await request("shopping/items/missing/places/missing", "PUT", { linked: true })).status).toBe(404);
    } finally { database.close(); }
  });
});

describe("やることと仕事の共通タスク", () => {
  it("既存タスクの互換性を保ち、任意の日時と参照リンクを部分更新で失わない", async () => {
    const { database, request } = setup();
    try {
      const created = await request("tasks", "POST", { title: "公開する", description: "公開後も確認", conversationId: "source-conversation" });
      expect(created.status).toBe(200);
      const { data: task } = await created.json() as { data: Task };
      expect(task).toMatchObject({ area: "work", dueAt: null, scheduledAt: null, sourceUrl: null });
      expect((await request(`tasks/${task.id}`, "PATCH", { scheduledAt: "2026-09-20T09:00:00Z", dueAt: "2026-09-21T09:00:00Z", sourceUrl: "https://example.com/request" })).status).toBe(200);
      expect((await request(`tasks/${task.id}`, "PATCH", { status: "done" })).status).toBe(200);
      const listed = await (await request("tasks")).json() as { data: Task[] };
      expect(listed.data).toHaveLength(1);
      expect(listed.data[0]).toMatchObject({ id: task.id, status: "done", description: "公開後も確認", conversationId: "source-conversation", scheduledAt: "2026-09-20T09:00:00Z", dueAt: "2026-09-21T09:00:00Z", sourceUrl: "https://example.com/request" });
      expect((await request(`tasks/${task.id}`, "PATCH", { dueAt: null, scheduledAt: null, sourceUrl: null, area: "personal" })).status).toBe(200);
      expect((await (await request("tasks")).json())).toMatchObject({ data: [{ dueAt: null, scheduledAt: null, sourceUrl: null, area: "personal" }] });
      expect((await request("tasks", "POST", { title: "危険なリンク", sourceUrl: "javascript:alert(1)" })).status).toBe(400);
      expect(database.prepare("SELECT count(*) AS count FROM tasks").get()?.count).toBe(1);
    } finally { database.close(); }
  });
});
