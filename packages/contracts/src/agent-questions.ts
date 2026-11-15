import { z } from "zod";

export const createAgentQuestionSchema = z.object({ question: z.string().trim().min(1).max(10_000) });
export const answerAgentQuestionSchema = z.object({ answer: z.string().trim().min(1).max(10_000) });
export type AgentQuestion = {
  readonly id: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly question: string;
  readonly answer: string | null;
  readonly createdAt: string;
  readonly answeredAt: string | null;
};
