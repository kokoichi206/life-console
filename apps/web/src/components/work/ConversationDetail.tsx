import type { Conversation, Job, ReplyDraft, Task } from "@life-console/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

import { api } from "../../api";
import { serviceLabels, type WorkSearch } from "../../lib/work-search";
import { Field, FormError, Panel } from "../DesignSystem";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/Button";
import { Textarea } from "../ui/textarea";

import { CalendarDraftOptions, initialReplyCalendar } from "./CalendarDraftOptions";
import { activeJobStatuses, JobProgress } from "./JobProgress";
import { ReplyComposer, type DraftEdit } from "./ReplyComposer";

export const ConversationDetail = ({ conversation, draft, jobs, tasks, editing, setEditing }: {
  readonly conversation: Conversation;
  readonly draft: ReplyDraft | undefined;
  readonly jobs: ReadonlyArray<Job>;
  readonly tasks: ReadonlyArray<Task>;
  readonly editing: DraftEdit | null;
  readonly setEditing: (edit: DraftEdit | null) => void;
}) => {
  const client = useQueryClient();
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [calendar, setCalendar] = useState(initialReplyCalendar);
  const [sendBody, setSendBody] = useState<string | null>(null);
  const invalidateWork = async () => {
    await Promise.all(["conversations", "tasks", "jobs", "dashboard", "reply-drafts"].map((key) => client.invalidateQueries({ queryKey: [key] })));
  };
  const generate = useMutation({ mutationFn: () => api.generateReplyDrafts({
    connector: conversation.connector as keyof typeof serviceLabels, period: "7d", conversationId: conversation.id,
    ...(calendarEnabled ? { calendar } : {}),
  }), onSuccess: invalidateWork });
  const createTask = useMutation({ mutationFn: () => api.createTaskFromConversation(conversation.id), onSuccess: invalidateWork });
  const classify = useMutation({ mutationFn: (classification: "reference" | "no_action") => api.classifyConversation(conversation.id, classification), onSuccess: invalidateWork });
  const reply = useMutation({ mutationFn: (body: string) => api.replyConversation(conversation.id, body), onSuccess: async () => {
    setSendBody(null);
    await invalidateWork();
  } });
  const relatedTasks = tasks.filter((task) => task.conversationId === conversation.id);
  const relatedJobs = jobs.filter((job) => {
    if (job.taskId !== null && relatedTasks.some((task) => task.id === job.taskId)) return true;
    if (job.kind !== "conversation_reply" && job.kind !== "reply_drafts") return false;
    const payload = JSON.parse(job.payloadJson) as { readonly conversationId?: string };
    return payload.conversationId === conversation.id;
  });
  const generating = jobs.some((job) => {
    if (job.kind !== "reply_drafts" || !activeJobStatuses.has(job.status)) return false;
    const payload = JSON.parse(job.payloadJson) as { readonly connector: string; readonly conversationId?: string };
    return payload.connector === conversation.connector && (payload.conversationId === undefined || payload.conversationId === conversation.id);
  });
  const sending = relatedJobs.some((job) => job.kind === "conversation_reply" && activeJobStatuses.has(job.status));
  const canSend = conversation.connector === "slack" || conversation.connector === "chatwork";

  return (
    <section aria-label="選択した会話" className="min-w-0 space-y-4">
      <Panel className="gap-4 px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{serviceLabels[conversation.connector as keyof typeof serviceLabels]}</Badge>
          <time className="text-xs text-muted-foreground">{new Date(conversation.occurredAt).toLocaleString("ja-JP")}</time>
          {conversation.sourceUrl !== null && (
            <a className={buttonVariants({ variant: "ghost", size: "sm", className: "ml-auto" })} href={conversation.sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
              元の会話
            </a>
          )}
        </div>
        <h2 className="break-words text-base font-semibold">{conversation.authorLabel}</h2>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{conversation.excerpt}</p>
        <p className="text-xs text-muted-foreground">取り込んだ本文の抜粋です。下書き作成時は CLI で会話履歴を再取得し、返信済みか確認します。</p>
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {relatedTasks.length === 0 && <Button size="sm" variant="outline" disabled={createTask.isPending} onClick={() => createTask.mutate()}>タスクにする</Button>}
          {canSend && <Button size="sm" variant="ghost" onClick={() => setSendBody(editing?.body ?? draft?.body ?? "")}>手動で返信</Button>}
          <Button size="sm" variant="ghost" disabled={classify.isPending} onClick={() => classify.mutate("reference")}>参考情報にする</Button>
          <Button size="sm" variant="ghost" disabled={classify.isPending} onClick={() => classify.mutate("no_action")}>対応不要にする</Button>
        </div>
        {relatedTasks.map((task) => (
          <p key={task.id} className="text-xs leading-5">
            <Link to="/tasks" search={(previous: WorkSearch) => ({ ...previous, view: "tasks", taskId: task.id })} className="text-primary underline underline-offset-4">{task.title}</Link>
            {" "}
            ·
            {" "}
            {task.status}
            {" "}
            ·
            {" "}
            {task.repositoryName ?? "リポジトリ未選択"}
          </p>
        ))}
        {createTask.error !== null && <FormError>{createTask.error.message}</FormError>}
        {classify.error !== null && <FormError>{classify.error.message}</FormError>}
      </Panel>
      {draft !== undefined && <ReplyComposer draft={draft} editing={editing} setEditing={setEditing} {...(canSend ? { onSend: setSendBody } : {})} />}
      <details open={draft === undefined || undefined} className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">{draft === undefined ? "返信案を作る" : "カレンダーを使って再作成・履歴を再確認"}</summary>
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            generate.mutate();
          }}
        >
          <div className="space-y-3">
            <CalendarDraftOptions enabled={calendarEnabled} onEnabledChange={setCalendarEnabled} request={calendar} onChange={setCalendar} />
            <Button type="submit" className="w-fit" disabled={generate.isPending || generating}>{generating ? "履歴を確認・下書きを作成中" : draft === undefined ? "この会話の下書きを作成" : "履歴を再確認して下書きを作成"}</Button>
            <p className="text-xs leading-5 text-muted-foreground">アプリ内に保存します。編集済みの本文は上書きしません。生成時は会話履歴を Claude Code のモデルに渡します。</p>
            {generate.error !== null && <FormError>{generate.error.message}</FormError>}
          </div>
        </form>
      </details>
      {sendBody !== null && (
        <form onSubmit={(event) => {
          event.preventDefault();
          reply.mutate(sendBody);
        }}
        >
          <Panel className="gap-3 border-primary/40 px-5">
            <h3 className="text-sm font-semibold">送信内容の確認</h3>
            <p className="text-xs leading-5">
              この操作で
              {" "}
              {conversation.connector}
              {" "}
              の元の会話へ実際に投稿します。宛先・本文・日程を確認してください。
            </p>
            <Field label="送信する本文"><Textarea required rows={8} maxLength={5_000} value={sendBody} onChange={(event) => setSendBody(event.target.value)} /></Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={reply.isPending || sending || sendBody.trim() === ""}>確認して送信を依頼</Button>
              <Button type="button" variant="outline" onClick={() => setSendBody(null)}>やめる</Button>
            </div>
            {reply.error !== null && <FormError>{reply.error.message}</FormError>}
          </Panel>
        </form>
      )}
      {relatedJobs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">この会話の実行経過</h3>
          {relatedJobs.slice(0, 5).map((job) => <JobProgress key={job.id} job={job} />)}
        </div>
      )}
    </section>
  );
};
