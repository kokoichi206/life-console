import { queryOptions } from "@tanstack/react-query";

import { api } from "../../api";

export const repositoriesQuery = queryOptions({ queryKey: ["repositories"], queryFn: api.repositories });
