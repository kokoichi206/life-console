import { Dialog } from "@base-ui/react/dialog";
import type { WorkConfirmation } from "@life-console/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";

import { api } from "../../../api";
import { EmptyState, Eyebrow, FormError, Panel } from "../../../components/DesignSystem";
import { Badge } from "../../../components/ui/badge";
import { Button, buttonVariants } from "../../../components/ui/Button";
import { NativeSelect } from "../../../components/ui/native-select";
import { cn } from "../../../lib/class-names";
import { workConfirmationsQuery } from "../queries";

const kindLabels = { review: "レビュー依頼", decision: "方針の判断", merge: "マージの判断" } as const;
const formatTime = (time: string) => new Date(time).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const itemLabel = (item: WorkConfirmation) => {
  const segments = new URL(item.sourceUrl).pathname.split("/");
  return (segments[3] === "pull" ? "PR #" : "issue #") + segments[4];
};

export const WorkConfirmations = () => {
  const search = useSearch({ from: "/tasks" });
  const navigate = useNavigate({ from: "/tasks" });
  const client = useQueryClient();
  const query = useQuery(workConfirmationsQuery);
  const [completing, setCompleting] = useState<WorkConfirmation | null>(null);
  const completion = useMutation({
    mutationFn: api.completeWorkConfirmation,
    onSuccess: async (_result, id) => {
      setCompleting(null);
      await client.invalidateQueries({ queryKey: workConfirmationsQuery.queryKey });
      await navigate({ search: (previous) => ({ ...previous, confirmationStatus: "done", confirmationId: id }) });
    },
  });
  if (query.isPending) return <p role="status" className="py-12 text-center text-sm text-muted-foreground">確認依頼を読み込んでいます。</p>;
  if (query.error !== null) return (
    <div role="alert" className="space-y-3 py-6">
      <FormError>{query.error.message}</FormError>
      <Button variant="outline" onClick={() => void query.refetch()}>再試行</Button>
    </div>
  );
  const { confirmations, sources, notifications } = query.data;
  const status = search.confirmationStatus ?? "pending";
  const pendingCount = confirmations.filter((item) => item.status === "pending").length;
  const repositoryNames = [...new Set(confirmations.map((item) => item.repositoryName))].sort();
  const visible = confirmations.filter((item) => item.status === status
    && (search.confirmationRepository === undefined || item.repositoryName === search.confirmationRepository));
  const selected = search.confirmationId === undefined ? visible[0] : confirmations.find((item) => item.id === search.confirmationId);
  const resetSelection = { confirmationId: undefined };
  const fullSourceLabel = (item: WorkConfirmation) => item.repositoryName + " · " + itemLabel(item);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="shrink-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">レビュー・回答・判断が必要な依頼をまとめています。</p>
          <div className="text-xs text-muted-foreground">
            {sources.length === 0
              ? <p>まだ巡回からの取り込みはありません。</p>
              : sources.map((source) => (
                  <p key={source.id}>
                    {source.label}
                    {" "}
                    · 最終同期
                    {" "}
                    {formatTime(source.lastSuccessAt)}
                  </p>
                ))}
          </div>
        </div>
        {notifications.failed > 0 && (
          <p role="status" className="text-xs text-destructive">
            通知の送信に失敗しています。再送待ち
            {" "}
            {notifications.failed}
            {" "}
            件。確認依頼は保存されています。
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="確認依頼の状態" className="flex gap-1 rounded-lg bg-secondary p-1">
            {([{ value: "pending", label: "確認待ち", count: pendingCount }, { value: "done", label: "対応済み", count: confirmations.length - pendingCount }] as const).map((option) => (
              <Link
                key={option.value}
                from="/tasks"
                to="/tasks"
                search={(previous) => ({ ...previous, ...resetSelection, confirmationStatus: option.value })}
                aria-current={status === option.value ? "page" : undefined}
                className={cn("rounded-md px-3 py-1.5 text-xs", status === option.value && "bg-card font-semibold text-primary shadow-sm")}
              >
                {option.label}
                {" "}
                {option.count}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <NativeSelect
              aria-label="リポジトリで絞り込む"
              value={search.confirmationRepository ?? ""}
              onChange={(event) => void navigate({
                search: (previous) => ({ ...previous, ...resetSelection, confirmationRepository: event.target.value === "" ? undefined : event.target.value }),
              })}
            >
              <option value="">すべてのリポジトリ</option>
              {repositoryNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </NativeSelect>
            <Button variant="ghost" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>更新</Button>
          </div>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.35fr)]">
        <Panel className={cn("min-h-0 overflow-hidden", search.confirmationId !== undefined && "max-md:hidden")}>
          <h2 className="shrink-0 px-5 pb-4 text-sm font-semibold">あなたが対応すること</h2>
          <div role="region" aria-label="確認依頼の一覧" tabIndex={0} className="min-h-0 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            {visible.map((item) => (
              <Link
                key={item.id}
                from="/tasks"
                to="/tasks"
                search={(previous) => ({ ...previous, confirmationId: item.id })}
                aria-current={selected?.id === item.id ? "true" : undefined}
                className={cn("block space-y-2 border-t px-5 py-4 focus-visible:-outline-offset-2", selected?.id === item.id && "bg-accent shadow-[inset_3px_0_var(--primary)]")}
              >
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{kindLabels[item.kind]}</Badge>
                  <Badge variant="outline">{item.environment}</Badge>
                </div>
                <strong className="block text-sm">{item.title}</strong>
                <p className="text-xs leading-5 text-foreground/80">{item.summary}</p>
                <div className="flex flex-wrap justify-between gap-2 text-[0.65rem] text-foreground/80">
                  <span className="break-all">{fullSourceLabel(item)}</span>
                  <span>{formatTime(item.requestedAt)}</span>
                </div>
              </Link>
            ))}
            {visible.length === 0 && <div className="px-5"><EmptyState>この条件の確認依頼はありません。</EmptyState></div>}
          </div>
        </Panel>
        <Panel className={cn("min-h-0 overflow-y-auto overscroll-contain px-5", search.confirmationId === undefined && "max-md:hidden")}>
          <div role="region" aria-label="確認依頼の詳細" className="space-y-5">
            <Link from="/tasks" to="/tasks" search={(previous) => ({ ...previous, ...resetSelection })} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "md:hidden")}>一覧に戻る</Link>
            {selected === undefined
              ? <EmptyState>{search.confirmationId === undefined ? "一覧から依頼を選んでください。" : "指定した確認依頼が見つかりません。"}</EmptyState>
              : (
                  <>
                    <div className="space-y-3">
                      <Eyebrow>{selected.status === "done" ? "COMPLETED" : "YOUR NEXT ACTION"}</Eyebrow>
                      <div className="flex gap-2">
                        <Badge variant="secondary">{kindLabels[selected.kind]}</Badge>
                        <Badge variant="outline">{selected.status === "done" ? "対応済み" : "あなたの確認待ち"}</Badge>
                      </div>
                      <h2 className="text-lg font-semibold">{selected.title}</h2>
                      <p className="break-all text-xs text-muted-foreground">
                        {fullSourceLabel(selected)}
                        {" "}
                        ·
                        {" "}
                        {selected.environment}
                      </p>
                    </div>
                    <section className="space-y-2 rounded-lg bg-accent px-4 py-3">
                      <h3 className="text-xs font-semibold">あなたにお願いしたいこと</h3>
                      <p className="text-sm font-semibold whitespace-pre-wrap">{selected.question}</p>
                    </section>
                    <section className="space-y-2">
                      <h3 className="text-xs font-semibold">なぜ確認が必要か</h3>
                      <p className="text-sm leading-7 whitespace-pre-wrap">{selected.reason}</p>
                    </section>
                    <section className="space-y-2 border-l-3 border-primary pl-3">
                      <h3 className="text-xs font-semibold">agent の推奨案</h3>
                      <p className="text-sm leading-7 whitespace-pre-wrap">{selected.recommendation === "" ? "推奨案はまだありません。" : selected.recommendation}</p>
                    </section>
                    <section className="space-y-2">
                      <h3 className="text-xs font-semibold">判断の根拠と未確認点</h3>
                      {selected.evidence.length === 0
                        ? <p className="text-xs text-muted-foreground">根拠はまだ登録されていません。</p>
                        : (
                            <ul>
                              {selected.evidence.map((entry, index) => (
                                <li key={index} className="space-y-1 border-b py-2 last:border-b-0">
                                  <div className="flex items-start gap-2">
                                    <Badge variant="outline">{entry.state === "confirmed" ? "確認済み" : "未確認"}</Badge>
                                    <span className="text-xs">{entry.title}</span>
                                  </div>
                                  <p className="text-xs leading-6 whitespace-pre-wrap text-muted-foreground">{entry.detail}</p>
                                  {entry.url !== null && (
                                    <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                                      根拠を開く
                                      <span className="sr-only">
                                        :
                                        {entry.title}
                                      </span>
                                    </a>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                    </section>
                    <div className="flex flex-wrap justify-between gap-3 border-t pt-4 text-[0.7rem] text-muted-foreground">
                      <p>
                        依頼元:
                        {selected.sourceLabel}
                        <br />
                        依頼:
                        {" "}
                        {formatTime(selected.requestedAt)}
                      </p>
                      <p>
                        最終確認:
                        {formatTime(selected.checkedAt)}
                      </p>
                      {selected.completedAt !== null && (
                        <p>
                          対応済み:
                          {formatTime(selected.completedAt)}
                          {" "}
                          ·
                          {selected.completedBy === "user" ? "本人の記録" : "巡回で解消を確認"}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>GitHub で確認</a>
                      {selected.status === "pending" && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            completion.reset();
                            setCompleting(selected);
                          }}
                        >
                          対応済みとして記録
                        </Button>
                      )}
                    </div>
                    <p className="pb-2 text-xs leading-5 text-muted-foreground">GitHub での対応は、依頼元から解消の確認を受け取ると反映されます。記録だけでは、マージや issue の終了は行いません。</p>
                  </>
                )}
          </div>
        </Panel>
      </div>
      <Dialog.Root open={completing !== null} onOpenChange={(open) => { if (!open && !completion.isPending) setCompleting(null); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/45" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%_-_32px)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-xl bg-card p-6 shadow-xl outline-none">
            <Dialog.Title className="text-lg font-semibold">対応済みとして記録</Dialog.Title>
            <Dialog.Description className="text-sm leading-6">
              『
              {completing?.title}
              』への対応が済んだことを記録します。元の PR / issue の状態は変わりません。
            </Dialog.Description>
            {completion.error !== null && <FormError>{completion.error.message}</FormError>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={completion.isPending} onClick={() => setCompleting(null)}>戻る</Button>
              <Button disabled={completion.isPending} onClick={() => { if (completing !== null) completion.mutate(completing.id); }}>{completion.isPending ? "記録中" : "記録する"}</Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
