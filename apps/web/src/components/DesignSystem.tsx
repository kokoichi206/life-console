import type { TaskStatus } from "@life-console/contracts";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/class-names";

import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Label } from "./ui/label";

export const Eyebrow = ({ children, className }: { readonly children: ReactNode; readonly className?: string }) => (
  <p className={cn("text-[0.65rem] font-bold tracking-[0.18em] text-primary uppercase", className)}>{children}</p>
);

export const Panel = ({ className, mobileLayout = "card", ...props }: ComponentProps<typeof Card> & { readonly mobileLayout?: "card" | "section" }) => (
  <Card data-mobile-layout={mobileLayout} className={cn("gap-0 py-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)]", mobileLayout === "section" && "max-sm:overflow-visible max-sm:rounded-none max-sm:border-t max-sm:bg-transparent max-sm:px-0 max-sm:shadow-none max-sm:ring-0", className)} {...props} />
);

export const SectionHeading = ({ eyebrow, title, action, className }: {
  readonly eyebrow: string;
  readonly title: string;
  readonly action?: ReactNode;
  readonly className?: string;
}) => (
  <div className={cn("flex items-start justify-between gap-4 px-5 pb-4 max-sm:group-data-[mobile-layout=section]/card:flex-wrap max-sm:group-data-[mobile-layout=section]/card:px-0", className)}>
    <div className="space-y-1.5">
      <Eyebrow className="max-sm:group-data-[mobile-layout=section]/card:hidden">{eyebrow}</Eyebrow>
      <h2 className="text-base font-semibold tracking-tight max-sm:group-data-[mobile-layout=section]/card:text-xl">{title}</h2>
    </div>
    {action}
  </div>
);

export const Field = ({ label, children, className }: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
}) => (
  <Label className={cn("grid items-start gap-2 text-xs text-muted-foreground", className)}>
    <span>{label}</span>
    {children}
  </Label>
);

export const CountBadge = ({ children, className }: { readonly children: ReactNode; readonly className?: string }) => (
  <Badge variant="outline" className={cn("h-7 bg-card px-2.5 font-medium text-muted-foreground tabular-nums", className)}>{children}</Badge>
);

export const EmptyState = ({ children }: { readonly children: ReactNode }) => (
  <p className="rounded-lg border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">{children}</p>
);

export const FormError = ({ children }: { readonly children: ReactNode }) => (
  <p role="alert" className="text-xs font-medium text-destructive">{children}</p>
);

type MetricTone = "primary" | "orange" | "gold" | "blue";

export const MetricCard = ({ label, value, detail, tone }: {
  readonly label: string;
  readonly value: ReactNode;
  readonly detail: ReactNode;
  readonly tone: MetricTone;
}) => (
  <Card className={cn("relative min-h-32 gap-0 overflow-hidden px-5 py-5 max-sm:min-h-0 max-sm:rounded-none max-sm:border-b max-sm:bg-transparent max-sm:px-0 max-sm:shadow-none max-sm:ring-0 max-sm:before:hidden before:absolute before:inset-y-0 before:left-0 before:w-0.75", { "before:bg-primary": tone === "primary", "before:bg-chart-2": tone === "orange", "before:bg-chart-3": tone === "gold", "before:bg-chart-4": tone === "blue" })}>
    <span className="text-xs font-semibold text-muted-foreground">{label}</span>
    <strong className="mt-4 text-3xl leading-none font-semibold tracking-tight tabular-nums">{value}</strong>
    <small className="mt-2 text-[0.7rem] text-muted-foreground">{detail}</small>
  </Card>
);

const taskStatusDotClasses: Readonly<Record<TaskStatus, string>> = {
  canceled: "bg-muted-foreground",
  doing: "bg-chart-2 ring-4 ring-accent",
  done: "bg-success",
  inbox: "bg-chart-4",
  todo: "bg-chart-3",
};

export const StatusDot = ({ status }: { readonly status: TaskStatus }) => (
  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", taskStatusDotClasses[status])} />
);
