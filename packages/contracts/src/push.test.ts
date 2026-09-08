import { describe, expect, it } from "vitest";

import { pushEndpointSchema, pushSubscriptionSchema } from "./push";

describe("Push 購読先の入力境界", () => {
  it.each(["https://fcm.googleapis.com/fcm/send/test", "https://updates.push.services.mozilla.com/wpush/v2/test", "https://web.push.apple.com/test"])("対応する通知先 %s を受け付ける", (endpoint) => {
    expect(pushEndpointSchema.safeParse(endpoint).success).toBe(true);
  });
  it.each(["http://fcm.googleapis.com/test", "https://localhost/test", "https://fcm.googleapis.com.evil.example/test", "https://user:password@fcm.googleapis.com/test", "https://fcm.googleapis.com:8443/test", "https://fcm.googleapis.com/test#fragment"])("任意の通信先 %s を拒否する", (endpoint) => {
    expect(pushEndpointSchema.safeParse(endpoint).success).toBe(false);
  });
  it("長さの異なる暗号鍵を拒否する", () => {
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/test", keys: { auth: "short", p256dh: "short" } }).success).toBe(false);
  });
});
