import type { Conversation, LifeConsoleRepository, Task } from "@api/repositories/life-console-repository";
import type { ImportConversationsInput, ListConversationsInput, Result } from "@life-console/contracts";

import type { AppError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

export interface ConversationUsecase {
  list(input: ListConversationsInput): Promise<Result<ReadonlyArray<Conversation>, AppError>>;
  classify(id: string, classification: string): Promise<Result<void, AppError>>;
  createTask(id: string): Promise<Result<Task, AppError>>;
  import(input: ImportConversationsInput): Promise<Result<number, AppError>>;
}

export const createConversationUsecase = (
  repository: LifeConsoleRepository,
  clock: Clock,
  idGenerator: IdGenerator,
): ConversationUsecase => ({
  list: (input) => {
    const periodMilliseconds = {
      "24h": 24 * 60 * 60 * 1_000,
      "3d": 3 * 24 * 60 * 60 * 1_000,
      "7d": 7 * 24 * 60 * 60 * 1_000,
    } as const;
    const since = input.period === "all"
      ? null
      : new Date(clock.now().getTime() - periodMilliseconds[input.period]).toISOString();
    return repository.listConversations({
      connector: input.connector ?? null,
      classification: input.classification ?? null,
      since,
    });
  },
  classify: (id, classification) => repository.classifyConversation(
    id,
    classification,
    clock.now().toISOString(),
  ),
  async createTask(id) {
    const conversation = await repository.getConversation(id);
    if (!conversation.ok) return conversation;
    const mapping = await repository.getSourceRepositoryMapping(
      conversation.value.connector,
      conversation.value.sourceId,
    );
    if (!mapping.ok) return mapping;
    const firstLine = conversation.value.excerpt.split("\n")[0]?.trim() ?? conversation.value.excerpt;
    const description = conversation.value.sourceUrl === null
      ? conversation.value.excerpt
      : `${conversation.value.excerpt}\n\n元会話: ${conversation.value.sourceUrl}`;
    return repository.createTaskFromConversation(
      idGenerator.create(),
      {
        title: firstLine.slice(0, 120),
        description,
        dueAt: null,
        conversationId: id,
        repositoryId: mapping.value?.repositoryId ?? null,
      },
      id,
      clock.now().toISOString(),
    );
  },
  import: (input) => repository.saveConversations(
    input.conversations.map((conversation) => ({
      id: idGenerator.create(),
      connector: input.connector,
      sourceId: input.sourceId,
      externalMessageId: conversation.externalMessageId,
      authorLabel: conversation.authorLabel,
      excerpt: conversation.excerpt,
      sourceUrl: conversation.sourceUrl,
      occurredAt: conversation.occurredAt,
      classification: conversation.classification,
    })),
    input.sourceLabel,
    input.watermark,
    clock.now().toISOString(),
  ),
});
