# 保存データの契約

対象は Life Console の体重・食事・保存済み栄養推定・食事写真。運動・タスク・会話・家計・runner 設定は取得しない。

schema の正本は、この skill と同じ Life Console リポジトリの `packages/db/src/schema.ts`。取得条件は API repository と照合する。回帰テストは同じリポジトリの全 migration を適用した DB に対して実行するため、保存構造の変更を skill の SQL と合わせて検証できる。

- [schema.ts](https://github.com/kokoichi206/life-console/blob/develop/packages/db/src/schema.ts)
- [体重と食事の repository](https://github.com/kokoichi206/life-console/blob/develop/apps/api/src/repositories/d1-life-console-repository.ts)
- [栄養推定の repository](https://github.com/kokoichi206/life-console/blob/develop/apps/api/src/repositories/nutrition-repository.ts)
- [カロリーと PFC の集計](https://github.com/kokoichi206/life-console/blob/develop/apps/web/src/pages/health/nutrition-summary.ts)

利用先の skill はインストールした時点のコピーで、ソースの変更が自動で配信されるわけではない。対象 DB の migration 適用状況と skill の導入版を合わせ、保存構造を変えた場合は利用先でも更新する。

## 期間

食事・体重とも `occurred_at` で絞る。開始日の日本時間 00:00 以上、終了日の翌日 00:00 未満とし、`julianday` で UTC や offset 付き時刻を比較する。`recorded_at` は登録日時で、計測・食事の日時ではない。

## テーブルと返却値

| テーブル | 取得内容と条件 |
| --- | --- |
| `weights` | `deleted_at IS NULL`。`weight_grams / 1000.0` を `weightKg` として返す。体脂肪率の欠損は `null` |
| `meals` | `deleted_at IS NULL`。メモ、タグ、日時、手入力カロリー、代表・追加写真 ID |
| `nutrition_estimates` | `meal_id = meals.id`。`analyzed_at DESC, rowid DESC` で最新の 1 件を選ぶ |
| `meal_photos` | 食事の `photo_id` と `additional_photo_ids` から写真 ID・object key・MIME type を取得 |

`meals[].estimate` は保存済みの最新推定。モデル、解析日時、kcal と PFC を含む。推定がなければ `null`。

`meals[].caloriesKcal` は手入力を優先し、未入力なら推定カロリーを採る。両方なければ `null`。手入力の `0` は有効値で、推定に置き換えない。`caloriesSource` は `manual`、`estimate`、または `null`。

手入力カロリーで推定の PFC を補正することはしない。PFC は推定由来の値として扱う。食事の登録漏れは、このデータだけでは判定できない。

## 複数写真

`photos` は代表写真を position 0、追加写真を配列順の position 1 以降で保持する。`mealId` と `photoId` で食事に対応する。

`--photos` がなければ `localPath` は `null`。付けた場合は R2 の `GetObject` で画像を取得し、`localPath` に保存先の絶対パスを返す。写真のファイル名には D1 の文字列を使わず、実行内の通し番号と MIME type に対応した拡張子を使う。写真 ID とパスの対応は JSON に残る。

スクリプトは R2 の保存キーを使い、共有画面や公開 bucket を経由しない。写真を取得してから、実行先の画像読込ツールで実際に開いて内容を確認する。
