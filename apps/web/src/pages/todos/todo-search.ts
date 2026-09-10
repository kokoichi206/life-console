export type TodoSearch = {
  readonly view?: "all" | "tasks" | "work" | "personal" | "shopping" | undefined;
  readonly completed?: boolean | undefined;
  readonly placeId?: string | undefined;
  readonly itemId?: string | undefined;
  readonly taskId?: string | undefined;
};

export const parseTodoSearch = (search: Record<string, unknown>): TodoSearch => ({
  ...(typeof search.view === "string" && ["all", "tasks", "work", "personal", "shopping"].includes(search.view) ? { view: search.view as NonNullable<TodoSearch["view"]> } : {}),
  ...(search.completed === true ? { completed: true } : {}),
  ...(typeof search.placeId === "string" ? { placeId: search.placeId } : {}),
  ...(typeof search.itemId === "string" ? { itemId: search.itemId } : {}),
  ...(typeof search.taskId === "string" ? { taskId: search.taskId } : {}),
});
