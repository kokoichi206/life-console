import type { ListConversationsInput } from "@life-console/contracts";
import { queryOptions } from "@tanstack/react-query";

import { api } from "./api";

export const dashboardQuery = queryOptions({
  queryKey: ["dashboard"],
  queryFn: api.dashboard,
  refetchInterval: 30_000,
});

export const tasksQuery = queryOptions({ queryKey: ["tasks"], queryFn: api.tasks });
export const conversationsQuery = (input: ListConversationsInput = { period: "24h" }) => queryOptions({
  queryKey: ["conversations", input],
  queryFn: () => api.conversations(input),
  refetchInterval: 15_000,
});
export const replyDraftsQuery = queryOptions({ queryKey: ["reply-drafts"], queryFn: api.replyDrafts, refetchInterval: 15_000 });
export const mealsQuery = queryOptions({ queryKey: ["meals"], queryFn: api.meals });
export const weightsQuery = queryOptions({ queryKey: ["weights"], queryFn: api.weights });
export const financeQuery = queryOptions({ queryKey: ["finance"], queryFn: api.financeSummary });
export const repositoriesQuery = queryOptions({ queryKey: ["repositories"], queryFn: api.repositories });
export const sourceRepositoryMappingsQuery = queryOptions({ queryKey: ["source-repository-mappings"], queryFn: api.sourceRepositoryMappings });
export const jobsQuery = queryOptions({ queryKey: ["jobs"], queryFn: api.jobs, refetchInterval: 15_000 });
