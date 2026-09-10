import type { ShoppingRepository } from "@api/repositories/shopping-repository";
import type { ShoppingList, ShoppingNameInput, UpdateShoppingItemInput } from "@life-console/contracts";
import type { Result } from "@life-console/core";

import type { AppError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

export const createShoppingUsecase = (repository: ShoppingRepository, clock: Clock, ids: IdGenerator) => ({
  list: (): Promise<Result<ShoppingList, AppError>> => repository.list(),
  createPlace: (input: ShoppingNameInput): Promise<Result<void, AppError>> => repository.createPlace(ids.create(), input, clock.now().toISOString()),
  renamePlace: (id: string, input: ShoppingNameInput): Promise<Result<void, AppError>> => repository.renamePlace(id, input, clock.now().toISOString()),
  createItem: (placeId: string, input: ShoppingNameInput): Promise<Result<void, AppError>> => repository.createItem(ids.create(), placeId, input, clock.now().toISOString()),
  updateItem: (id: string, input: UpdateShoppingItemInput): Promise<Result<void, AppError>> => repository.updateItem(id, input, clock.now().toISOString()),
  deleteItem: (id: string): Promise<Result<void, AppError>> => repository.deleteItem(id),
  setPlace: (itemId: string, placeId: string, linked: boolean): Promise<Result<void, AppError>> => repository.setPlace(itemId, placeId, linked),
});
