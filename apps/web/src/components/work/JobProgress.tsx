import type { Job } from "@life-console/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api";
import { FormError } from "../DesignSystem";
import { Badge } from "../ui/badge";
import { Button } from "../ui/Button";

export const activeJobStatuses = new Set(["queued", "claimed", "running", "waiting_for_user"]);
export const jobStatusLabels: Readonly<Record<string, string>> = {
  queued: "実行待ち", claimed: "開始準備", running: "実行中", waiting_for_user: "確認待ち",
  succeeded: "完了", failed: "失敗", canceled: "中止", expired: "期限切れ", skipped_precondition: "前提条件待ち",
  lost: "結果不明",
};

export const JobProgress = ({ job }: { readonly job: Job }) => {
  const client = useQueryClient();
  const cancel = useMutation({ mutationFn: () => api.cancelJob(job.id), onSuccess: async () => client.invalidateQueries({ queryKey: ["jobs"] }) });
  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={job.status === "failed" || job.status === "lost" ? "destructive" : "secondary"}>{jobStatusLabels[job.status] ?? job.status}</Badge>
        <span className="text-muted-foreground">{new Date(job.updatedAt).toLocaleString("ja-JP")}</span>
        {activeJobStatuses.has(job.status) && <Button className="ml-auto" variant="ghost" size="xs" disabled={cancel.isPending || job.cancelRequestedAt !== null} onClick={() => cancel.mutate()}>{job.cancelRequestedAt === null ? "中止" : "中止要求済み"}</Button>}
      </div>
      <p className="whitespace-pre-wrap leading-5">{job.summary ?? "常駐エージェントの処理を待っています。"}</p>
      {job.status === "lost" && <p className="text-destructive">完了を確認できません。元のサービスや agent の状態を確認してください。自動再実行はしません。</p>}
      {job.errorCode !== null && <p className="text-destructive">{job.errorCode}</p>}
      {cancel.error !== null && <FormError>{cancel.error.message}</FormError>}
    </div>
  );
};
