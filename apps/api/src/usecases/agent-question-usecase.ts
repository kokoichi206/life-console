import type { AgentQuestionRepository } from "@api/repositories/agent-question-repository";
import type { Clock } from "@api/shared/clock";
import type { IdGenerator } from "@api/shared/id-generator";

export const createAgentQuestionUsecase = (repository: AgentQuestionRepository, clock: Clock, ids: IdGenerator) => ({
  create: (jobId: string, leaseToken: string, question: string) => repository.create(ids.create(), jobId, leaseToken, question, clock.now().toISOString()),
  listPending: () => repository.listPending(clock.now().toISOString()),
  get: (id: string, jobId: string, leaseToken: string) => repository.get(id, jobId, leaseToken, clock.now().toISOString()),
  answer: (id: string, answer: string) => repository.answer(id, answer, clock.now().toISOString()),
});
