import type { ShoppingList, ShoppingNameInput, UpdateShoppingItemInput } from "@life-console/contracts";
import { err, ok, safeTry, type Result } from "@life-console/core";
import { shoppingItemPlaces, shoppingItems, shoppingPlaces } from "@life-console/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { appError, type AppError } from "../shared/app-error";

export interface ShoppingRepository {
  list(): Promise<Result<ShoppingList, AppError>>;
  createPlace(id: string, input: ShoppingNameInput, now: string): Promise<Result<void, AppError>>;
  renamePlace(id: string, input: ShoppingNameInput, now: string): Promise<Result<void, AppError>>;
  createItem(id: string, placeId: string, input: ShoppingNameInput, now: string): Promise<Result<void, AppError>>;
  updateItem(id: string, input: UpdateShoppingItemInput, now: string): Promise<Result<void, AppError>>;
  deleteItem(id: string): Promise<Result<void, AppError>>;
  setPlace(itemId: string, placeId: string, linked: boolean): Promise<Result<void, AppError>>;
}

export const createShoppingRepository = (database: D1Database): ShoppingRepository => {
  const db = drizzle(database);
  return {
    async list() {
      const result = await safeTry(() => db.batch([
        db.select({ id: shoppingPlaces.id, name: shoppingPlaces.name }).from(shoppingPlaces).orderBy(asc(shoppingPlaces.createdAt), asc(shoppingPlaces.id)),
        db.select({ id: shoppingItems.id, name: shoppingItems.name, purchasedAt: shoppingItems.purchasedAt }).from(shoppingItems).orderBy(asc(shoppingItems.createdAt), asc(shoppingItems.id)),
        db.select().from(shoppingItemPlaces),
      ]));
      if (!result.ok) return err(appError.storage(result.error));
      const [places, items, links] = result.value;
      return ok({ places, items: items.map((item) => ({ ...item, placeIds: links.filter((link) => link.itemId === item.id).map((link) => link.placeId) })) });
    },
    async createPlace(id, input, now) {
      const result = await safeTry(() => db.insert(shoppingPlaces).values({ id, name: input.name, createdAt: now, updatedAt: now }).run());
      return result.ok ? ok(undefined) : err(appError.storage(result.error));
    },
    async renamePlace(id, input, now) {
      const result = await safeTry(() => db.update(shoppingPlaces).set({ name: input.name, updatedAt: now }).where(eq(shoppingPlaces.id, id)).run());
      if (!result.ok) return err(appError.storage(result.error));
      return result.value.meta.changes > 0 ? ok(undefined) : err(appError.notFound("買う場所が見つかりません。"));
    },
    async createItem(id, placeId, input, now) {
      const result = await safeTry(() => db.batch([
        db.insert(shoppingItems).select(db.select({
          id: sql<string>`${id}`.as("id"), name: sql<string>`${input.name}`.as("name"), purchasedAt: sql<null>`null`.as("purchased_at"), createdAt: sql<string>`${now}`.as("created_at"), updatedAt: sql<string>`${now}`.as("updated_at"),
        }).from(shoppingPlaces).where(eq(shoppingPlaces.id, placeId))),
        db.insert(shoppingItemPlaces).select(db.select({ itemId: shoppingItems.id, placeId: sql<string>`${placeId}`.as("place_id") }).from(shoppingItems).where(eq(shoppingItems.id, id))),
      ]));
      if (!result.ok) return err(appError.storage(result.error));
      return result.value[0].meta.changes > 0 ? ok(undefined) : err(appError.notFound("買う場所が見つかりません。"));
    },
    async updateItem(id, input, now) {
      const result = await safeTry(() => db.update(shoppingItems).set({
        name: input.name,
        purchasedAt: input.purchased === undefined ? undefined : input.purchased ? sql`coalesce(${shoppingItems.purchasedAt}, ${now})` : null,
        updatedAt: now,
      }).where(eq(shoppingItems.id, id)).run());
      if (!result.ok) return err(appError.storage(result.error));
      return result.value.meta.changes > 0 ? ok(undefined) : err(appError.notFound("買うものが見つかりません。"));
    },
    async deleteItem(id) {
      const result = await safeTry(() => db.delete(shoppingItems).where(eq(shoppingItems.id, id)).run());
      if (!result.ok) return err(appError.storage(result.error));
      return result.value.meta.changes > 0 ? ok(undefined) : err(appError.notFound("買うものが見つかりません。"));
    },
    async setPlace(itemId, placeId, linked) {
      if (!linked) {
        const result = await safeTry(() => db.delete(shoppingItemPlaces).where(and(eq(shoppingItemPlaces.itemId, itemId), eq(shoppingItemPlaces.placeId, placeId))).run());
        return result.ok ? ok(undefined) : err(appError.storage(result.error));
      }
      const result = await safeTry(() => db.insert(shoppingItemPlaces).select(
        db.select({ itemId: shoppingItems.id, placeId: shoppingPlaces.id }).from(shoppingItems)
          .innerJoin(shoppingPlaces, eq(shoppingPlaces.id, placeId)).where(eq(shoppingItems.id, itemId)),
      ).onConflictDoUpdate({ target: [shoppingItemPlaces.itemId, shoppingItemPlaces.placeId], set: { placeId } }).run());
      if (!result.ok) return err(appError.storage(result.error));
      return result.value.meta.changes > 0 ? ok(undefined) : err(appError.notFound("買うもの、または場所が見つかりません。"));
    },
  };
};
