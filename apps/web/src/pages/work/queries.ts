import type { ListConversationsInput } from "@life-console/contracts";
import { queryOptions } from "@tanstack/react-query";

import { api } from "../../api";

export const tasksQuery = queryOptions({ queryKey: ["tasks"], queryFn: api.tasks });
export const conversationsQuery = (input: ListConversationsInput = { period: "24h" }) => queryOptions({
  queryKey: ["conversations", input],
  queryFn: () => api.conversations(input),
  refetchInterval: 15_000,
});
export const replyDraftsQuery = queryOptions({ queryKey: ["reply-drafts"], queryFn: api.replyDrafts, refetchInterval: 15_000 });
