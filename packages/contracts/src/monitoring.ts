import { z } from "zod";

export const monitorServiceSchema = z.enum(["runner", "slack", "chatwork", "talknote", "gmail", "calendar", "orca"]);
export const monitorOutcomeSchema = z.enum(["healthy", "auth_required", "permission_denied", "unavailable", "timeout", "invalid_response", "not_configured"]);
export const monitorTargetSchema = z.object({ service: monitorServiceSchema, account: z.string().min(1).max(200) });
export const registerMonitorsSchema = z.object({ runnerId: z.string().min(1).max(200), targets: z.array(monitorTargetSchema).min(1).max(50).refine((targets) => targets.filter((target) => target.service === "runner" && target.account === "process").length === 1
  && targets.filter((target) => target.service === "runner").length === 1
  && new Set(targets.map((target) => JSON.stringify([target.service, target.account]))).size === targets.length, "runner と重複しない監視対象を指定してください。") });
export const monitorObservationSchema = monitorTargetSchema.extend({
  id: z.uuid(), runnerId: z.string().min(1).max(200), observedAt: z.iso.datetime(), outcome: monitorOutcomeSchema,
});
export const reportMonitoringSchema = z.object({ observation: monitorObservationSchema, historical: z.boolean() });
export const monitoringSearchSchema = z.object({ monitorTarget: z.string().optional(), monitorBefore: z.coerce.number().int().positive().optional() });
export const monitoringHistoryQuerySchema = z.object({
  targetId: z.string().optional(), before: z.coerce.number().int().positive().optional(),
});
export type MonitorService = z.infer<typeof monitorServiceSchema>;
export type MonitorOutcome = z.infer<typeof monitorOutcomeSchema>;
export type MonitorObservation = z.infer<typeof monitorObservationSchema>;
export type MonitorTarget = z.infer<typeof monitorTargetSchema>;
export type RegisterMonitorsInput = z.infer<typeof registerMonitorsSchema>;
export type MonitorStatus = {
  readonly id: string; readonly runnerId: string; readonly service: MonitorService; readonly account: string;
  readonly registeredAt: string; readonly receivedAt: string | null; readonly outcome: MonitorOutcome | null;
  readonly failures: number; readonly revision: number;
};
export type MonitorHistory = {
  readonly runnerId: string; readonly service: MonitorService; readonly account: string;
  readonly sequence: number; readonly targetId: string; readonly observedAt: string; readonly receivedAt: string;
  readonly outcome: MonitorOutcome; readonly historical: number;
};
export type MonitoringSummary = { readonly lastMaintenanceAt: string | null; readonly targets: ReadonlyArray<MonitorStatus>; readonly pendingNotifications: number; readonly failedNotifications: number };
export const monitorTargetId = (runnerId: string, target: MonitorTarget): string => JSON.stringify([runnerId, target.service, target.account]);
export const monitorState = (target: MonitorStatus, now: number): "healthy" | "delayed" | "unavailable" | "warning" | "unknown" => {
  const age = now - Date.parse(target.receivedAt ?? target.registeredAt);
  if (age >= 300_000) return "unavailable";
  if (target.outcome === null) return "unknown";
  if (target.outcome !== "healthy") return "warning";
  return age >= 180_000 ? "delayed" : "healthy";
};
