import { afterEach, describe, expect, it } from "vitest";

import { app } from "../apps/api/src/app";

import { createJobStorage } from "./support/d1-storage";

const databases: ReturnType<typeof createJobStorage>["database"][] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("agent の質問 API", () => {
  it("質問を保存し、画面の回答を同じ実行だけが取得できる", async () => {
    const { database, repository, binding } = createJobStorage();
    databases.push(database);
    const now = new Date().toISOString();
    const token = crypto.randomUUID();
    database.prepare("INSERT INTO tasks (id, title, description, status, created_at, updated_at) VALUES ('t1', '確認用の調査', '', 'doing', ?, ?)").run(now, now);
    await repository.createJob({ id: "j1", kind: "agent", taskId: "t1", idempotencyKey: "j1", payloadJson: "{}", now });
    await repository.claimJob("r1", token, new Date(Date.now() + 180_000).toISOString(), now);
    const environment = { DB: binding, APP_ENV: "local", PHOTO_UPLOAD_MODE: "worker" };
    const post = (path: string, body: unknown) => app.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, environment);
    const path = `/api/v1/job-reports/j1/${token}/questions`;
    expect((await post(path, { question: " " })).status).toBe(400);
    const created = await post(path, { question: "まとめ方を教えてください。" });
    expect(created.status).toBe(200);
    const { data } = await created.json() as { readonly data: { readonly id: string } };
    const pending = await app.request("/api/v1/agent-questions", {}, environment);
    expect(await pending.json()).toMatchObject({ data: [{ id: data.id, taskTitle: "確認用の調査" }] });
    expect((await post(`/api/v1/agent-questions/${data.id}/answer`, { answer: "3 点でまとめて。" })).status).toBe(200);
    const answered = await app.request(`${path}/${data.id}`, {}, environment);
    expect(await answered.json()).toMatchObject({ data: { answer: "3 点でまとめて。" } });
    expect((await app.request(`/api/v1/job-reports/j1/${crypto.randomUUID()}/questions/${data.id}`, {}, environment)).status).toBe(403);
    expect((await post(`/api/v1/agent-questions/${data.id}/answer`, { answer: "上書き" })).status).toBe(409);
  });
});
