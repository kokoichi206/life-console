import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";

import { createHealthReadApi } from "../../api";

import { HealthRouteContent } from "./HealthRoutePage";
import { createHealthQueries, HealthQueriesContext } from "./queries";

export const SharedHealthRoutePage = () => {
  const { token } = useParams({ from: "/share/health/$token" });
  const search = useSearch({ from: "/share/health/$token" });
  const navigate = useNavigate({ from: "/share/health/$token" });
  const queries = useMemo(() => createHealthQueries(createHealthReadApi(`/api/v1/share/${encodeURIComponent(token)}`), ["health-share", token], true), [token]);
  return (
    <HealthQueriesContext value={queries}>
      <HealthRouteContent search={search} navigate={(options) => { void navigate(options); }} />
    </HealthQueriesContext>
  );
};
