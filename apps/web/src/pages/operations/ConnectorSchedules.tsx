import type { ConnectorSchedule, ConnectorScheduleStatus, CreateConnectorScheduleInput, UpdateConnectorScheduleInput } from "@life-console/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../api";
import { Field, FormError, Panel, SectionHeading } from "../../components/DesignSystem";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/Button";
import { NativeSelect } from "../../components/ui/native-select";
import { jobStatusLabels } from "../../features/jobs/JobProgress";
import { serviceLabels } from "../work/work-search";

import { connectorSchedulesQuery } from "./queries";

const intervalLabels = { hourly: "1 時間ごと", daily: "1 日ごと", weekly: "1 週間ごと" } as const;
type ScheduleActions = {
  readonly pending: boolean;
  readonly onCreate: (input: CreateConnectorScheduleInput) => void;
  readonly onUpdate: (id: string, input: UpdateConnectorScheduleInput) => void;
  readonly onSync: (connector: ConnectorScheduleStatus["connector"]) => void;
};
const ScheduleForm = ({ connector, schedule, pending, onCreate, onUpdate }: Pick<ConnectorScheduleStatus, "connector"> & { readonly schedule?: ConnectorSchedule } & Omit<ScheduleActions, "onSync">) => {
  const [interval, setInterval] = useState(schedule?.interval ?? "hourly");
  const [runImmediately, setRunImmediately] = useState(false);
  const label = serviceLabels[connector];
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (schedule === undefined) onCreate({ connector, interval, runImmediately });
        else onUpdate(schedule.id, { interval, enabled: schedule.enabled, updatedAt: schedule.updatedAt });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <Field label={`${label} の実行頻度`}>
          <NativeSelect value={interval} disabled={pending} onChange={(event) => setInterval(event.target.value as ConnectorSchedule["interval"])}>
            {Object.entries(intervalLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </NativeSelect>
        </Field>
        <Button type="submit" size="sm" disabled={pending || (schedule !== undefined && interval === schedule.interval)}>{schedule === undefined ? "定期実行を登録" : "頻度を保存"}</Button>
        {schedule !== undefined && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onUpdate(schedule.id, { interval: schedule.interval, enabled: !schedule.enabled, updatedAt: schedule.updatedAt })}>{schedule.enabled ? "一時停止" : "再開"}</Button>}
      </div>
      {schedule === undefined
        ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={runImmediately} disabled={pending} onChange={(event) => setRunImmediately(event.target.checked)} />
              登録後に初回の同期を実行する
            </label>
          )
        : <p className="text-xs text-muted-foreground">{schedule.enabled ? `次回: ${new Date(schedule.nextRunAt).toLocaleString("ja-JP")}` : "停止中は新しい定期実行を予約しません。"}</p>}
    </form>
  );
};

export const ConnectorSchedulesView = ({ statuses, loading, error, notice, pending, onCreate, onUpdate, onSync, onReload }: ScheduleActions & {
  readonly statuses: ReadonlyArray<ConnectorScheduleStatus> | undefined;
  readonly loading: boolean;
  readonly error: string | null;
  readonly notice: string | null;
  readonly onReload: () => void;
}) => (
  <Panel className="mb-4">
    <SectionHeading eyebrow="SCHEDULES" title="連絡の定期実行" action={<Button type="button" variant="outline" size="sm" onClick={onReload} disabled={pending}>再読み込み</Button>} />
    <div className="space-y-4 px-5">
      <p className="text-sm text-muted-foreground">接続確認とは別に、連絡を取り込む予定を登録します。取得元と範囲は現在の接続設定を使います。</p>
      <p className="text-xs text-muted-foreground">停止しても予約済み・実行中の同期は中止しません。中止は実行履歴から操作してください。頻度変更・再開後の次回は、その時点から指定した間隔の後です。</p>
      {loading && <p role="status">定期実行を読み込み中です。</p>}
      {error !== null && <FormError>{error}</FormError>}
      {notice !== null && <p role="status" className="text-sm">{notice}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {statuses?.map((status) => (
          <section key={status.connector} aria-label={`${serviceLabels[status.connector]} の定期実行`} className="min-w-0 space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{serviceLabels[status.connector]}</h3>
              <Badge variant="secondary">{status.schedules.length === 0 ? "未設定" : status.schedules.some((schedule) => schedule.enabled) ? "有効" : "停止中"}</Badge>
            </div>
            {status.schedules.length === 0 ? <ScheduleForm connector={status.connector} pending={pending} onCreate={onCreate} onUpdate={onUpdate} /> : status.schedules.map((schedule) => <ScheduleForm key={`${schedule.id}:${schedule.interval}:${String(schedule.enabled)}`} connector={status.connector} schedule={schedule} pending={pending} onCreate={onCreate} onUpdate={onUpdate} />)}
            <div className="border-t pt-3 text-sm">
              <p>{status.latestJob === null ? "同期の実行履歴はありません。" : `直近の実行: ${jobStatusLabels[status.latestJob.status] ?? status.latestJob.status} · ${new Date(status.latestJob.createdAt).toLocaleString("ja-JP")}`}</p>
              {status.latestJob?.summary != null && <p className="mt-1 break-words text-xs text-muted-foreground">{status.latestJob.summary}</p>}
              {status.latestJob?.errorCode != null && <p className="mt-1 break-words text-xs text-destructive">{status.latestJob.errorCode}</p>}
            </div>
            <Button type="button" variant="outline" size="sm" disabled={pending || status.active} onClick={() => onSync(status.connector)}>{status.active ? "同期を待機・実行中" : "今すぐ同期"}</Button>
          </section>
        ))}
      </div>
    </div>
  </Panel>
);

export const ConnectorSchedules = () => {
  const client = useQueryClient();
  const query = useQuery(connectorSchedulesQuery);
  const [notice, setNotice] = useState<string | null>(null);
  const invalidate = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ["connector-schedules"] }), client.invalidateQueries({ queryKey: ["jobs"] })]);
  };
  const mutation = useMutation({
    mutationFn: async (operation: { kind: "create"; input: CreateConnectorScheduleInput } | { kind: "update"; id: string; input: UpdateConnectorScheduleInput } | { kind: "sync"; connector: ConnectorScheduleStatus["connector"] }) => {
      setNotice(null);
      if (operation.kind === "create") await api.createConnectorSchedule(operation.input);
      else if (operation.kind === "update") await api.updateConnectorSchedule(operation.id, operation.input);
      else await api.syncConnector(operation.connector);
      return operation.kind;
    },
    onSuccess: (kind) => setNotice(kind === "sync" ? "同期を予約しました。結果は実行履歴に反映されます。" : "定期実行の設定を保存しました。"),
    onSettled: invalidate,
  });
  return (
    <ConnectorSchedulesView
      statuses={query.isError ? undefined : query.data}
      loading={query.isPending}
      error={mutation.error?.message ?? query.error?.message ?? null}
      notice={notice}
      pending={mutation.isPending}
      onReload={() => {
        mutation.reset();
        void query.refetch();
      }}
      onCreate={(input) => mutation.mutate({ kind: "create", input })}
      onUpdate={(id, input) => mutation.mutate({ kind: "update", id, input })}
      onSync={(connector) => mutation.mutate({ kind: "sync", connector })}
    />
  );
};
