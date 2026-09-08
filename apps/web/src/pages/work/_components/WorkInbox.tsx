import type { Conversation, CreateReplyDraftsInput } from "@life-console/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "../../../api";
import { EmptyState, Field, FormError } from "../../../components/DesignSystem";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/Button";
import { NativeSelect } from "../../../components/ui/native-select";
import { activeJobStatuses, JobProgress } from "../../../features/jobs/JobProgress";
import { jobsQuery } from "../../../features/jobs/queries";
import { cn } from "../../../lib/class-names";
import { conversationsQuery, replyDraftsQuery, tasksQuery } from "../queries";
import { matchesWorkStatus, replyStatusLabels, serviceLabels, type WorkSearch } from "../work-search";

import { ConversationDetail } from "./ConversationDetail";
import type { DraftEdit } from "./ReplyComposer";

export const WorkInbox = () => {
  const search = useSearch({ from: "/tasks" });
  const navigate = useNavigate({ from: "/tasks" });
  const client = useQueryClient();
  const service = search.service ?? "all";
  const period = search.period ?? "7d";
  const status = search.status ?? "pending";
  const [edits, setEdits] = useState<Readonly<Record<string, DraftEdit | null>>>({});
  const changeFilters = (change: WorkSearch) => void navigate({ search: (previous) => ({ ...previous, ...change, conversationId: undefined }), replace: true });
  const conversations = useQuery({ ...conversationsQuery({ period, ...(service === "all" ? {} : { connector: service }) }), placeholderData: keepPreviousData });
  const drafts = useQuery(replyDraftsQuery);
  const jobs = useQuery(jobsQuery);
  const tasks = useQuery(tasksQuery);
  const draftByConversation = new Map(drafts.data?.map((draft) => [draft.conversationId, draft]));
  const sourceConversations = conversations.data ?? [];
  const visible = sourceConversations.filter((conversation) => matchesWorkStatus(conversation, draftByConversation.get(conversation.id), status));
  const selected = search.conversationId === undefined ? visible[0] : sourceConversations.find((conversation) => conversation.id === search.conversationId);
  const firstConversationId = visible[0]?.id;
  useEffect(() => {
    if (search.conversationId === undefined && firstConversationId !== undefined && !conversations.isPlaceholderData) {
      void navigate({ search: (previous) => ({ ...previous, conversationId: firstConversationId }), replace: true });
    }
  }, [search.conversationId, firstConversationId, conversations.isPlaceholderData, navigate]);
  const sync = useMutation({
    mutationFn: async () => {
      const connectors = service === "all" ? Object.keys(serviceLabels) as CreateReplyDraftsInput["connector"][] : [service];
      const results = await Promise.allSettled(connectors.map((connector) => api.syncConnector(connector)));
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    },
    onSettled: async () => client.invalidateQueries({ queryKey: ["jobs"] }),
  });
  const generate = useMutation({
    mutationFn: async () => {
      const connectors = service === "all" ? Object.keys(serviceLabels) as CreateReplyDraftsInput["connector"][] : [service];
      const results = await Promise.allSettled(connectors.map((connector) => api.generateReplyDrafts({ connector, period: period === "all" ? "7d" : period })));
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    },
    onSettled: async () => client.invalidateQueries({ queryKey: ["jobs"] }),
  });
  const intakeJobs = jobs.data?.filter((job) => {
    if (job.kind === "reply_drafts") {
      const payload = JSON.parse(job.payloadJson) as CreateReplyDraftsInput;
      return payload.conversationId === undefined && (service === "all" || payload.connector === service);
    }
    return Object.keys(serviceLabels).some((connector) => job.kind === `${connector}_sync` && (service === "all" || service === connector));
  }) ?? [];
  const running = intakeJobs.some((job) => activeJobStatuses.has(job.status));
  const drafting = jobs.data?.some((job) => job.kind === "reply_drafts" && activeJobStatuses.has(job.status)
    && (service === "all" || (JSON.parse(job.payloadJson) as CreateReplyDraftsInput).connector === service)) ?? false;
  const latestIntakeJobs = intakeJobs.filter((job, index, all) => all.findIndex((other) => other.kind === job.kind
    && (job.kind !== "reply_drafts" || (JSON.parse(other.payloadJson) as CreateReplyDraftsInput).connector === (JSON.parse(job.payloadJson) as CreateReplyDraftsInput).connector)) === index);
  const failedIntakeCount = latestIntakeJobs.filter((job) => job.status === "failed").length;
  const selectConversation = (conversation: Conversation) => void navigate({ search: (previous) => ({ ...previous, conversationId: conversation.id }) });
  const statusOptions = [{ value: "pending", label: "要対応" }, { value: "draft", label: "下書きあり" }, { value: "review", label: "確認待ち" }, { value: "all", label: "すべて" }] as const;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="サービス">
            <NativeSelect value={service} onChange={(event) => changeFilters({ service: event.target.value as NonNullable<WorkSearch["service"]> })}>
              <option value="all">すべてのサービス</option>
              {Object.entries(serviceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="期間">
            <NativeSelect value={period} onChange={(event) => changeFilters({ period: event.target.value as NonNullable<WorkSearch["period"]> })}>
              <option value="24h">直近 24 時間</option>
              <option value="3d">直近 3 日</option>
              <option value="7d">直近 7 日</option>
              <option value="all">全期間</option>
            </NativeSelect>
          </Field>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" disabled={sync.isPending || running || jobs.isPending || jobs.isError} onClick={() => sync.mutate()}>
              <RefreshCw className={running ? "animate-spin" : ""} />
              連絡を同期
            </Button>
            <Button disabled={generate.isPending || running || drafting || jobs.isPending || jobs.isError || period === "all"} onClick={() => generate.mutate()}>未返信の下書きをまとめて作成</Button>
          </div>
        </div>
        {period === "all" && <p className="text-xs text-muted-foreground">一括作成は期間を指定してください。個別の会話では全期間の下書きを作成できます。</p>}
        <div className="flex flex-wrap gap-2" role="group" aria-label="対応状況">
          {statusOptions.map((option) => (
            <Button key={option.value} variant={status === option.value ? "secondary" : "ghost"} size="sm" aria-pressed={status === option.value} onClick={() => changeFilters({ status: option.value })}>
              {option.label}
              <span className="text-muted-foreground">{sourceConversations.filter((conversation) => matchesWorkStatus(conversation, draftByConversation.get(conversation.id), option.value)).length}</span>
            </Button>
          ))}
          <span className="ml-auto self-center text-xs text-muted-foreground" aria-live="polite">{conversations.isFetching ? "更新中" : `${visible.length} 件`}</span>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,2fr)] gap-4 overflow-hidden lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.4fr)] lg:grid-rows-[minmax(0,1fr)]" aria-busy={conversations.isFetching}>
        <section aria-label="受信した会話" tabIndex={0} className="min-h-0 overflow-y-auto overscroll-contain rounded-xl border bg-card [scrollbar-gutter:stable] focus-visible:outline-2 focus-visible:outline-ring">
          {drafts.isError && <p role="alert" className="p-4 text-xs text-destructive">下書きの取得に失敗しました。返信状況は未確認です。</p>}
          {visible.map((conversation) => {
            const draft = draftByConversation.get(conversation.id);
            return (
              <button key={conversation.id} type="button" aria-pressed={selected?.id === conversation.id} className={cn("block w-full border-b border-l-2 border-l-transparent p-4 text-left last:border-b-0 hover:bg-muted/40", selected?.id === conversation.id && "border-l-primary bg-primary/5")} onClick={() => selectConversation(conversation)}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[0.65rem] text-muted-foreground">
                  <span>{serviceLabels[conversation.connector as keyof typeof serviceLabels]}</span>
                  <span className="ml-auto">{new Date(conversation.occurredAt).toLocaleDateString("ja-JP")}</span>
                </div>
                <strong className="block truncate text-xs">{conversation.authorLabel}</strong>
                <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">{conversation.excerpt}</p>
                <div className="mt-2 flex gap-2">
                  <Badge variant="outline">{draft === undefined ? conversation.classification === "no_action" ? "対応不要" : conversation.classification === "reference" ? "参考情報" : "未確認" : replyStatusLabels[draft.status]}</Badge>
                  {edits[conversation.id] != null && <Badge variant="secondary">未保存</Badge>}
                </div>
              </button>
            );
          })}
          {(conversations.isPending || drafts.isPending) && <EmptyState>連絡と下書きを読み込んでいます。</EmptyState>}
          {conversations.isSuccess && drafts.isSuccess && visible.length === 0 && <EmptyState>この条件の連絡はありません。期間や対応状況を変更できます。</EmptyState>}
        </section>
        <div key={selected?.id} role="region" aria-label="会話の詳細と同期結果" tabIndex={0} className="min-h-0 min-w-0 space-y-4 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] focus-visible:outline-2 focus-visible:outline-ring">
          {intakeJobs.length > 0 && (
            <details className="rounded-lg border px-4 py-3 text-xs" open={running || undefined}>
              <summary className="cursor-pointer text-muted-foreground">
                {running ? "同期・下書き作成中" : "最近の同期・一括作成"}
                {" "}
                · サービスごとの結果を確認
                {failedIntakeCount > 0 && <span className="ml-2 text-destructive">{`失敗 ${failedIntakeCount} 件`}</span>}
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {latestIntakeJobs.map((job) => (
                  <div key={job.id} className="space-y-1">
                    <span>{job.kind === "reply_drafts" ? `${(JSON.parse(job.payloadJson) as CreateReplyDraftsInput).connector} 下書き` : job.kind}</span>
                    <JobProgress job={job} />
                  </div>
                ))}
              </div>
            </details>
          )}
          {[conversations.error, drafts.error, jobs.error, tasks.error, sync.error, generate.error].map((error, index) => error !== null && <FormError key={index}>{error.message}</FormError>)}
          {selected === undefined ? <EmptyState>会話を選ぶと、本文・返信案・関連タスクをここで確認できます。</EmptyState> : <ConversationDetail key={selected.id} conversation={selected} draft={draftByConversation.get(selected.id)} jobs={jobs.data ?? []} tasks={tasks.data ?? []} editing={edits[selected.id] ?? null} setEditing={(edit) => setEdits((previous) => ({ ...previous, [selected.id]: edit }))} />}
        </div>
      </div>
    </div>
  );
};
