import { queryOptions } from "@tanstack/react-query";

import { api } from "../../api";

export const sourceRepositoryMappingsQuery = queryOptions({ queryKey: ["source-repository-mappings"], queryFn: api.sourceRepositoryMappings });
export const connectorSchedulesQuery = queryOptions({ queryKey: ["connector-schedules"], queryFn: api.connectorSchedules, refetchInterval: 15_000 });
