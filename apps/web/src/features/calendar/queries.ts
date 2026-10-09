import { useQueryClient } from "@tanstack/react-query";

import { api } from "../../api";

export const collectionCalendarQuery = { queryKey: ["collection-calendar"], queryFn: () => api.collectionCalendar({ from: "2026-04-01", through: "2027-03-31" }), refetchInterval: 60_000 };

export const useRefreshCalendar = () => {
  const queryClient = useQueryClient();
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: collectionCalendarQuery.queryKey }), queryClient.invalidateQueries({ queryKey: ["tasks"] }), queryClient.invalidateQueries({ queryKey: ["dashboard"] })]);
};
