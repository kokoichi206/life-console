import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api } from "../api";
import { CountBadge, EmptyState, Eyebrow, Field, FormError, Panel, SectionHeading } from "../components/DesignSystem";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/Button";
import { NativeSelect } from "../components/ui/native-select";
import { Textarea } from "../components/ui/textarea";
import { activeJobStatuses, jobStatusLabels } from "../components/work/JobProgress";
import { dashboardQuery, jobsQuery, repositoriesQuery, sourceRepositoryMappingsQuery } from "../query";

export const OperationsPage = () => {
  const queryClient = useQueryClient();
  const { data: dashboard } = useSuspenseQuery(dashboardQuery);
  const { data: jobs } = useSuspenseQuery(jobsQuery);
  const { data: repositories } = useSuspenseQuery(repositoriesQuery);
  const { data: sourceRepositoryMappings } = useSuspenseQuery(sourceRepositoryMappingsQuery);
  const [noteBody, setNoteBody] = useState("");
  const invalidateOperations = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    ]);
  };
  const syncConnector = useMutation({
    mutationFn: api.syncConnector,
    onSuccess: invalidateOperations,
  });
  const syncRepositories = useMutation({
    mutationFn: api.syncRepositories,
    onSuccess: invalidateOperations,
  });
  const saveSourceRepositoryMapping = useMutation({
    mutationFn: api.upsertSourceRepositoryMapping,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["source-repository-mappings"] }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      ]);
    },
  });
  const cancel = useMutation({
    mutationFn: api.cancelJob,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });
  const createNote = useMutation({
    mutationFn: api.createNote,
    onSuccess: () => setNoteBody(""),
  });
  const submitNote = (event: FormEvent) => {
    event.preventDefault();
    createNote.mutate({ body: noteBody, occurredAt: new Date().toISOString() });
  };
  const slackConnectors = dashboard.connectors.filter((connector) => connector.connector === "slack");
  const chatworkConnectors = dashboard.connectors.filter((connector) => connector.connector === "chatwork");
  const repositoryMappingConnectors = [...slackConnectors, ...chatworkConnectors];
  const latestSuccessAt = (connectors: typeof dashboard.connectors): string | undefined => connectors
    .map((connector) => connector.lastSuccessAt)
    .filter((timestamp): timestamp is string => timestamp !== null)
    .toSorted()
    .at(-1);

  return (
    <>
      <PageHeader eyebrow="LOCAL / OPERATIONS" title="同期・実行状況" description="連携の設定、同期の成否、エージェントの稼働を確認します。" />
      <div className="mb-4">
        <Panel>
          <SectionHeading
            eyebrow="JOB QUEUE"
            title="Job 状態"
            action={(
              <CountBadge>
                <span className="mr-1 size-1.5 rounded-full bg-success" />
                15 秒更新
              </CountBadge>
            )}
          />
          <div className="max-h-[900px] overflow-y-auto px-5">
            {jobs.map((job) => (
              <article key={job.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t py-3 first:border-t-0">
                <Badge variant={job.status === "failed" || job.status === "lost" ? "destructive" : "secondary"}>{jobStatusLabels[job.status] ?? job.status}</Badge>
                <div className="min-w-0">
                  <strong className="block truncate text-xs">{job.kind}</strong>
                  <small className="block text-[0.65rem] leading-5 text-muted-foreground">{job.summary ?? `作成 ${new Date(job.createdAt).toLocaleString("ja-JP")}`}</small>
                  {job.errorCode !== null && <small className="block text-[0.65rem] text-destructive">{job.errorCode}</small>}
                </div>
                {activeJobStatuses.has(job.status) && <Button variant="destructive" size="xs" type="button" disabled={cancel.isPending || job.cancelRequestedAt !== null} onClick={() => cancel.mutate(job.id)}>{job.cancelRequestedAt === null ? "中止" : "中止要求済み"}</Button>}
              </article>
            ))}
            {jobs.length === 0 && <EmptyState>job はまだありません。</EmptyState>}
          </div>
        </Panel>
      </div>
      <Panel className="mb-4">
        <SectionHeading
          eyebrow="LOCAL CONNECTORS"
          title="同期状況"
          action={(
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" type="button" disabled={syncConnector.isPending} onClick={() => syncConnector.mutate("slack")}>
                <RefreshCw />
                Slack
              </Button>
              <Button variant="outline" size="sm" type="button" disabled={syncConnector.isPending} onClick={() => syncConnector.mutate("chatwork")}>
                <RefreshCw />
                Chatwork
              </Button>
              <Button variant="outline" size="sm" type="button" disabled={syncConnector.isPending} onClick={() => syncConnector.mutate("gmail")}>
                <RefreshCw />
                Gmail
              </Button>
              <Button variant="outline" size="sm" type="button" disabled={syncConnector.isPending} onClick={() => syncConnector.mutate("talknote")}>
                <RefreshCw />
                Talknote
              </Button>
              <Button variant="outline" size="sm" type="button" disabled={syncRepositories.isPending} onClick={() => syncRepositories.mutate()}>
                <RefreshCw />
                Repository
              </Button>
            </div>
          )}
        />
        <div className="grid gap-3 px-5 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-4">
            <small className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">Runner</small>
            <strong className="mt-2 block text-sm">{dashboard.runners[0]?.name ?? "未接続"}</strong>
            <span className="mt-1 block text-[0.7rem] text-muted-foreground">{dashboard.runners[0] === undefined ? "heartbeat なし" : `${new Date(dashboard.runners[0].lastHeartbeatAt).toLocaleString("ja-JP")} · Orca ${dashboard.runners[0].orcaStatus}`}</span>
          </div>
          {[
            { label: "Slack", connectors: slackConnectors },
            { label: "Chatwork", connectors: chatworkConnectors },
            { label: "Gmail", connectors: dashboard.connectors.filter((connector) => connector.connector === "gmail") },
            { label: "Talknote", connectors: dashboard.connectors.filter((connector) => connector.connector === "talknote") },
          ].map((item) => {
            const successAt = latestSuccessAt(item.connectors);
            return (
              <div key={item.label} className="rounded-lg border bg-muted/30 p-4">
                <small className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">{item.label}</small>
                <strong className="mt-2 block text-sm">
                  {item.connectors.length}
                  {" "}
                  source
                </strong>
                <span className="mt-1 block text-[0.7rem] text-muted-foreground">{successAt === undefined ? "同期実績なし" : `最終成功 ${new Date(successAt).toLocaleString("ja-JP")}`}</span>
              </div>
            );
          })}
        </div>
        <div className="grid gap-2 px-5 pt-3">
          {syncConnector.error !== null && <FormError>{syncConnector.error.message}</FormError>}
          {syncRepositories.error !== null && <FormError>{syncRepositories.error.message}</FormError>}
        </div>
      </Panel>
      <div className="grid items-start gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <Panel>
          <SectionHeading
            eyebrow="SOURCE ROUTING"
            title="チャンネルと作業リポジトリ"
            action={(
              <CountBadge>
                {repositoryMappingConnectors.length}
                {" "}
                source
              </CountBadge>
            )}
          />
          <div className="max-h-[560px] overflow-y-auto px-5">
            {repositoryMappingConnectors.map((connector) => {
              const mapping = sourceRepositoryMappings.find((item) => item.connector === connector.connector && item.sourceId === connector.sourceId);
              return (
                <div key={`${connector.connector}:${connector.sourceId}`} className="grid items-center gap-3 border-t py-3 first:border-t-0 sm:grid-cols-[minmax(160px,0.8fr)_minmax(220px,1.2fr)]">
                  <div className="min-w-0">
                    <strong className="block truncate text-xs">{connector.sourceLabel}</strong>
                    <small className="text-[0.65rem] text-muted-foreground">{connector.connector}</small>
                  </div>
                  <NativeSelect
                    className="w-full"
                    value={mapping?.repositoryId ?? ""}
                    onChange={(event) => saveSourceRepositoryMapping.mutate({
                      connector: connector.connector as "slack" | "chatwork",
                      sourceScope: connector.connector === "slack" ? "channel" : "room",
                      sourceId: connector.sourceId,
                      repositoryId: event.target.value,
                    })}
                  >
                    <option value="" disabled>作業リポジトリを選択</option>
                    {repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.name}</option>)}
                  </NativeSelect>
                </div>
              );
            })}
          </div>
          {saveSourceRepositoryMapping.error !== null && <div className="px-5 pt-3"><FormError>{saveSourceRepositoryMapping.error.message}</FormError></div>}
        </Panel>
        <form onSubmit={submitNote}>
          <Panel className="gap-4 px-5">
            <div className="space-y-1.5">
              <Eyebrow>QUICK NOTE</Eyebrow>
              <h2 className="text-base font-semibold">メモを記録</h2>
            </div>
            <Field label="メモ">
              <Textarea required rows={5} maxLength={10_000} value={noteBody} onChange={(event) => setNoteBody(event.target.value)} />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={createNote.isPending}>保存する</Button>
            {createNote.error !== null && <FormError>{createNote.error.message}</FormError>}
          </Panel>
        </form>
      </div>
    </>
  );
};
