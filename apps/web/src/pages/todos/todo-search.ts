export type TodoSearch = {
  readonly view?: "all" | "tasks" | "work" | "personal" | "shopping" | "calendar" | undefined;
  readonly month?: string | undefined;
  readonly eventId?: string | undefined;
  readonly completed?: boolean | undefined;
  readonly placeId?: string | undefined;
  readonly itemId?: string | undefined;
  readonly taskId?: string | undefined;
};

export const parseTodoSearch = (search: Record<string, unknown>): TodoSearch => ({
  ...(typeof search.view === "string" && ["all", "tasks", "work", "personal", "shopping", "calendar"].includes(search.view) ? { view: search.view as NonNullable<TodoSearch["view"]> } : {}),
  ...(typeof search.month === "string" && /^\d{4}-(?:0[1-9]|1[0-2])$/u.test(search.month) ? { month: search.month } : {}),
  ...(typeof search.eventId === "string" ? { eventId: search.eventId } : {}),
  ...(search.completed === true ? { completed: true } : {}),
  ...(typeof search.placeId === "string" ? { placeId: search.placeId } : {}),
  ...(typeof search.itemId === "string" ? { itemId: search.itemId } : {}),
  ...(typeof search.taskId === "string" ? { taskId: search.taskId } : {}),
});
