import { Link, useSearch } from "@tanstack/react-router";

import { buttonVariants } from "../../components/ui/Button";

import { ShoppingBoard } from "./ShoppingBoard";
import { TodoTasks } from "./TodoTasks";

export const TodosPage = () => {
  const search = useSearch({ from: "/todos" });
  const view = search.view ?? "all";
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">やること</h1>
        <Link from="/todos" to="/todos" search={(previous) => ({ ...previous, completed: previous.completed ? undefined : true })} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {search.completed ? "未完了を見る" : "完了済みを見る"}
        </Link>
      </header>
      <nav aria-label="やることの表示" className="flex flex-wrap gap-2">
        {([{ value: "all", label: "すべて" }, { value: "tasks", label: "タスク" }, { value: "work", label: "仕事" }, { value: "personal", label: "私生活" }, { value: "shopping", label: "買い物" }] as const).map((item) => (
          <Link key={item.value} from="/todos" to="/todos" search={(previous) => ({ ...previous, view: item.value })} aria-current={view === item.value ? "page" : undefined} className={buttonVariants({ variant: view === item.value ? "default" : "outline", size: "sm" })}>{item.label}</Link>
        ))}
      </nav>
      <div hidden={view === "shopping"}><TodoTasks /></div>
      <div hidden={view !== "all" && view !== "shopping"}><ShoppingBoard /></div>
    </div>
  );
};
