import { queryOptions } from "@tanstack/react-query";

import { api } from "../../api";

export const jobsQuery = queryOptions({ queryKey: ["jobs"], queryFn: api.jobs, refetchInterval: 15_000 });
