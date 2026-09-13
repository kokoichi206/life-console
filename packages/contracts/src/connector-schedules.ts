import { connectorKinds, scheduleIntervals } from "@life-console/domain";
import { z } from "zod";

export const createConnectorScheduleSchema = z.object({
  connector: z.enum(connectorKinds),
  interval: z.enum(scheduleIntervals),
  runImmediately: z.boolean(),
}).strict();
export const updateConnectorScheduleSchema = z.object({
  interval: z.enum(scheduleIntervals),
  enabled: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
}).strict();
export type CreateConnectorScheduleInput = z.infer<typeof createConnectorScheduleSchema>;
export type UpdateConnectorScheduleInput = z.infer<typeof updateConnectorScheduleSchema>;
export type ConnectorSchedule = {
  readonly id: string;
  readonly interval: typeof scheduleIntervals[number];
  readonly enabled: boolean;
  readonly nextRunAt: string;
  readonly updatedAt: string;
};
export type ConnectorScheduleStatus = {
  readonly connector: typeof connectorKinds[number];
  readonly schedules: ReadonlyArray<ConnectorSchedule>;
  readonly active: boolean;
  readonly latestJob: { readonly status: string; readonly summary: string | null; readonly errorCode: string | null; readonly createdAt: string } | null;
};
