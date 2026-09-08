import type { Meal, WeightPoint } from "@life-console/contracts";

import { FormError, Panel } from "../../../components/DesignSystem";
import { Button } from "../../../components/ui/Button";
import { exerciseWeeks, isRunning, runningPace, sportLabel } from "../exercise-weeks";
import type { useStravaActivities } from "../use-strava-activities";

export const StravaActivities = ({ from, to, weights, meals, onSelectWeek, strava }: {
  readonly strava: ReturnType<typeof useStravaActivities>;
  readonly from: string;
  readonly to: string;
  readonly weights: ReadonlyArray<WeightPoint>;
  readonly meals: ReadonlyArray<Meal> | undefined;
  readonly onSelectWeek: (period: { from: string; to: string }) => void;
}) => {
  const { status, authorize, disconnect, connected, activities, complete, records } = strava;
  const weeks = complete && meals !== undefined ? exerciseWeeks(from, to, records, weights, meals) : [];
  return (
    <Panel className="mb-6 gap-4 px-5" aria-label="Strava の運動記録">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">この期間の運動</h2>
          <p className="mt-1 text-xs text-muted-foreground">体重と同じ期間・日本時間・月曜始まり</p>
        </div>
        {connected && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={activities.isFetching || disconnect.isPending} onClick={() => { void activities.refetch(); }}>運動を更新</Button>
            <Button size="sm" variant="ghost" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>接続を解除</Button>
          </div>
        )}
      </header>
      {status.isPending && <p role="status">Strava の接続を確認しています。</p>}
      {status.error !== null && <FormError>{status.error.message}</FormError>}
      {status.data?.configured === false && <p className="text-sm text-muted-foreground">Strava の接続設定がまだありません。設定後、ここから接続できます。</p>}
      {status.data?.configured === true && !connected && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">非公開の運動を含め、選んだ期間の記録を読み取ります。運動はこの画面で表示し、接続情報は暗号化して保存します。接続はいつでも解除できます。</p>
          <Button disabled={authorize.isPending} onClick={() => authorize.mutate()}>Connect with Strava</Button>
        </div>
      )}
      {authorize.error !== null && <FormError>{authorize.error.message}</FormError>}
      {disconnect.error !== null && <FormError>{disconnect.error.message}</FormError>}
      {connected && activities.isError && (
        <div className="space-y-2">
          <FormError>
            {activities.error.message}
            {" "}
            期間全体を取得できていないため、合計は表示していません。
          </FormError>
          <Button size="sm" variant="outline" disabled={authorize.isPending} onClick={() => authorize.mutate()}>Strava に再接続</Button>
        </div>
      )}
      {disconnect.isPending && <p role="status">Strava の接続を解除しています。</p>}
      {connected && !disconnect.isPending && !activities.isError && !complete && <p role="status">期間内の運動を取得しています。全件の取得後に週の合計を表示します。</p>}
      {complete && meals === undefined && <p role="status">同じ期間の食事記録を取得しています。</p>}
      {weeks.length > 0 && (
        <>
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">週ごとの数字を見る</summary>
            <p className="my-3 text-xs text-muted-foreground">週を選ぶと、その週の体重・運動・食事に絞れます。平均体重は期間内の実測値から算出しています。</p>
            <ul className="grid max-h-[36rem] gap-3 overflow-y-auto sm:hidden" aria-label="週ごとの運動・体重・食事">
              {weeks.map((week) => (
                <li key={week.from} className="rounded-xl border p-3">
                  <Button variant="ghost" size="sm" className="mb-3 h-auto px-0 text-xs" onClick={() => onSelectWeek({ from: week.from, to: week.to })}>{`${week.visibleFrom} 〜 ${week.visibleTo}${week.partial ? "（一部）" : ""}`}</Button>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-4 tabular-nums">
                    {[
                      ["ランの距離", `${(week.distanceMeters / 1000).toFixed(1)} km`], ["ランの回数", `${week.runCount} 回`],
                      ["移動時間", `${Math.round(week.movingSeconds / 60)} 分`], ["他の運動", `${week.otherCount} 回`],
                      ["平均体重", week.averageWeight === null ? "記録なし" : `${week.averageWeight.toFixed(1)} kg`], ["食事記録", `${week.mealCount} 件`],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 text-base font-semibold">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden max-h-96 overflow-auto rounded-xl border sm:block">
              <table className="w-full text-right text-sm whitespace-nowrap tabular-nums" aria-label="週ごとの運動・体重・食事">
                <thead className="sticky top-0 bg-card"><tr>{["週", "ランの距離", "回数", "移動時間", "他の運動", "平均体重", "食事記録"].map((label) => <th key={label} className="border-b px-3 py-3 font-medium">{label}</th>)}</tr></thead>
                <tbody>
                  {weeks.map((week) => (
                    <tr key={week.from}>
                      <td className="border-b px-2 py-2"><Button variant="ghost" size="sm" onClick={() => onSelectWeek({ from: week.from, to: week.to })}>{`${week.visibleFrom} 〜 ${week.visibleTo}${week.partial ? "（一部）" : ""}`}</Button></td>
                      <td className="border-b px-3 py-2">{`${(week.distanceMeters / 1000).toFixed(1)} km`}</td>
                      <td className="border-b px-3 py-2">{`${week.runCount} 回`}</td>
                      <td className="border-b px-3 py-2">{`${Math.round(week.movingSeconds / 60)} 分`}</td>
                      <td className="border-b px-3 py-2">{`${week.otherCount} 回`}</td>
                      <td className="border-b px-3 py-2">{week.averageWeight === null ? "記録なし" : `${week.averageWeight.toFixed(1)} kg`}</td>
                      <td className="border-b px-3 py-2">{`${week.mealCount} 件`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          {records.length === 0
            ? <p className="text-sm text-muted-foreground">この期間の運動記録はありません。</p>
            : (
                <details key={`${from}-${to}`} open={Date.parse(to) - Date.parse(from) <= 6 * 86_400_000} className="rounded-xl border p-3">
                  <summary className="cursor-pointer text-sm font-medium">{`期間内の運動 ${records.length} 件`}</summary>
                  <ul className="mt-3 max-h-96 divide-y overflow-y-auto">
                    {records.map((activity) => (
                      <li key={activity.id} className="space-y-1 py-3 text-sm">
                        <p className="font-medium break-words">{activity.name}</p>
                        <p className="text-xs text-muted-foreground">{`${new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(activity.occurredAt))} ・ ${sportLabel(activity.sportType)}`}</p>
                        <p>{`${activity.sportType === "WeightTraining" ? "" : `${(activity.distanceMeters / 1000).toFixed(2)} km ・ `}${Math.round(activity.movingSeconds / 60)} 分${isRunning(activity.sportType) ? ` ・ ${runningPace(activity.distanceMeters, activity.movingSeconds)}` : ""}${activity.averageHeartrate === null ? "" : ` ・ 平均心拍 ${Math.round(activity.averageHeartrate)} bpm`}`}</p>
                        <a className="text-sm underline underline-offset-4" href={`https://www.strava.com/activities/${activity.id}`} target="_blank" rel="noreferrer">View on Strava</a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
        </>
      )}
      <p className="text-xs text-muted-foreground">Powered by Strava</p>
    </Panel>
  );
};
