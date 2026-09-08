import { monitorState, type MonitorHistory, type MonitoringSummary } from "@life-console/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { api } from "../../api";
import { EmptyState, FormError, Panel, SectionHeading } from "../../components/DesignSystem";
import { Button } from "../../components/ui/Button";
import { NativeSelect } from "../../components/ui/native-select";
import { monitoringQuery } from "../../features/monitoring/MonitoringAlert";

const stateLabels = { healthy: "正常", delayed: "応答が遅れています", unavailable: "5 分以上応答なし", warning: "接続確認に失敗", unknown: "初回の確認待ち" };
const outcomeLabels = { healthy: "正常", auth_required: "再ログインが必要", permission_denied: "権限を確認", unavailable: "取得に失敗", timeout: "時間超過", invalid_response: "応答形式を確認", not_configured: "アカウント設定が必要" };
export const MonitoringStatusView = ({ summary, error, loading }: { readonly summary: MonitoringSummary | undefined; readonly error: string | null; readonly loading: boolean }) => (
  <Panel className="mb-4">
    <SectionHeading eyebrow="MONITORING" title="死活監視" />
    <div className="space-y-3 px-5">
      <p className="text-xs text-muted-foreground">2 分ごとに確認し、全件を保存します。5 分以上の未着、認証エラー、連続失敗を通知します。</p>
      {loading && <p role="status">監視状態を確認しています。</p>}
      {error !== null && <FormError>{error}</FormError>}
      {summary?.targets.length === 0 && <EmptyState>監視対象が未登録です。runner の監視設定と起動状態を確認してください。</EmptyState>}
      {summary?.targets.map((target) => {
        const state = monitorState(target, Date.now());
        return (
          <article key={target.id} className="space-y-1 border-t py-2 text-sm">
            <strong className="block break-words">
              {target.runnerId}
              {" "}
              /
              {" "}
              {target.service}
              {" "}
              /
              {" "}
              {target.account}
            </strong>
            <p className={state === "healthy" ? "text-foreground" : "text-destructive"}>
              {stateLabels[state]}
              {target.outcome !== null && target.outcome !== "healthy" ? ` · ${outcomeLabels[target.outcome]}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              最終受信:
              {target.receivedAt === null ? "未受信" : new Date(target.receivedAt).toLocaleString("ja-JP")}
            </p>
          </article>
        );
      })}
      {summary !== undefined && (
        <p className="text-xs text-muted-foreground">
          自動判定の最終成功:
          {summary.lastMaintenanceAt === null ? "未確認" : new Date(summary.lastMaintenanceAt).toLocaleString("ja-JP")}
        </p>
      )}
      {summary !== undefined && (
        <p className="text-xs text-muted-foreground">
          {`通知待ち ${summary.pendingNotifications} 件（送信開始済み・再試行待ち ${summary.failedNotifications} 件）`}
        </p>
      )}
    </div>
  </Panel>
);
export const MonitoringPanel = () => {
  const summary = useQuery(monitoringQuery);
  const { monitorTarget, monitorBefore } = useSearch({ from: "/operations" });
  const navigate = useNavigate({ from: "/operations" });
  const history = useQuery({ queryKey: ["monitor-history", monitorTarget, monitorBefore], queryFn: () => api.monitoringHistory(monitorTarget, monitorBefore), refetchInterval: monitorBefore === undefined ? 15_000 : false });
  const move = (target: string | undefined, before: number | undefined) => {
    void navigate({ search: { monitorTarget: target, monitorBefore: before } });
  };
  const rows: ReadonlyArray<MonitorHistory> = history.data ?? [];
  return (
    <>
      <MonitoringStatusView summary={summary.data} error={summary.error?.message ?? null} loading={summary.isPending} />
      <Panel className="mb-4">
        <SectionHeading eyebrow="HISTORY" title="監視履歴" />
        <div className="space-y-3 px-5">
          <NativeSelect aria-label="監視履歴の対象" className="w-full" value={monitorTarget ?? ""} onChange={(event) => move(event.target.value || undefined, undefined)}>
            <option value="">すべての対象</option>
            {summary.data?.targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.runnerId}
                {" "}
                /
                {" "}
                {target.service}
                {" "}
                /
                {" "}
                {target.account}
              </option>
            ))}
          </NativeSelect>
          {history.isPending && <p role="status">履歴を読み込んでいます。</p>}
          {history.error !== null && <FormError>{history.error.message}</FormError>}
          {rows.map((row) => (
            <article key={row.sequence} className="border-t py-2 text-xs">
              <p className="break-words">{`${row.runnerId} / ${row.service} / ${row.account}`}</p>
              <p>
                {new Date(row.observedAt).toLocaleString("ja-JP")}
                {" "}
                ·
                {" "}
                {outcomeLabels[row.outcome]}
                {row.historical === 1 ? " · 通信復旧後に保存" : ""}
              </p>
            </article>
          ))}
          {history.isSuccess && rows.length === 0 && <EmptyState>この範囲の履歴はありません。</EmptyState>}
          <div className="flex gap-2">
            <Button variant="outline" disabled={monitorBefore === undefined} onClick={() => move(monitorTarget, undefined)}>最新へ</Button>
            <Button variant="outline" disabled={rows.length < 100 || history.isFetching} onClick={() => move(monitorTarget, rows.at(-1)!.sequence)}>さらに前の 100 件</Button>
          </div>
        </div>
      </Panel>
    </>
  );
};
