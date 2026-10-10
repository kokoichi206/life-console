import { describe, expect, it } from "vitest";

import { createMealSchema } from "./schemas";

const input = { clientId: "11111111-1111-4111-8111-111111111111", photoId: "photo-main", occurredAt: "2026-10-10T12:00:00Z" };
describe("食事の複数写真", () => {
  it("追加写真を省略した既存の 1 枚登録を保持する", () => {
    expect(createMealSchema.parse(input).additionalPhotoIds).toEqual([]);
  });
  it("4 枚以上も保存でき、枚数に上限を設けない", () => {
    const additionalPhotoIds = Array.from({ length: 10 }, (_, index) => `photo-${index}`);
    expect(createMealSchema.parse({ ...input, additionalPhotoIds }).additionalPhotoIds).toEqual(additionalPhotoIds);
  });
  it.each([
    { ...input, photoId: null, additionalPhotoIds: ["second"] },
    { ...input, additionalPhotoIds: ["photo-main"] },
    { ...input, additionalPhotoIds: ["second", "second"] },
  ])("代表写真なし・同じ ID の重複を境界で拒否する", (value) => {
    expect(createMealSchema.safeParse(value).success).toBe(false);
  });
});
