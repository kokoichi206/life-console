import { z } from "zod";

// 購読先はユーザー入力なので、サーバーから任意の URL へ送信させない。
export const pushEndpointSchema = z.url().max(2048)
  .regex(/^https:\/\/(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)\/[^#]+$/u,
    "Chrome・Firefox・Safari の通知先を指定してください。");
export const pushEndpointInputSchema = z.object({ endpoint: pushEndpointSchema });
export const pushSubscriptionSchema = pushEndpointInputSchema.extend({
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/u),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/u),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
export type PushConfiguration = { readonly publicKey: string | null };
export type PushMessage = { readonly title: string; readonly body: string; readonly tag: string };
