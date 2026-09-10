import { monitoringSearchSchema } from "@life-console/contracts";
import { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, Link, redirect } from "@tanstack/react-router";

import { AppShell } from "./components/AppShell";
import { Eyebrow, Panel } from "./components/DesignSystem";
import { RouteError } from "./components/RouteError";
import { buttonVariants } from "./components/ui/Button";
import { jobsQuery } from "./features/jobs/queries";
import { dashboardQuery } from "./features/overview/queries";
import { repositoriesQuery } from "./features/repositories/queries";
import { financeQuery } from "./pages/finance/queries";
import { parseHealthSearch } from "./pages/health/health-search";
import { mealsQuery, weightsQuery, weightGoalQuery } from "./pages/health/queries";
import { sourceRepositoryMappingsQuery } from "./pages/operations/queries";
import { parseTodoSearch } from "./pages/todos/todo-search";
import { parseWorkSearch } from "./pages/work/work-search";

type RouterContext = {
  readonly queryClient: QueryClient;
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  errorComponent: RouteError,
  notFoundComponent: () => (
    <Panel className="mx-auto mt-20 max-w-xl gap-4 px-5">
      <Eyebrow>404</Eyebrow>
      <h1 className="text-xl font-semibold">ページが見つかりません。</h1>
      <p className="text-sm text-muted-foreground">URL を確認するか、ホームから開き直してください。</p>
      <Link to="/" className={buttonVariants({ className: "w-fit" })}>ホームへ戻る</Link>
    </Panel>
  ),
  pendingComponent: () => <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Life Console を読み込んでいます。</div>,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  component: lazyRouteComponent(() => import("./pages/dashboard/DashboardPage"), "DashboardPage"),
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  validateSearch: parseWorkSearch,
  component: lazyRouteComponent(() => import("./pages/work/TasksPage"), "TasksPage"),
});

const todosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/todos",
  validateSearch: parseTodoSearch,
  component: lazyRouteComponent(() => import("./pages/todos/TodosPage"), "TodosPage"),
});

const healthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/health",
  validateSearch: parseHealthSearch,
  loader: async ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(weightsQuery),
    context.queryClient.ensureQueryData(weightGoalQuery),
    context.queryClient.ensureQueryData(mealsQuery),
  ]),
  component: lazyRouteComponent(() => import("./pages/health/HealthRoutePage"), "HealthRoutePage"),
});

const financeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/finance",
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQuery),
  component: lazyRouteComponent(() => import("./pages/finance/FinancePage"), "FinancePage"),
});

const operationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/operations",
  validateSearch: (search) => monitoringSearchSchema.parse(search),
  loader: async ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(dashboardQuery),
    context.queryClient.ensureQueryData(repositoriesQuery),
    context.queryClient.ensureQueryData(jobsQuery),
    context.queryClient.ensureQueryData(sourceRepositoryMappingsQuery),
  ]),
  component: lazyRouteComponent(() => import("./pages/operations/OperationsPage"), "OperationsPage"),
});

// addChildren 内で生成すると型推論が any に広がり、遷移先の検証が抜ける。
const draftsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/drafts",
  beforeLoad: () => {
    throw redirect({ to: "/tasks", search: { view: "inbox", status: "draft" }, replace: true });
  },
});

const routeTree = rootRoute.addChildren([
  draftsRoute,
  dashboardRoute,
  tasksRoute,
  todosRoute,
  healthRoute,
  financeRoute,
  operationsRoute,
]);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export const router = createRouter({
  routeTree,
  context: { queryClient },
  search: { strict: true },
  defaultPreload: "intent",
  // データの鮮度と重複取得の制御を Query に任せる。
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
