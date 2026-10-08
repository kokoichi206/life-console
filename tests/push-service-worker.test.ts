import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

const workerSource = readFileSync(new URL("../apps/web/public/push-sw.js", import.meta.url), "utf8");
const setup = () => {
  type Event = {
    waitUntil: (promise: Promise<unknown>) => void;
    data?: { json: () => unknown };
    notification?: { close: () => void; data?: unknown };
  };
  const handlers = new Map<string, (event: Event) => void>();
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async (_url: string) => undefined);
  runInNewContext(workerSource, {
    URL,
    self: {
      addEventListener: (name: string, callback: (event: Event) => void) => handlers.set(name, callback),
      registration: { showNotification }, clients: { openWindow }, location: { origin: "https://console.example.com" },
    },
  });
  const click = (data?: unknown) => {
    const pending: Promise<unknown>[] = [];
    const close = vi.fn();
    handlers.get("notificationclick")!({ notification: { close, data }, waitUntil: (promise) => {
      pending.push(promise);
    } });
    expect(close).toHaveBeenCalledOnce();
    return Promise.all(pending);
  };
  return { handlers, showNotification, openWindow, click };
};

describe("通知から本人確認画面への遷移", () => {
  it("受信した依頼 ID を通知へ保持し、URL に安全に符号化して渡す", async () => {
    const { handlers, showNotification, openWindow, click } = setup();
    const message = { title: "Life Console", body: "新しい依頼があります。", tag: "confirmation-1", workConfirmationId: "id&next=https://other.example" };
    const pending: Promise<unknown>[] = [];
    handlers.get("push")!({ data: { json: () => message }, waitUntil: (promise) => {
      pending.push(promise);
    } });
    await Promise.all(pending);
    expect(showNotification).toHaveBeenCalledWith(message.title, expect.objectContaining({
      body: message.body, tag: message.tag, data: { workConfirmationId: message.workConfirmationId, calendarEventId: undefined },
    }));
    await click({ workConfirmationId: message.workConfirmationId });
    const destination = new URL(openWindow.mock.calls[0]![0]);
    expect(destination.origin).toBe("https://console.example.com");
    expect(destination.pathname).toBe("/tasks");
    expect(destination.searchParams.get("view")).toBe("confirmations");
    expect(destination.searchParams.get("confirmationId")).toBe(message.workConfirmationId);
    expect(destination.searchParams.has("next")).toBe(false);
  });
  it("収集日の通知は対象のカレンダーを開く", async () => {
    const { openWindow, click } = setup();
    await click({ calendarEventId: "event&next=https://other.example" });
    const destination = new URL(openWindow.mock.calls[0]![0]);
    expect(destination.origin).toBe("https://console.example.com");
    expect(destination.pathname).toBe("/todos");
    expect(destination.searchParams.get("view")).toBe("calendar");
    expect(destination.searchParams.get("eventId")).toBe("event&next=https://other.example");
    expect(destination.searchParams.has("next")).toBe(false);
  });
  it("既存の通知と、文字列以外の依頼 ID は実行状況を開く", async () => {
    const { openWindow, click } = setup();
    await click();
    await click({ workConfirmationId: 123, url: "https://other.example" });
    expect(openWindow).toHaveBeenNthCalledWith(1, "https://console.example.com/operations");
    expect(openWindow).toHaveBeenNthCalledWith(2, "https://console.example.com/operations");
  });
});
