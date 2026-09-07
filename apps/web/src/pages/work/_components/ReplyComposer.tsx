import type { ReplyDraft } from "@life-console/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Save } from "lucide-react";

import { api } from "../../../api";
import { Field, FormError, Panel } from "../../../components/DesignSystem";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/Button";
import { Textarea } from "../../../components/ui/textarea";
import { replyStatusLabels } from "../work-search";

export type DraftEdit = { readonly body: string; readonly updatedAt: string };

export const ReplyComposer = ({ draft, editing, setEditing, onSend }: {
  readonly draft: ReplyDraft;
  readonly editing: DraftEdit | null;
  readonly setEditing: (edit: DraftEdit | null) => void;
  readonly onSend?: (body: string) => void;
}) => {
  const queryClient = useQueryClient();
  const body = editing?.body ?? draft.body;
  const editable = draft.status === "ready" || draft.status === "needs_review";
  const save = useMutation({
    mutationFn: () => api.editReplyDraft(draft.conversationId, { body, updatedAt: editing?.updatedAt ?? draft.updatedAt }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reply-drafts"] });
      setEditing(null);
    },
  });
  const copy = useMutation({ mutationFn: () => navigator.clipboard.writeText(body) });
  return (
    <Panel className="px-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={draft.status === "ready" ? "default" : "secondary"}>{replyStatusLabels[draft.status]}</Badge>
        {draft.editedAt !== null && <Badge variant="outline">編集済み</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">{new Date(draft.occurredAt).toLocaleString("ja-JP")}</span>
      </div>
      <p className="my-3 text-xs text-muted-foreground">自動送信はしません。確認事項を読み、必要な箇所を編集してください。</p>
      {editable && (
        <Field label="返信の下書き（未送信）">
          <Textarea
            aria-label={`${draft.authorLabel} への下書き`}
            rows={Math.max(4, Math.min(12, body.split("\n").length + 1))}
            maxLength={5_000}
            disabled={save.isPending}
            value={body}
            placeholder="確認事項を解決したら、返信内容を入力してください。"
            onChange={(event) => {
              setEditing({ body: event.target.value, updatedAt: editing?.updatedAt ?? draft.updatedAt });
              copy.reset();
            }}
          />
        </Field>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editable && (
          <>
            <Button type="button" size="sm" disabled={editing === null || body.trim() === "" || save.isPending} onClick={() => save.mutate()}>
              <Save />
              {save.isPending ? "保存中" : "編集を保存"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={body.trim() === ""} onClick={() => copy.mutate()}>
              <Copy />
              {copy.isSuccess ? "コピーしました" : "本文をコピー"}
            </Button>
          </>
        )}
        {editable && onSend !== undefined && <Button type="button" variant="outline" size="sm" disabled={body.trim() === ""} onClick={() => onSend(body)}>送信内容を確認</Button>}
        <small className="text-xs text-muted-foreground">
          履歴確認:
          {new Date(draft.checkedAt).toLocaleString("ja-JP")}
        </small>
      </div>
      <details className="my-3 rounded-lg bg-muted/40 p-3 text-xs leading-6">
        <summary className="cursor-pointer font-medium">確認事項・判定理由（送信前に確認）</summary>
        {draft.editedAt !== null && <p className="mb-2 text-muted-foreground">本文は手動編集した内容です。以下の確認事項が反映されているか、送信前に確認してください。</p>}
        <p className="whitespace-pre-wrap">{draft.reason}</p>
      </details>
      {editing !== null && <p className="mt-2 text-xs text-muted-foreground">未保存の変更があります。</p>}
      {save.error !== null && <FormError>{save.error.message}</FormError>}
      {copy.error !== null && <FormError>コピーできませんでした。本文を選択してコピーしてください。</FormError>}
    </Panel>
  );
};
