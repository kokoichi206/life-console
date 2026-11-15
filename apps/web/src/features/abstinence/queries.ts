import { queryOptions } from "@tanstack/react-query";

import { api } from "../../api";

export const abstinenceQuery = queryOptions({ queryKey: ["abstinence"], queryFn: api.abstinence });
