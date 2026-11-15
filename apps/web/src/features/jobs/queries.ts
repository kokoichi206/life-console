import { queryOptions } from "@tanstack/react-query";

import { api } from "../../api";

import { activeJobStatuses } from "./JobProgress";

export const jobsQuery = queryOptions({ queryKey: ["jobs"], queryFn: api.jobs, refetchInterval: (query) => query.state.data?.some((job) => activeJobStatuses.has(job.status)) === true ? 15_000 : 60_000 });
