import { z } from "zod";

export const shoppingNameSchema = z.object({ name: z.string().trim().min(1).max(240) });
export const updateShoppingItemSchema = shoppingNameSchema.partial().extend({ purchased: z.boolean().optional() });
export const shoppingLinkSchema = z.object({ linked: z.boolean() });
export type ShoppingNameInput = z.infer<typeof shoppingNameSchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
export type ShoppingList = {
  readonly places: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly purchasedAt: string | null;
    readonly placeIds: ReadonlyArray<string>;
  }>;
};
