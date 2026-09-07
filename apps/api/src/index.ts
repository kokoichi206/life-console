import { app, createHandlers } from "./app";
import { parseApiEnvironment, type ApiEnvironment } from "./shared/environment";

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, environment: ApiEnvironment, executionContext: ExecutionContext): Promise<void> {
    environment = parseApiEnvironment(environment);
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
