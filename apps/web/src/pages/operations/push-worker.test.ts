import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

describe("通知の受信と遷移", () => {
  it("API を再取得せず通知し、クリックでは同じ origin の実行状況を開く", async () => {
    const callbacks = new Map<string, (event: unknown) => void>();
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const openWindow = vi.fn().mockResolvedValue(undefined);
    const self = { addEventListener: (type: string, callback: (event: unknown) => void) => callbacks.set(type, callback),
      registration: { showNotification }, clients: { openWindow }, location: { origin: "https://console.example.com" } };
    runInNewContext(readFileSync(new URL("../../../public/push-sw.js", import.meta.url), "utf8"), { self, URL });
    const waitUntil = vi.fn();
    callbacks.get("push")!({ data: { json: () => ({ title: "Life Console", body: "runner 応答なし", tag: "runner", url: "https://other.example" }) }, waitUntil });
    expect(showNotification).toHaveBeenCalledWith("Life Console", expect.objectContaining({ body: "runner 応答なし", tag: "runner" }));
    const close = vi.fn();
    callbacks.get("notificationclick")!({ notification: { close }, waitUntil });
    expect(close).toHaveBeenCalledOnce();
    expect(openWindow).toHaveBeenCalledWith("https://console.example.com/operations");
  });
});
