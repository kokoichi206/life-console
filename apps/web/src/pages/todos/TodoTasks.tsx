import type { Task } from "@life-console/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { api } from "../../api";
import { EmptyState, Field, FormError, Panel } from "../../components/DesignSystem";
import { Button, buttonVariants } from "../../components/ui/Button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { tasksQuery } from "../../features/tasks/queries";

const localDateInput = (value: string | null) => {
  if (value === null) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
const dateLabel = (value: string) => new Date(value).toLocaleString("ja-JP", { year: "numeric", month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });

const TaskEditor = ({ task }: { readonly task: Task | undefined }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/todos" });
  const search = useSearch({ from: "/todos" });
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [area, setArea] = useState<Task["area"]>(task?.area ?? (search.view === "work" ? "work" : "personal"));
  const [dueAt, setDueAt] = useState(localDateInput(task?.dueAt ?? null));
  const [scheduledAt, setScheduledAt] = useState(localDateInput(task?.scheduledAt ?? null));
  const [sourceUrl, setSourceUrl] = useState(task?.sourceUrl ?? "");
  const save = useMutation({
    mutationFn: () => {
      const input = { title, description, area, dueAt: dueAt === "" ? null : new Date(dueAt).toISOString(), scheduledAt: scheduledAt === "" ? null : new Date(scheduledAt).toISOString(), sourceUrl: sourceUrl === "" ? null : sourceUrl };
      return task === undefined ? api.createTask(input) : api.updateTask(task.id, input);
    },
    onSuccess: async () => {
      if (task === undefined) {
        setTitle("");
        setDescription("");
        setDueAt("");
        setScheduledAt("");
        setSourceUrl("");
      }
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["tasks"] }), queryClient.invalidateQueries({ queryKey: ["dashboard"] })]);
      if (task !== undefined) await navigate({ search: (previous) => ({ ...previous, taskId: undefined }) });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  return (
    <form id="task-entry" onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-4">
      <h3 className="font-semibold">{task === undefined ? "タスクを追加" : "タスクを編集"}</h3>
      <fieldset disabled={save.isPending} className="space-y-4">
        <Field label="やること"><Input required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <fieldset className="flex gap-4">
          <legend className="mb-2 text-xs text-muted-foreground">区分</legend>
          {([{ value: "personal", label: "私生活" }, { value: "work", label: "仕事" }] as const).map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input type="radio" name={`task-area-${task?.id ?? "new"}`} checked={area === option.value} onChange={() => setArea(option.value)} />
              {option.label}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="実施日時（任意）"><Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></Field>
          <Field label="期日（任意）"><Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></Field>
        </div>
        <p className="text-xs text-muted-foreground">その時刻に行うものは実施日時、終える期限があるものは期日へ。どちらも空欄で登録できます。</p>
        <Field label="参照リンク（任意）"><Input type="url" maxLength={2000} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></Field>
        <Field label="メモ（任意）"><Textarea maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        <Button type="submit">{save.isPending ? "保存中…" : task === undefined ? "タスクを追加" : "変更を保存"}</Button>
      </fieldset>
      {task !== undefined && <Link from="/todos" to="/todos" search={(previous) => ({ ...previous, taskId: undefined })} className={buttonVariants({ variant: "ghost", size: "sm" })}>編集を閉じる</Link>}
      {save.error !== null && <FormError>{save.error.message}</FormError>}
    </form>
  );
};

export const TodoTasks = () => {
  const search = useSearch({ from: "/todos" });
  const query = useQuery(tasksQuery);
  const queryClient = useQueryClient();
  const complete = useMutation({
    mutationFn: ({ id, done }: { readonly id: string; readonly done: boolean }) => api.updateTask(id, { status: done ? "done" : "todo" }),
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["tasks"] }), queryClient.invalidateQueries({ queryKey: ["dashboard"] })]); },
  });
  if (query.isPending) return <p role="status">タスクを読み込んでいます。</p>;
  if (query.isError && query.data === undefined) return (
    <div className="space-y-2">
      <FormError>{query.error.message}</FormError>
      <Button variant="outline" onClick={() => { void query.refetch(); }}>再読み込み</Button>
    </div>
  );
  const visibleTasks = query.data.filter((task) => (search.completed ? task.status === "done" || task.status === "canceled" : task.status !== "done" && task.status !== "canceled") && ((search.view !== "work" && search.view !== "personal") || task.area === search.view));
  const selectedTask = query.data.find((task) => task.id === search.taskId);
  return (
    <section aria-label="タスク" className="space-y-4">
      {query.isError && (
        <div className="space-y-2">
          <FormError>一覧の更新に失敗しました。前回の内容を表示しています。</FormError>
          <Button variant="outline" onClick={() => { void query.refetch(); }}>再読み込み</Button>
        </div>
      )}
      <h2 className="text-lg font-semibold">{search.completed ? "完了・中止したタスク" : "タスク"}</h2>
      <Panel className="px-4">
        {visibleTasks.map((task) => (
          <article key={task.id} className="flex items-start gap-3 border-b py-4 last:border-b-0">
            {task.status === "canceled" ? <span className="mt-1 w-5 shrink-0 text-center text-muted-foreground" aria-hidden="true">—</span> : <input className="mt-1 size-5 shrink-0 accent-primary" type="checkbox" aria-label={`${task.title}を完了`} checked={task.status === "done"} disabled={complete.isPending} onChange={(event) => complete.mutate({ id: task.id, done: event.target.checked })} />}
            <div className="min-w-0 flex-1 space-y-2">
              <h3 className="break-words font-medium">{task.title}</h3>
              <p className="text-xs text-muted-foreground">
                {task.area === "work" ? "仕事" : "私生活"}
                {task.status === "doing" ? " · 進行中" : task.status === "canceled" ? " · 中止" : ""}
              </p>
              {task.scheduledAt !== null && (
                <p className="text-sm">
                  実施：
                  {dateLabel(task.scheduledAt)}
                </p>
              )}
              {task.dueAt !== null && (
                <p className="text-sm">
                  期日：
                  {dateLabel(task.dueAt)}
                </p>
              )}
              {task.description !== "" && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{task.description}</p>}
              <div className="flex flex-wrap gap-2">
                <Link from="/todos" to="/todos" search={(previous) => ({ ...previous, taskId: task.id })} hash="task-entry" className={buttonVariants({ variant: "outline", size: "sm" })}>編集</Link>
                {task.sourceUrl !== null && <a href={task.sourceUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "link", size: "sm" })}>参照リンク</a>}
                {task.conversationId !== null && <Link to="/tasks" search={{ view: "inbox", conversationId: task.conversationId, period: "all", status: "all" }} className={buttonVariants({ variant: "link", size: "sm" })}>元の会話</Link>}
                {task.area === "work" && <Link to="/tasks" search={{ view: "tasks", taskId: task.id }} className={buttonVariants({ variant: "link", size: "sm" })}>仕事で開く</Link>}
              </div>
            </div>
          </article>
        ))}
        {visibleTasks.length === 0 && <EmptyState>表示するタスクはありません。</EmptyState>}
        {complete.error !== null && <FormError>{complete.error.message}</FormError>}
      </Panel>
      {search.taskId !== undefined && selectedTask === undefined ? <FormError>タスクが見つかりません。</FormError> : <TaskEditor key={selectedTask?.id ?? "new"} task={selectedTask} />}
    </section>
  );
};
