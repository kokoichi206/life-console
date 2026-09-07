import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/class-names";

import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { Label } from "./ui/label";

export const Eyebrow = ({ children, className }: { readonly children: ReactNode; readonly className?: string }) => (
  <p className={cn("text-[0.65rem] font-bold tracking-[0.18em] text-primary uppercase", className)}>{children}</p>
);

export const Panel = ({ className, ...props }: ComponentProps<typeof Card>) => (
  <Card className={cn("gap-0 py-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)]", className)} {...props} />
);

export const SectionHeading = ({ eyebrow, title, action, className }: {
  readonly eyebrow: string;
  readonly title: string;
  readonly action?: ReactNode;
  readonly className?: string;
}) => (
  <div className={cn("flex items-start justify-between gap-4 px-5 pb-4", className)}>
    <div className="space-y-1.5">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
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

const metricToneClass: Readonly<Record<MetricTone, string>> = {
  primary: "before:bg-primary",
  orange: "before:bg-chart-2",
  gold: "before:bg-chart-3",
  blue: "before:bg-chart-4",
};

export const MetricCard = ({ label, value, detail, tone }: {
  readonly label: string;
  readonly value: ReactNode;
  readonly detail: ReactNode;
  readonly tone: MetricTone;
}) => (
  <Card className={cn("relative min-h-32 gap-0 overflow-hidden px-5 py-5 before:absolute before:inset-y-0 before:left-0 before:w-0.75", metricToneClass[tone])}>
    <span className="text-xs font-semibold text-muted-foreground">{label}</span>
    <strong className="mt-4 text-3xl leading-none font-semibold tracking-tight tabular-nums">{value}</strong>
    <small className="mt-2 text-[0.7rem] text-muted-foreground">{detail}</small>
  </Card>
);

export const StatusDot = ({ status }: { readonly status: string }) => {
  const className = {
    doing: "bg-chart-2 ring-4 ring-accent",
    done: "bg-success",
    inbox: "bg-chart-4",
    todo: "bg-chart-3",
  }[status] ?? "bg-muted-foreground";
  return <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", className)} />;
};
