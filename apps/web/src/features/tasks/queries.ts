import { queryOptions } from "@tanstack/react-query";

import { api } from "../../api";

export const tasksQuery = queryOptions({ queryKey: ["tasks"], queryFn: api.tasks });
