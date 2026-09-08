import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import { openMonitorQueue } from "./monitor-queue-repository";

it("再起動後に未送信観測を取り出し、受理した観測だけ削除する", async () => {
  const directory = await mkdtemp(join(tmpdir(), "monitor-queue-"));
  const path = join(directory, "queue.sqlite");
  const opened = await openMonitorQueue(path);
  assert(opened.ok);
  const observation = { id: randomUUID(), runnerId: "test", service: "runner" as const, account: "process", observedAt: new Date().toISOString(), outcome: "healthy" as const };
  expect((await opened.value.save(observation)).ok).toBe(true);
  opened.value.close();
  const reopened = await openMonitorQueue(path);
  assert(reopened.ok);
  const queued = await reopened.value.pending("9999-01-01T00:00:00.000Z");
  expect(queued).toEqual({ ok: true, value: [observation] });
  expect((await reopened.value.remove(observation.id)).ok).toBe(true);
  expect(await reopened.value.pending("9999-01-01T00:00:00.000Z")).toEqual({ ok: true, value: [] });
  reopened.value.close();
  await rm(directory, { recursive: true });
});
