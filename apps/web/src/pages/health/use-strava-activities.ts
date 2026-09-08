import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api } from "../../api";

import { stravaStatusQuery } from "./queries";

export const useStravaActivities = (from: string, to: string) => {
  const client = useQueryClient();
  const status = useQuery(stravaStatusQuery);
  const authorize = useMutation({ mutationFn: api.authorizeStrava, onSuccess: (url) => {
    window.location.assign(url);
  } });
  const disconnect = useMutation({
    mutationFn: async () => {
      await client.cancelQueries({ queryKey: ["strava-activities"] });
      await api.disconnectStrava();
    },
    onSuccess: async () => {
      client.setQueryData(stravaStatusQuery.queryKey, { configured: true, athleteId: null });
      client.removeQueries({ queryKey: ["strava-activities"] });
      await client.invalidateQueries({ queryKey: stravaStatusQuery.queryKey });
    },
  });
  const connected = status.isSuccess && status.data.athleteId !== null;
  const activities = useInfiniteQuery({
    queryKey: ["strava-activities", status.data?.athleteId, from, to],
    queryFn: ({ pageParam, signal }) => api.stravaActivities(from, to, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (page) => page.nextPage,
    enabled: connected && !disconnect.isPending,
    retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false,
  });
  const { fetchNextPage, hasNextPage, isFetching, isError } = activities;
  useEffect(() => {
    if (connected && !disconnect.isPending && hasNextPage && !isFetching && !isError) void fetchNextPage();
  }, [connected, disconnect.isPending, hasNextPage, isFetching, isError, fetchNextPage]);
  const complete = connected && activities.isSuccess && !activities.hasNextPage && !activities.isFetching && !disconnect.isPending;
  const records = complete ? [...new Map(activities.data.pages.flatMap((page) => page.activities).map((activity) => [activity.id, activity])).values()] : [];
  return { status, authorize, disconnect, connected, activities, complete, records };
};
