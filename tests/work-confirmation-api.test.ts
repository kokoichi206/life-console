import { afterEach, describe, expect, it } from "vitest";

import { app } from "../apps/api/src/app";

import { createJobStorage } from "./support/d1-storage";
import { workConfirmationInput } from "./support/work-confirmations";

const databases: ReturnType<typeof createJobStorage>["database"][] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("確認依頼の HTTP 経路", () => {
  it("runner 認証、取り込み、表示、対応済みの保存を通す", async () => {
    const { database, binding } = createJobStorage();
    databases.push(database);
    const environment = { DB: binding, APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker" };
    const pending: Promise<unknown>[] = [];
    const executionContext = { waitUntil: (promise: Promise<unknown>) => pending.push(promise), passThroughOnException: () => undefined, props: {} };
    const post = (path: string, body: unknown, token?: string) => app.request(path, {
      method: "POST", headers: { "Content-Type": "application/json", ...(token === undefined ? {} : { Authorization: "Bearer " + token }) },
      body: JSON.stringify(body),
    }, environment, executionContext);
    const path = "/api/v1/runner/work-confirmations/import";
    expect((await post(path, workConfirmationInput())).status).toBe(401);
    expect((await post(path, workConfirmationInput({ sourceUrl: "javascript:alert(1)" }), "local-runner-token")).status).toBe(400);
    expect((await post(path, workConfirmationInput({ repositoryName: "other/project" }), "local-runner-token")).status).toBe(400);
    expect((await post(path, workConfirmationInput(), "local-runner-token")).status).toBe(200);
    await Promise.all(pending);
    const response = await app.request("/api/v1/work-confirmations", {}, environment);
    const { data } = await response.json() as { data: { confirmations: { id: string; status: string }[] } };
    expect(data.confirmations).toHaveLength(1);
    const id = data.confirmations[0]!.id;
    expect((await post("/api/v1/work-confirmations/" + id + "/complete", {})).status).toBe(200);
    expect(await (await app.request("/api/v1/work-confirmations", {}, environment)).json()).toMatchObject({ data: { confirmations: [{ status: "done", completedBy: "user" }] } });
    expect((await post("/api/v1/work-confirmations/missing/complete", {})).status).toBe(404);
  });
  it("不正な時刻と重複 ID を入口で拒否する", async () => {
    const { database, binding } = createJobStorage();
    databases.push(database);
    const input = workConfirmationInput({ checkedAt: "2026-10-01T00:00:00Z" });
    const post = (body: unknown) => app.request("/api/v1/runner/work-confirmations/import", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer local-runner-token" }, body: JSON.stringify(body),
    }, { DB: binding, APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker" });
    expect((await post(input)).status).toBe(400);
    expect((await post({ ...workConfirmationInput(), confirmations: [workConfirmationInput().confirmations[0], workConfirmationInput().confirmations[0]] })).status).toBe(400);
    expect(database.prepare("SELECT count(*) AS n FROM work_confirmations").get()!.n).toBe(0);
  });
});
