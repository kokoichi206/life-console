import { queryOptions } from "@tanstack/react-query";

import { api } from "../../api";

export const sourceRepositoryMappingsQuery = queryOptions({ queryKey: ["source-repository-mappings"], queryFn: api.sourceRepositoryMappings });
