import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { api } from "../../../api";
import { CountBadge, EmptyState, Eyebrow, Field, FormError, Panel, SectionHeading, StatusDot } from "../../../components/DesignSystem";
import { Button, buttonVariants } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/input";
import { NativeSelect } from "../../../components/ui/native-select";
import { Textarea } from "../../../components/ui/textarea";
import { JobProgress } from "../../../features/jobs/JobProgress";
import { jobsQuery } from "../../../features/jobs/queries";
import { repositoriesQuery } from "../../../features/repositories/queries";
import { tasksQuery } from "../queries";
import type { WorkSearch } from "../work-search";

const statusOptions = [
  { value: "inbox", label: "受信箱" },
  { value: "todo", label: "未着手" },
  { value: "doing", label: "進行中" },
  { value: "done", label: "完了" },
  { value: "canceled", label: "中止" },
] as const;

const toLocalDateTimeInput = (value: string): string => {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export const TaskBoard = () => {
  const search = useSearch({ from: "/tasks" });
  const queryClient = useQueryClient();
  const { data: tasks } = useSuspenseQuery(tasksQuery);
  const { data: repositories } = useSuspenseQuery(repositoriesQuery);
  const { data: jobs } = useSuspenseQuery(jobsQuery);
  const visibleTasks = search.taskId === undefined ? tasks : tasks.filter((task) => task.id === search.taskId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [provider, setProvider] = useState<"codex" | "claude">("codex");
  const [executionMode, setExecutionMode] = useState<"main_checkout" | "new_worktree">("new_worktree");
  const createTask = useMutation({
    mutationFn: api.createTask,
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      setDueAt("");
      setRepositoryId("");
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const updateTask = useMutation({
    mutationFn: ({ id, status }: { readonly id: string; readonly status: typeof statusOptions[number]["value"] }) => api.updateTask(id, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const editTask = useMutation({
    mutationFn: (input: { readonly id: string; readonly title: string; readonly description: string; readonly dueAt: string | null; readonly repositoryId: string | null }) => api.updateTask(input.id, {
      title: input.title,
      description: input.description,
      dueAt: input.dueAt,
      repositoryId: input.repositoryId,
    }),
    onSuccess: async () => {
      setEditingTaskId(null);
      setTitle("");
      setDescription("");
      setDueAt("");
      setRepositoryId("");
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const launchAgent = useMutation({
    mutationFn: ({ taskId, taskRepositoryId }: { readonly taskId: string; readonly taskRepositoryId: string }) => api.createAgentJob(taskId, {
      repositoryId: taskRepositoryId,
      provider,
      executionMode,
    }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });
  const promoteTask = useMutation({
    mutationFn: ({ taskId, taskRepositoryId, target }: { readonly taskId: string; readonly taskRepositoryId: string; readonly target: "github_issue" | "github_project" }) => api.promoteTask(taskId, {
      repositoryId: taskRepositoryId,
      target,
    }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (editingTaskId !== null) {
      editTask.mutate({
        id: editingTaskId,
        title,
        description,
        dueAt: dueAt === "" ? null : new Date(dueAt).toISOString(),
        repositoryId: repositoryId === "" ? null : repositoryId,
      });
      return;
    }
    createTask.mutate({
      title,
      description,
      dueAt: dueAt === "" ? null : new Date(dueAt).toISOString(),
      conversationId: null,
      repositoryId: repositoryId === "" ? null : repositoryId,
    });
  };
  const startEditing = (task: typeof tasks[number]) => {
    setEditingTaskId(task.id);
    setTitle(task.title);
    setDescription(task.description);
    setDueAt(task.dueAt === null ? "" : toLocalDateTimeInput(task.dueAt));
    setRepositoryId(task.repositoryId ?? "");
  };
  const latestJobByTaskId = new Map<string, typeof jobs[number]>();
  for (const job of jobs) {
    if (job.taskId !== null && !latestJobByTaskId.has(job.taskId)) latestJobByTaskId.set(job.taskId, job);
  }

  return (
    <>
      <div className="grid h-full min-h-0 content-start items-start gap-4 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden xl:[scrollbar-gutter:auto]">
        <Panel className="min-h-0 xl:h-full xl:overflow-hidden">
          <SectionHeading
            className="shrink-0"
            eyebrow="TASK LIST"
            title="タスク"
            action={(
              <CountBadge>
                {visibleTasks.length}
                {" 件"}
              </CountBadge>
            )}
          />
          <div role="region" aria-label="タスク一覧" tabIndex={0} className="min-h-0 px-5 focus-visible:outline-2 focus-visible:outline-ring xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-gutter:stable]">
            {search.taskId !== undefined && <Link to="/tasks" search={(previous: WorkSearch) => ({ ...previous, taskId: undefined })} className={buttonVariants({ variant: "ghost", size: "sm" })}>すべてのタスクに戻る</Link>}
            {visibleTasks.map((task) => {
              const latestJob = latestJobByTaskId.get(task.id);
              const workRepositoryId = task.repositoryId;
              return (
                <article key={task.id} className={`grid gap-3 border-t py-4 first:border-t-0 ${task.status === "done" ? "opacity-55" : ""}`}>
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
                    <StatusDot status={task.status} />
                    <div className="min-w-0">
                      <strong className="block text-sm">{task.title}</strong>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{task.description}</p>
                      <small className="mt-1 block text-[0.7rem] text-muted-foreground">
                        {task.repositoryName ?? "リポジトリ未選択"}
                        {task.dueAt === null ? "" : ` · 期限 ${new Date(task.dueAt).toLocaleString("ja-JP")}`}
                      </small>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-5">
                    <NativeSelect className="w-28" size="sm" aria-label={`${task.title}の状態`} value={task.status} onChange={(event) => updateTask.mutate({ id: task.id, status: event.target.value as typeof statusOptions[number]["value"] })}>
                      {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </NativeSelect>
                    <Button variant="outline" size="sm" type="button" onClick={() => startEditing(task)}>編集</Button>
                    {task.conversationId !== null && <Link to="/tasks" search={{ view: "inbox", conversationId: task.conversationId, period: "all", status: "all" }} className={buttonVariants({ variant: "outline", size: "sm" })}>元の会話・返信案</Link>}
                    {workRepositoryId !== null && task.status !== "done" && (
                      <Button variant="outline" size="sm" type="button" onClick={() => launchAgent.mutate({ taskId: task.id, taskRepositoryId: workRepositoryId })}>agent 起動</Button>
                    )}
                    {workRepositoryId !== null && (
                      <>
                        <Button variant="outline" size="sm" type="button" onClick={() => promoteTask.mutate({ taskId: task.id, taskRepositoryId: workRepositoryId, target: "github_issue" })}>Issue</Button>
                        <Button variant="outline" size="sm" type="button" onClick={() => promoteTask.mutate({ taskId: task.id, taskRepositoryId: workRepositoryId, target: "github_project" })}>Project 4</Button>
                      </>
                    )}
                  </div>
                  {workRepositoryId === null && <small className="pl-5 text-[0.7rem] text-muted-foreground">作業リポジトリを設定すると agent と GitHub 操作を使えます。</small>}
                  {latestJob !== undefined && (
                    <JobProgress job={latestJob} />
                  )}
                </article>
              );
            })}
            {visibleTasks.length === 0 && <EmptyState>表示するタスクはありません。</EmptyState>}
          </div>
        </Panel>
        <aside aria-label="タスクの編集と起動設定" tabIndex={0} className="grid min-h-0 gap-4 focus-visible:outline-2 focus-visible:outline-ring xl:h-full xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-gutter:stable]">
          <form onSubmit={submit}>
            <Panel className="gap-4 px-5">
              <div className="space-y-1.5">
                <Eyebrow>{editingTaskId === null ? "NEW TASK" : "EDIT TASK"}</Eyebrow>
                <h2 className="text-base font-semibold">{editingTaskId === null ? "タスクを追加" : "タスクを編集"}</h2>
              </div>
              <Field label="タイトル">
                <Input required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field label="説明">
                <Textarea rows={4} maxLength={10_000} value={description} onChange={(event) => setDescription(event.target.value)} />
              </Field>
              <Field label="期限">
                <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
              </Field>
              <Field label="作業リポジトリ">
                <NativeSelect className="w-full" value={repositoryId} onChange={(event) => setRepositoryId(event.target.value)}>
                  <option value="">未選択</option>
                  {repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.name}</option>)}
                </NativeSelect>
              </Field>
              <Button type="submit" size="lg" className="w-full" disabled={createTask.isPending || editTask.isPending}>{editingTaskId === null ? "追加する" : "変更を保存"}</Button>
              {editingTaskId !== null && (
                <Button
                  className="w-full"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setEditingTaskId(null);
                    setTitle("");
                    setDescription("");
                    setDueAt("");
                    setRepositoryId("");
                  }}
                >
                  編集をやめる
                </Button>
              )}
              {createTask.error !== null && <FormError>{createTask.error.message}</FormError>}
              {editTask.error !== null && <FormError>{editTask.error.message}</FormError>}
            </Panel>
          </form>
          <Panel className="gap-4 px-5">
            <div className="space-y-1.5">
              <Eyebrow>AGENT DEFAULT</Eyebrow>
              <h2 className="text-base font-semibold">起動設定</h2>
            </div>
            <Field label="Provider">
              <NativeSelect className="w-full" value={provider} onChange={(event) => setProvider(event.target.value as "codex" | "claude")}>
                <option value="codex">Codex</option>
                <option value="claude">Claude Code</option>
              </NativeSelect>
            </Field>
            <Field label="作業場所">
              <NativeSelect className="w-full" value={executionMode} onChange={(event) => setExecutionMode(event.target.value as "main_checkout" | "new_worktree")}>
                <option value="new_worktree">新しい worktree</option>
                <option value="main_checkout">main checkout</option>
              </NativeSelect>
            </Field>
            <p className="text-[0.7rem] leading-5 text-muted-foreground">worktree、terminal、session は完了後も自動削除しません。</p>
            {launchAgent.error !== null && <FormError>{launchAgent.error.message}</FormError>}
            {promoteTask.error !== null && <FormError>{promoteTask.error.message}</FormError>}
          </Panel>
        </aside>
      </div>
    </>
  );
};
