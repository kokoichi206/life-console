import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  HeartPulse,
  Home,
  ListTodo,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  WalletCards,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";

import { cn } from "../lib/class-names";
import { applyTheme, storedTheme, type Theme } from "../theme";

import { Button } from "./ui/Button";

const navigation = [
  { to: "/", label: "ホーム", icon: Home },
  { to: "/tasks", label: "仕事", icon: ListTodo },
  { to: "/health", label: "健康", icon: HeartPulse },
  { to: "/finance", label: "お金", icon: WalletCards },
] as const;

const themes: ReadonlyArray<{ readonly value: Theme; readonly label: string; readonly icon: typeof Sun }> = [
  { value: "light", label: "ライトモード", icon: Sun },
  { value: "system", label: "システム設定", icon: Monitor },
  { value: "dark", label: "ダークモード", icon: Moon },
];

const SIDEBAR_STORAGE_KEY = "life-console-sidebar-collapsed";

export const AppShell = () => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
  const [theme, setTheme] = useState<Theme>(storedTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return undefined;
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystemTheme = () => applyTheme("system");
    colorScheme.addEventListener("change", followSystemTheme);
    return () => colorScheme.removeEventListener("change", followSystemTheme);
  }, [theme]);

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const nextCollapsed = !collapsed;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextCollapsed));
      return nextCollapsed;
    });
  };

  return (
    <div className={pathname === "/tasks" ? "h-dvh overflow-hidden" : "min-h-screen"}>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 max-md:inset-x-0 max-md:top-auto max-md:h-16 max-md:w-full max-md:border-t max-md:border-r-0",
          sidebarCollapsed ? "w-16" : "w-56",
        )}
        aria-label="サイドバー"
      >
        <header className={cn("flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border px-3 max-md:hidden", sidebarCollapsed ? "justify-center" : "pl-4")}>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
              <strong className="block text-sm font-semibold text-white">Life Console</strong>
              <span className="block text-[0.65rem] text-sidebar-foreground/60">Personal workspace</span>
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label={sidebarCollapsed ? "サイドバーを開く" : "サイドバーを折りたたむ"}
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          </Button>
        </header>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 p-2 max-md:flex-row max-md:items-center max-md:justify-around max-md:p-1" aria-label="メインナビゲーション">
          {navigation.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-10 items-center gap-3 overflow-hidden rounded-lg px-3 text-xs font-semibold whitespace-nowrap text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-md:h-14 max-md:w-full max-md:flex-col max-md:justify-center max-md:gap-1 max-md:px-1 max-md:text-[0.6rem]",
                  sidebarCollapsed && "justify-center px-0",
                  active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                )}
                aria-label={item.label}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <item.icon className="size-4 shrink-0 max-md:size-5" aria-hidden="true" />
                {!sidebarCollapsed && <span className="max-md:block">{item.label}</span>}
                {sidebarCollapsed && <span className="hidden max-md:block">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="px-2 pb-2 max-md:hidden">
          <Link
            to="/operations"
            title="同期・実行状況"
            aria-label="同期・実行状況"
            className={cn("flex h-10 items-center gap-3 rounded-lg px-3 text-xs text-sidebar-foreground/65 hover:bg-sidebar-accent", sidebarCollapsed && "justify-center px-0", pathname === "/operations" && "bg-sidebar-accent text-sidebar-accent-foreground")}
          >
            <Activity className="size-4 shrink-0" />
            {!sidebarCollapsed && <span>同期・実行状況</span>}
          </Link>
        </div>
        <footer className="shrink-0 border-t border-sidebar-border p-2.5 max-md:hidden">
          <div className={cn("grid gap-1 rounded-xl border border-sidebar-border bg-black/10 p-1", sidebarCollapsed ? "grid-cols-1" : "grid-cols-3")} role="group" aria-label="表示テーマ">
            {themes.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "w-full text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  theme === item.value && "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm dark:bg-primary/30",
                )}
                aria-label={item.label}
                aria-pressed={theme === item.value}
                title={item.label}
                onClick={() => setTheme(item.value)}
              >
                <item.icon aria-hidden="true" />
              </Button>
            ))}
          </div>
        </footer>
      </aside>
      <main className={cn(
        "mx-auto w-full max-w-[1440px] px-6 transition-[padding] duration-200 sm:px-8",
        pathname === "/tasks" ? "flex h-full min-h-0 flex-col overflow-hidden pt-4 pb-20 md:pb-4" : "min-h-screen py-8 pb-20 md:pb-16",
        sidebarCollapsed ? "md:pl-24" : "md:pl-64",
      )}
      >
        <Suspense fallback={<div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">画面を読み込んでいます。</div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};
