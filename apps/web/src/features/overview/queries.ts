import { queryOptions } from "@tanstack/react-query";

import { api } from "../../api";

export const dashboardQuery = queryOptions({
  queryKey: ["dashboard"],
  queryFn: api.dashboard,
  refetchInterval: 60_000,
});
