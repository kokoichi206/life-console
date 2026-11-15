import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { api } from "../../api";

import { useHealthQueries } from "./queries";

export const useStravaActivities = (from: string, to: string) => {
  const client = useQueryClient();
  const { stravaStatusQuery, read, stravaActivitiesKey, readOnly } = useHealthQueries();
  const status = useQuery(stravaStatusQuery);
  const authorize = useMutation({ mutationFn: api.authorizeStrava, onSuccess: (url) => {
    window.location.assign(url);
  } });
  const disconnect = useMutation({
    mutationFn: async () => {
      await Promise.all([
        client.cancelQueries({ queryKey: ["strava-activities"] }),
        client.cancelQueries({ queryKey: ["strava-calories"] }),
        client.cancelQueries({ queryKey: ["strava-calories-sync-status"] }),
      ]);
      await api.disconnectStrava();
    },
    onSuccess: async () => {
      client.setQueryData(stravaStatusQuery.queryKey, { configured: true, athleteId: null });
      client.removeQueries({ queryKey: ["strava-activities"] });
      client.removeQueries({ queryKey: ["strava-calories"] });
      client.removeQueries({ queryKey: ["strava-calories-sync-status"] });
      await client.invalidateQueries({ queryKey: stravaStatusQuery.queryKey });
    },
  });
  const sync = useMutation({
    mutationFn: () => api.syncStrava({ from, to }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["strava-calories-sync-status"] }),
        client.invalidateQueries({ queryKey: ["strava-activities"] }),
        client.invalidateQueries({ queryKey: ["strava-calories"] }),
      ]);
    },
  });
  const connected = status.isSuccess && status.data.athleteId !== null;
  const activities = useInfiniteQuery({
    queryKey: stravaActivitiesKey(status.data?.athleteId, from, to),
    queryFn: ({ pageParam, signal }) => read.stravaActivities(from, to, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (page) => page.nextPage,
    enabled: connected && !disconnect.isPending,
    retry: false, gcTime: 5 * 60_000, staleTime: 60_000, refetchOnWindowFocus: false, refetchInterval: 60_000,
  });
  const { fetchNextPage, hasNextPage, isFetching, isError } = activities;
  useEffect(() => {
    if (connected && !disconnect.isPending && hasNextPage && !isFetching && !isError) void fetchNextPage();
  }, [connected, disconnect.isPending, hasNextPage, isFetching, isError, fetchNextPage]);
  const complete = connected && activities.isSuccess && !activities.hasNextPage && !disconnect.isPending;
  const pages = activities.data?.pages;
  // 応答が変わらない限り同じ配列を返し、収支の日別集計を再計算させない。
  const records = useMemo(
    () => complete && pages !== undefined ? [...new Map(pages.flatMap((page) => page.activities).map((activity) => [activity.id, activity])).values()] : [],
    [complete, pages],
  );
  return { readOnly, status, authorize, disconnect, sync, connected, activities, complete, records };
};
