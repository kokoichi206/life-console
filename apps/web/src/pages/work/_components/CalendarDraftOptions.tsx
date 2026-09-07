import type { ReplyCalendarRequest } from "@life-console/contracts";

import { Field } from "../../../components/DesignSystem";
import { Input } from "../../../components/ui/input";
import { NativeSelect } from "../../../components/ui/native-select";

export const initialReplyCalendar = (): ReplyCalendarRequest => {
  const today = new Date(Date.now() + 9 * 60 * 60_000).toISOString().slice(0, 10);
  return { from: today, through: new Date(Date.parse(today) + 13 * 86_400_000).toISOString().slice(0, 10), dayStart: "09:00", dayEnd: "18:00", durationMinutes: 30 };
};

export const CalendarDraftOptions = ({ enabled, onEnabledChange, request, onChange }: {
  readonly enabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly request: ReplyCalendarRequest;
  readonly onChange: (request: ReplyCalendarRequest) => void;
}) => (
  <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
    <label className="flex items-center gap-2 text-xs font-medium">
      <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
      カレンダーの空き時間を使う
    </label>
    {enabled && (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="候補の開始日"><Input required type="date" value={request.from} onChange={(event) => onChange({ ...request, from: event.target.value })} /></Field>
          <Field label="候補の最終日"><Input required type="date" min={request.from} value={request.through} onChange={(event) => onChange({ ...request, through: event.target.value })} /></Field>
          <Field label="開始時刻（日本時間）"><Input required type="time" value={request.dayStart} onChange={(event) => onChange({ ...request, dayStart: event.target.value })} /></Field>
          <Field label="終了時刻（日本時間）"><Input required type="time" value={request.dayEnd} onChange={(event) => onChange({ ...request, dayEnd: event.target.value })} /></Field>
          <Field label="所要時間">
            <NativeSelect value={request.durationMinutes} onChange={(event) => onChange({ ...request, durationMinutes: Number(event.target.value) as 30 | 60 })}>
              <option value="30">30 分</option>
              <option value="60">60 分</option>
            </NativeSelect>
          </Field>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Gmail と同じアカウントのメインカレンダーを gog CLI で確認します。候補は平日のみ。祝日・移動時間・他のカレンダー・相手の予定は未確認です。予定の件名はモデルに渡さず、空き時間だけを使います。予定の予約・送信はしません。</p>
      </>
    )}
  </div>
);
