import { monitorState } from "@life-console/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { api } from "../../api";

export const monitoringQuery = { queryKey: ["monitoring"], queryFn: api.monitoring, refetchInterval: 15_000 };
export const MonitoringAlert = () => {
  const query = useQuery(monitoringQuery);
  if (query.error !== null) return <p role="alert" className="mb-4 rounded-lg border border-destructive p-3 text-sm text-destructive">死活監視の状態を取得できません。接続を確認してください。</p>;
  const problems = query.data?.targets.filter((target) => monitorState(target, Date.now()) !== "healthy") ?? [];
  const maintenanceStale = query.data !== undefined && query.data.targets.length > 0 && (query.data.lastMaintenanceAt === null || Date.now() - Date.parse(query.data.lastMaintenanceAt) >= 180_000);
  if (problems.length === 0 && !maintenanceStale) return null;
  return (
    <p role="status" className="mb-4 shrink-0 rounded-lg border border-destructive p-3 text-sm">
      <Link to="/operations" className="underline">
        {maintenanceStale ? "自動判定の稼働を確認できません。" : ""}
        {problems.length > 0 ? `死活監視で ${problems.length} 件の確認が必要です。` : ""}
        同期・実行状況を開く
      </Link>
    </p>
  );
};
