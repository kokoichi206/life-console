import { runnerConfig } from "./config";
import { localLogger } from "./logger";
import { createApiRepository } from "./repositories/api-repository";
import { createCloudflareBackupRepository } from "./repositories/backup-repository";
import { fileCapabilityRepository } from "./repositories/capability-repository";
import { processCommandRepository } from "./repositories/command-repository";
import { createChatworkConnector, createConversationReplyRepository, createSlackConnector } from "./repositories/connectors";
import { createGmailConnector } from "./repositories/gmail-connector";
import { fileImportRepository } from "./repositories/import-repository";
import { createMonitorProbeRepository } from "./repositories/monitor-probe-repository";
import { openMonitorQueue } from "./repositories/monitor-queue-repository";
import { createNutritionGenerator } from "./repositories/nutrition-generator";
import { createOrcaRepository } from "./repositories/orca-repository";
import { createReplyCalendarRepository } from "./repositories/reply-calendar-repository";
import { createReplyContextRepository } from "./repositories/reply-context-repository";
import { createReplyDraftGenerator } from "./repositories/reply-draft-generator";
import { createOrcaRepositoryScanner } from "./repositories/repository-scanner";
import { createTalknoteConnector } from "./repositories/talknote-connector";
import { fileWeightHistoryRepository } from "./repositories/weight-history-repository";
import { createJobExecutorUsecase } from "./usecases/job-executor-usecase";
import { createRunnerMonitoringUsecase } from "./usecases/monitoring-usecase";
import { runRunnerLoops } from "./usecases/runner-loops";
import { createRunnerUsecase } from "./usecases/runner-usecase";
import { createWeightObsidianExportUsecase } from "./usecases/weight-obsidian-export-usecase";

const api = createApiRepository(runnerConfig);
const orca = createOrcaRepository(processCommandRepository);
const executor = createJobExecutorUsecase({
  api,
  nutritionGenerator: createNutritionGenerator(processCommandRepository, api, runnerConfig.nutrition),
  weightExport: createWeightObsidianExportUsecase({ api, history: fileWeightHistoryRepository, vaultPath: runnerConfig.obsidianVaultPath }),
  backup: createCloudflareBackupRepository(processCommandRepository, runnerConfig),
  capabilities: fileCapabilityRepository,
  chatwork: createChatworkConnector(processCommandRepository, runnerConfig),
  gmail: createGmailConnector(processCommandRepository, runnerConfig),
  talknote: createTalknoteConnector(processCommandRepository, runnerConfig),
  replyContexts: createReplyContextRepository(processCommandRepository),
  replyDraftGenerator: createReplyDraftGenerator(processCommandRepository),
  replyCalendar: createReplyCalendarRepository(processCommandRepository, runnerConfig.gmailAccount),
  conversationReplies: createConversationReplyRepository(processCommandRepository),
  configuration: runnerConfig,
  imports: fileImportRepository,
  orca,
  repositoryScanner: createOrcaRepositoryScanner(processCommandRepository),
  slack: createSlackConnector(processCommandRepository, runnerConfig),
});
const runner = createRunnerUsecase({
  api,
  executor,
  heartbeatMilliseconds: runnerConfig.heartbeatMilliseconds,
  logger: localLogger,
});

const main = async (): Promise<void> => {
  const opened = await openMonitorQueue(runnerConfig.monitorQueuePath);
  if (!opened.ok) {
    localLogger.error({ event: "monitoring_start_failed", errorCode: opened.error.code, timestamp: new Date().toISOString() });
    process.exitCode = 1;
    return;
  }
  const monitoring = createRunnerMonitoringUsecase(api, createMonitorProbeRepository(processCommandRepository, runnerConfig), opened.value, runnerConfig.runnerId, localLogger);
  const once = process.argv.includes("--once");
  const register = async () => {
    if (!await runner.register()) return false;
    const monitors = await api.registerMonitors(runnerConfig.monitorTargets);
    if (!monitors.ok) localLogger.error({ event: "monitor_registration_failed", errorCode: monitors.error.code, timestamp: new Date().toISOString() });
    return monitors.ok;
  };
  if (once) {
    const registered = await register();
    await Promise.all(runnerConfig.monitorTargets.map((target) => monitoring.observe(target, registered)));
    if (registered) {
      await monitoring.flush();
      await runner.runOnce();
    } else process.exitCode = 1;
    opened.value.close();
    return;
  }
  await runRunnerLoops({ targets: runnerConfig.monitorTargets, register, observe: monitoring.observe, flush: monitoring.flush,
    runJob: () => runner.runOnce(), pollMilliseconds: runnerConfig.pollMilliseconds }, new AbortController().signal);
};

void main().catch(() => {
  localLogger.error({
    event: "runner_crashed",
    errorCode: "runner_crashed",
    timestamp: new Date().toISOString(),
  });
  process.exitCode = 1;
});
