import { app, createHandlers, createMonitoringHandlers, createWorkConfirmationHandlers } from "./app";
import { parseApiEnvironment, type ApiEnvironment } from "./shared/environment";

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, environment: ApiEnvironment, executionContext: ExecutionContext): Promise<void> {
    environment = parseApiEnvironment(environment);
    executionContext.waitUntil(createWorkConfirmationHandlers(environment).deliverNotifications().then((result) => {
      if (!result.ok) console.error(JSON.stringify({ event: "work_confirmation_delivery_failed", errorCode: result.error.code, timestamp: new Date().toISOString() }));
    }));
    executionContext.waitUntil(createMonitoringHandlers(environment).maintain().then((result) => {
      if (!result.ok) console.error(JSON.stringify({ event: "monitoring_maintenance_failed", errorCode: result.error.code, timestamp: new Date().toISOString() }));
    }));
    executionContext.waitUntil(createHandlers(environment).runScheduledMaintenance().then((result) => {
      if (!result.ok) {
        console.error(JSON.stringify({
          event: "scheduled_maintenance_failed",
          errorCode: result.error.code,
          timestamp: new Date().toISOString(),
        }));
      }
    }));
  },
} satisfies ExportedHandler<ApiEnvironment>;
