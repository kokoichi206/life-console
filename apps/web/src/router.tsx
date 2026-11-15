import { monitoringSearchSchema } from "@life-console/contracts";
import { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { createHealthReadApi } from "./api";
import { AppShell } from "./components/AppShell";
import { Eyebrow, Panel } from "./components/DesignSystem";
import { PagePending } from "./components/PagePending";
import { RouteError } from "./components/RouteError";
import { buttonVariants } from "./components/ui/Button";
import { abstinenceQuery } from "./features/abstinence/queries";
import { jobsQuery } from "./features/jobs/queries";
import { dashboardQuery } from "./features/overview/queries";
import { repositoriesQuery } from "./features/repositories/queries";
import { financeQuery } from "./pages/finance/queries";
import { parseHealthSearch, parseSharedHealthSearch } from "./pages/health/health-search";
import { createHealthQueries, calorieBaselineQuery, mealsQuery, weightsQuery, weightGoalQuery } from "./pages/health/queries";
import { sourceRepositoryMappingsQuery } from "./pages/operations/queries";
import { parseTodoSearch } from "./pages/todos/todo-search";
import { parseWorkSearch } from "./pages/work/work-search";

type RouterContext = {
  readonly queryClient: QueryClient;
};

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: function RootLayout() {
    const shared = useRouterState({ select: (state) => state.location.pathname === "/share/health" || state.location.pathname.startsWith("/share/health/") });
    return shared ? <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8"><Outlet /></main> : <AppShell />;
  },
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
  loader: ({ context }) => {
    // 禁欲記録は並列に取得し、その欄の読み込み状態で表示を待つ。
    void context.queryClient.prefetchQuery(abstinenceQuery);
    return context.queryClient.ensureQueryData(dashboardQuery);
  },
  pendingComponent: () => <PagePending title="ホーム" />,
  component: lazyRouteComponent(() => import("./pages/dashboard/DashboardPage"), "DashboardPage"),
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  validateSearch: parseWorkSearch,
  pendingComponent: () => <PagePending title="仕事" />,
  component: lazyRouteComponent(() => import("./pages/work/TasksPage"), "TasksPage"),
});

const todosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/todos",
  validateSearch: parseTodoSearch,
  pendingComponent: () => <PagePending title="やること" />,
  component: lazyRouteComponent(() => import("./pages/todos/TodosPage"), "TodosPage"),
});

const healthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/health",
  validateSearch: parseHealthSearch,
  pendingComponent: () => <PagePending title="体重・運動・食事" />,
  loader: async ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(weightsQuery),
    context.queryClient.ensureQueryData(weightGoalQuery),
    context.queryClient.ensureQueryData(calorieBaselineQuery),
    context.queryClient.ensureQueryData(mealsQuery),
  ]),
  component: lazyRouteComponent(() => import("./pages/health/HealthRoutePage"), "HealthRoutePage"),
});

const sharedHealthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/share/health/$token",
  validateSearch: parseSharedHealthSearch,
  pendingComponent: () => <PagePending title="体重・運動・食事" shared />,
  loader: async ({ context, params }) => {
    const queries = createHealthQueries(createHealthReadApi(`/api/v1/share/${encodeURIComponent(params.token)}`), ["health-share", params.token], true);
    await Promise.all([
      context.queryClient.fetchQuery({ ...queries.weightsQuery, staleTime: 0 }),
      context.queryClient.fetchQuery({ ...queries.weightGoalQuery, staleTime: 0 }),
      context.queryClient.fetchQuery({ ...queries.calorieBaselineQuery, staleTime: 0 }),
      context.queryClient.fetchQuery({ ...queries.mealsQuery, staleTime: 0 }),
    ]);
  },
  component: lazyRouteComponent(() => import("./pages/health/SharedHealthRoutePage"), "SharedHealthRoutePage"),
});

const financeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/finance",
  pendingComponent: () => <PagePending title="収支と資産" />,
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQuery),
  component: lazyRouteComponent(() => import("./pages/finance/FinancePage"), "FinancePage"),
});

const operationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/operations",
  validateSearch: (search) => monitoringSearchSchema.parse(search),
  pendingComponent: () => <PagePending title="同期・実行状況" />,
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
  sharedHealthRoute,
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
  // タブ選択と本文の遷移先をそろえ、取得済みデータの表示を引き延ばさない。
  defaultPendingMs: 0,
  defaultPendingMinMs: 0,
  // データの鮮度と重複取得の制御を Query に任せる。
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
