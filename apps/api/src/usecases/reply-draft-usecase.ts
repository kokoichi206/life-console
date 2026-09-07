import type { LifeConsoleRepository } from "@api/repositories/life-console-repository";
import { err, ok, type Conversation, type CreateReplyDraftsInput, type EditReplyDraftInput, type Job, type ReplyDraft, type Result, type SaveReplyDraftInput } from "@life-console/contracts";

import { appError, type AppError } from "../shared/app-error";
import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/id-generator";

export interface ReplyDraftUsecase {
  list(): Promise<Result<ReadonlyArray<ReplyDraft>, AppError>>;
  candidates(input: CreateReplyDraftsInput): Promise<Result<ReadonlyArray<Conversation>, AppError>>;
  save(input: SaveReplyDraftInput): Promise<Result<void, AppError>>;
  edit(id: string, input: EditReplyDraftInput): Promise<Result<void, AppError>>;
  generate(input: CreateReplyDraftsInput): Promise<Result<Job, AppError>>;
}

export const createReplyDraftUsecase = (repository: LifeConsoleRepository, clock: Clock, ids: IdGenerator): ReplyDraftUsecase => ({
  list: () => repository.listReplyDrafts(),
  candidates: async (input: CreateReplyDraftsInput) => {
    if (input.conversationId !== undefined) {
      const conversation = await repository.getConversation(input.conversationId);
      if (!conversation.ok) return conversation;
      if (conversation.value.connector !== input.connector) return err(appError.validation("会話とサービスが一致しません。"));
      return ok([conversation.value]);
    }
    return repository.listReplyCandidates(input,
      new Date(clock.now().getTime() - { "24h": 1, "3d": 3, "7d": 7 }[input.period] * 86_400_000).toISOString());
  },
  save: (input: SaveReplyDraftInput) => repository.saveReplyDraft(input, clock.now().toISOString()),
  edit: (id: string, input: EditReplyDraftInput) => repository.editReplyDraft(id, input, clock.now().toISOString()),
  generate: async (input: CreateReplyDraftsInput) => {
    if (input.conversationId !== undefined) {
      const conversation = await repository.getConversation(input.conversationId);
      if (!conversation.ok) return conversation;
      if (conversation.value.connector !== input.connector) return err(appError.validation("会話とサービスが一致しません。"));
    }
    const id = ids.create();
    return repository.createJob({
      id, kind: "reply_drafts", idempotencyKey: `reply-drafts:${id}`,
      payloadJson: JSON.stringify(input), now: clock.now().toISOString(),
    });
  },
});
