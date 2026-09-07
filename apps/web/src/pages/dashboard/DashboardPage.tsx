import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { CountBadge, EmptyState, Eyebrow, MetricCard, Panel, SectionHeading, StatusDot } from "../../components/DesignSystem";
import { LineChart } from "../../components/LineChart";
import { PageHeader } from "../../components/PageHeader";
import { Badge } from "../../components/ui/badge";
import { buttonVariants } from "../../components/ui/Button";
import { dashboardQuery } from "../../features/overview/queries";
import { cn } from "../../lib/class-names";

const money = (value: number): string => new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
}).format(value);

const statusLabel = (status: string): string => ({
  inbox: "受信箱",
  todo: "未着手",
  doing: "進行中",
}[status] ?? status);

const HealthItem = ({ healthy, label, detail }: { readonly healthy: boolean; readonly label: string; readonly detail: string }) => (
  <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-0.5">
    <span className={cn("size-2 rounded-full ring-4", healthy ? "bg-success ring-success/15" : "bg-warning ring-warning/15")} />
    <strong className="text-xs">{label}</strong>
    <small className="col-start-2 text-[0.65rem] leading-5 text-muted-foreground">{detail}</small>
  </div>
);

export const DashboardPage = () => {
  const { data } = useSuspenseQuery(dashboardQuery);
  const latestWeight = data.weights.at(-1);
  const runner = data.runners[0];
  const connectorErrorCount = data.connectors.filter((connector) => connector.lastErrorCode !== null).length;
  const latestConnectorSuccessAt = data.connectors.map((connector) => connector.lastSuccessAt).filter((timestamp): timestamp is string => timestamp !== null).toSorted().at(-1);

  return (
    <>
      <PageHeader
        eyebrow="TODAY / OVERVIEW"
        title="ホーム"
        actions={<CountBadge>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(new Date())}</CountBadge>}
      />
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="クイック入力">
        <Link className={buttonVariants()} to="/tasks" search={{ create: true }}>タスクを追加</Link>
        <Link className={buttonVariants({ variant: "outline" })} to="/health" search={{ entry: "meal" }}>食事を記録</Link>
        <Link className={buttonVariants({ variant: "outline" })} to="/health" search={{ entry: "weight" }}>体重を記録</Link>
        <Link className={buttonVariants({ variant: "outline" })} to="/finance" search={{ entry: "expense" }}>支出を記録</Link>
        <Link className={buttonVariants({ variant: "outline" })} to="/operations" search={{ entry: "note" }}>メモを記録</Link>
      </nav>
      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="今日のタスク"
          value={data.todayTasks.length}
          detail={`${data.todayTasks.filter((task) => task.status === "doing").length}件が進行中`}
          tone="orange"
        />
        <MetricCard label="未処理の会話" value={data.conversations.length} detail="分類待ちのメンション" tone="gold" />
        <MetricCard label="登録済み収支" value={<span className="text-2xl">{money(data.finance.netCashflowYen)}</span>} detail={`純資産 ${money(data.finance.netWorthYen)}`} tone="primary" />
        <MetricCard
          label="最新の体重"
          value={(
            <>
              {latestWeight?.weightKg.toFixed(1) ?? "—"}
              <span className="ml-1 text-sm font-medium text-muted-foreground">kg</span>
            </>
          )}
          detail={`7日平均 ${latestWeight?.movingAverage7DaysKg.toFixed(1) ?? "—"} kg`}
          tone="blue"
        />
      </section>
      <div className="mb-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel>
          <SectionHeading
            eyebrow="FOCUS"
            title="対応するタスク"
            action={<Link className={buttonVariants({ variant: "link", size: "sm" })} to="/tasks" search={{ view: "tasks" }}>すべて見る</Link>}
          />
          <div className="px-5">
            {data.todayTasks.slice(0, 5).map((task) => (
              <article key={task.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t py-3 first:border-t-0">
                <StatusDot status={task.status} />
                <div className="min-w-0">
                  <strong className="block truncate text-sm">{task.title}</strong>
                  <small className="text-[0.7rem] text-muted-foreground">{task.repositoryName ?? "リポジトリ未選択"}</small>
                </div>
                <Badge variant="secondary">{statusLabel(task.status)}</Badge>
              </article>
            ))}
            {data.todayTasks.length === 0 && <EmptyState>今日対応するタスクはありません。</EmptyState>}
          </div>
        </Panel>
        <Panel>
          <SectionHeading
            eyebrow="WEIGHT"
            title="体重の推移"
            action={<Link className={buttonVariants({ variant: "link", size: "sm" })} to="/health">詳細</Link>}
          />
          <div className="px-5">
            <LineChart
              points={data.weights.slice(-21).map((point) => ({
                label: new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(point.occurredAt)),
                value: point.weightKg,
                secondaryValue: point.movingAverage7DaysKg,
              }))}
              valueSuffix=" kg"
            />
          </div>
        </Panel>
      </div>
      <Panel className="grid gap-5 px-5 lg:grid-cols-[1.2fr_repeat(4,1fr)] lg:items-center">
        <div>
          <Eyebrow>LOCAL SYSTEM</Eyebrow>
          <h2 className="mt-1.5 text-base font-semibold">Runner と connector</h2>
        </div>
        <HealthItem healthy={runner !== undefined} label={runner?.name ?? "runner 未登録"} detail={runner === undefined ? "Mac runner を起動してください" : `最終 heartbeat ${new Date(runner.lastHeartbeatAt).toLocaleString("ja-JP")}`} />
        <HealthItem healthy={runner?.orcaStatus === "healthy"} label="Orca" detail={runner?.orcaStatus ?? "unknown"} />
        <HealthItem
          healthy={connectorErrorCount === 0}
          label="Connector"
          detail={`${connectorErrorCount === 0 ? `${data.connectors.length} source 正常` : `${connectorErrorCount} source でエラー`}${latestConnectorSuccessAt === undefined ? "" : ` · 最終成功 ${new Date(latestConnectorSuccessAt).toLocaleString("ja-JP")}`}`}
        />
        <HealthItem healthy={data.delayedJobCount === 0} label="遅延 job" detail={`${data.delayedJobCount}件`} />
      </Panel>
    </>
  );
};
