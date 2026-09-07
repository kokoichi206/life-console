import { queryOptions } from "@tanstack/react-query";

import { api } from "../../api";

export const financeQuery = queryOptions({ queryKey: ["finance"], queryFn: api.financeSummary });
