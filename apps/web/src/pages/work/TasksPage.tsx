import { useSearch, Link } from "@tanstack/react-router";
import { Suspense } from "react";

import { buttonVariants } from "../../components/ui/Button";
import { cn } from "../../lib/class-names";

import { TaskBoard } from "./_components/TaskBoard";
import { WorkInbox } from "./_components/WorkInbox";

export const TasksPage = () => {
  const search = useSearch({ from: "/tasks" });
  const view = search.view ?? "inbox";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">仕事</h1>
        <Link to="/operations" className={buttonVariants({ variant: "ghost", size: "sm" })}>同期・実行状況</Link>
      </header>
      <nav aria-label="仕事の表示" className="flex shrink-0 gap-1 border-b">
        {([{ value: "inbox", label: "受信箱" }, { value: "tasks", label: "タスク" }] as const).map((item) => (
          <Link
            key={item.value}
            from="/tasks"
            to="/tasks"
            search={(previous) => ({ ...previous, view: item.value })}
            aria-current={view === item.value ? "page" : undefined}
            className={cn("border-b-2 px-5 py-3 text-sm font-medium transition-colors", view === item.value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div hidden={view !== "inbox"} className="min-h-0 flex-1 overflow-hidden"><WorkInbox /></div>
      <div hidden={view !== "tasks"} className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<p className="py-12 text-center text-sm text-muted-foreground">タスクを読み込んでいます。</p>}>
          <TaskBoard />
        </Suspense>
      </div>
    </div>
  );
};
