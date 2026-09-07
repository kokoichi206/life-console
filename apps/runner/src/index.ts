import { runnerConfig } from "./config";
import { localLogger } from "./logger";
import { createApiRepository } from "./repositories/api-repository";
import { createCloudflareBackupRepository } from "./repositories/backup-repository";
import { fileCapabilityRepository } from "./repositories/capability-repository";
import { processCommandRepository } from "./repositories/command-repository";
import { createChatworkConnector, createConversationReplyRepository, createSlackConnector } from "./repositories/connectors";
import { createGmailConnector } from "./repositories/gmail-connector";
import { fileImportRepository } from "./repositories/import-repository";
import { createOrcaRepository } from "./repositories/orca-repository";
import { createReplyCalendarRepository } from "./repositories/reply-calendar-repository";
import { createReplyContextRepository } from "./repositories/reply-context-repository";
import { createReplyDraftGenerator } from "./repositories/reply-draft-generator";
import { createOrcaRepositoryScanner } from "./repositories/repository-scanner";
import { createTalknoteConnector } from "./repositories/talknote-connector";
import { createJobExecutorUsecase } from "./usecases/job-executor-usecase";
import { createRunnerUsecase } from "./usecases/runner-usecase";

const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

const api = createApiRepository(runnerConfig);
const orca = createOrcaRepository(processCommandRepository);
const executor = createJobExecutorUsecase({
  api,
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
  orca,
});

const main = async (): Promise<void> => {
  const registered = await runner.register();
  if (!registered) {
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes("--once")) {
    await runner.runOnce();
    return;
  }
  while (true) {
    await runner.runOnce();
    await wait(runnerConfig.pollMilliseconds);
  }
};

void main().catch((cause: unknown) => {
  localLogger.error({
    event: "runner_crashed",
    errorCode: "runner_crashed",
    detail: cause,
    timestamp: new Date().toISOString(),
  });
  process.exitCode = 1;
});
