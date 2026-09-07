import { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { lazy } from "react";

import { AppShell } from "./components/AppShell";
import { Eyebrow, Panel } from "./components/DesignSystem";
import { Button } from "./components/ui/Button";
import { jobsQuery } from "./features/jobs/queries";
import { dashboardQuery } from "./features/overview/queries";
import { repositoriesQuery } from "./features/repositories/queries";
import { financeQuery } from "./pages/finance/queries";
import { mealsQuery, weightsQuery } from "./pages/health/queries";
import { parseWorkSearch } from "./pages/work/work-search";

type RouterContext = {
  readonly queryClient: QueryClient;
};

const DashboardPage = lazy(async () => ({ default: (await import("./pages/dashboard/DashboardPage")).DashboardPage }));
const TasksPage = lazy(async () => ({ default: (await import("./pages/work/TasksPage")).TasksPage }));
const HealthPage = lazy(async () => ({ default: (await import("./pages/health/HealthPage")).HealthPage }));
const FinancePage = lazy(async () => ({ default: (await import("./pages/finance/FinancePage")).FinancePage }));
const OperationsPage = lazy(async () => ({ default: (await import("./pages/operations/OperationsPage")).OperationsPage }));

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  errorComponent: ({ error }) => (
    <Panel className="mx-auto mt-20 max-w-xl gap-4 px-5">
      <Eyebrow>REQUEST FAILED</Eyebrow>
      <h1 className="text-xl font-semibold">データを読み込めませんでした。</h1>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button className="w-fit" type="button" onClick={() => window.location.reload()}>再読み込み</Button>
    </Panel>
  ),
  pendingComponent: () => <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Life Console を読み込んでいます。</div>,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  component: DashboardPage,
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  validateSearch: parseWorkSearch,
  component: TasksPage,
});

const healthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/health",
  loader: async ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(weightsQuery),
    context.queryClient.ensureQueryData(mealsQuery),
  ]),
  component: HealthPage,
});

const financeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/finance",
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQuery),
  component: FinancePage,
});

const operationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/operations",
  loader: async ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(dashboardQuery),
    context.queryClient.ensureQueryData(repositoriesQuery),
    context.queryClient.ensureQueryData(jobsQuery),
  ]),
  component: OperationsPage,
});

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: "/drafts", beforeLoad: () => { throw redirect({ to: "/tasks", search: { view: "inbox", status: "draft" }, replace: true }); } }),
  dashboardRoute,
  tasksRoute,
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
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
