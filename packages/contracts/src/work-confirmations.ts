import { workConfirmationKinds, workConfirmationStatuses, workConfirmationEvidenceStates } from "@life-console/domain";
import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const timestamp = z.iso.datetime({ offset: true });
const githubItemUrl = z.url().max(2048).regex(/^https:\/\/github\.com\/[^/?#]+\/[^/?#]+\/(?:pull|issues)\/[1-9]\d*(?:[?#].*)?$/u);
const evidenceSchema = z.object({
  state: z.enum(workConfirmationEvidenceStates),
  title: z.string().trim().min(1).max(500),
  detail: z.string().max(2000),
  url: z.url().max(2048).regex(/^https:\/\//u).nullable(),
});
export const importWorkConfirmationSchema = z.object({
  externalId: identifier,
  repositoryName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u).max(200),
  sourceUrl: githubItemUrl,
  kind: z.enum(workConfirmationKinds),
  title: z.string().trim().min(1).max(240),
  summary: z.string().trim().min(1).max(1000),
  environment: z.string().trim().min(1).max(100),
  question: z.string().trim().min(1).max(2000),
  reason: z.string().trim().min(1).max(5000),
  recommendation: z.string().max(5000),
  evidence: z.array(evidenceSchema).max(20),
  requestedAt: timestamp,
  checkedAt: timestamp,
  status: z.enum(workConfirmationStatuses),
}).superRefine((input, context) => {
  if (input.sourceUrl.split("/").slice(3, 5).join("/") !== input.repositoryName) {
    context.addIssue({ code: "custom", path: ["sourceUrl"], message: "元 URL とリポジトリが一致していません。" });
  }
  if (Date.parse(input.checkedAt) < Date.parse(input.requestedAt)) {
    context.addIssue({ code: "custom", path: ["checkedAt"], message: "確認時刻は依頼時刻以降にしてください。" });
  }
});
export const importWorkConfirmationsSchema = z.object({
  sourceId: identifier,
  sourceLabel: z.string().trim().min(1).max(200),
  confirmations: z.array(importWorkConfirmationSchema).max(50),
}).superRefine((input, context) => {
  if (new Set(input.confirmations.map((item) => item.externalId)).size !== input.confirmations.length) {
    context.addIssue({ code: "custom", path: ["confirmations"], message: "同じ依頼 ID を一度に複数送れません。" });
  }
});
export type ImportWorkConfirmation = z.infer<typeof importWorkConfirmationSchema>;
export type ImportWorkConfirmationsInput = z.infer<typeof importWorkConfirmationsSchema>;
export type WorkConfirmation = ImportWorkConfirmation & {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly completedAt: string | null;
  readonly completedBy: "user" | "source" | null;
};
export type WorkConfirmations = {
  readonly confirmations: ReadonlyArray<WorkConfirmation>;
  readonly sources: ReadonlyArray<{ readonly id: string; readonly label: string; readonly lastSuccessAt: string }>;
  readonly notifications: { readonly pending: number; readonly failed: number };
};
