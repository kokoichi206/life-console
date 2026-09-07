# Life Console 設計レビュー要約（Claude Code / Fable）

日付: 2026-09-01

対象: `docs/requirements.md`

## 結論

- 最初は Android native ではなく、レスポンシブ Web で食事、体重、支出、メモの記録を作る。
- manifest、shortcut、Web Push、Share Target、オフライン outbox は必要になった段階で追加する。
- Web ダッシュボードは、会話の分類、タスク、agent、runner、資産と健康の分析に必要。
- Android native は、PWA の記録漏れ、オフライン欠損、ウィジェット需要、Health Connect への source of truth 移行などを実測してから追加する。
- D1、Cloudflare Cron、launchd runner、Orca adapter の分割は妥当。ただし実装前に job の契約を補う必要がある。

## PWA と native

現行の体重 source of truth は Simple アプリから Android UI 操作で生成する CSV であり、Health Connect には書き出されない。ランニングも現状は Strava の確認であり、Health Connect は使っていない。このため、Health Connect は現時点の native 採用理由にならない。

Web Share Target はインストール済み PWA で画像を受け取れるが、Baseline 外なので Pixel と Google フォトでの実機確認が必要。PWA から native へ移っても、バージョン付き JSON API、DB、R2、runner protocol は残せる。捨てるのは Web の記録画面、Service Worker、IndexedDB outbox、manifest などクライアントの殻に限る。

## 定期実行の必須事項

- schedule に coalescing、deadline、`expired` を持たせ、Mac 停止中の job を無制限に溜めない。
- lease だけでなく fencing token を使い、スリープ復帰後の古い実行結果を拒否する。
- runner heartbeat と job heartbeat を分ける。
- `waiting_for_user` 中も heartbeat を継続する。
- job 生成、外部データ取込、claim の三層で冪等性を持つ。
- connector ごとに watermark とバックフィル上限を持つ。
- cancel は heartbeat 応答で伝え、session と worktree は削除しない。
- サーバ時刻を lease の権威とし、schedule の JST を UTC の `next_run_at` に変換する。
- agent の明示的完了報告を Orca の通知だけに依存させない。
- runner と Orca の health を分け、Orca 未起動を専用エラーとして表示する。
- 体重同期は USB 接続、画面点灯、ロック解除が必要なので、定期失敗ではなく手動または日和見実行にする。

## Cloudflare と全体設計

Workers Free の CPU 上限は fetch と Cron の双方で 10 ms。TanStack Start の SSR を前提にせず、初期構成は static assets と薄い `/api/v1` JSON API にする。Cron では schedule ごとの JavaScript loop を避け、`next_run_at` を使った少数の SQL に寄せる。

写真はクライアント側で縮小と EXIF 除去を行い、署名付き URL で R2 へ直接送る。食事、体重、支出には `occurred_at` と `recorded_at` を分ける。GitHub への昇格は一方向とし、双方向同期を作らない。

connector の資格情報は Cloudflare に置かない。人間は Cloudflare Access、runner は Service Auth を使う。エラーは redaction し、Worker log に本文を出さない。D1 Free の Time Travel は 7 日なので、D1 と R2 は Mac 側から非公開領域へ別途バックアップする。

## 実測するもの

- Pixel 上の写真登録時間、操作数、Share Target の安定性
- オフライン outbox の欠損
- Cloudflare Access の再ログイン頻度
- Workers CPU、D1 の行 read/write、R2 使用量
- Mac の稼働率、スリープ頻度、Orca CLI の可用性
- launchd からローカル secret store を利用できるか

## 実行上の注記

レビュー本文は完成したが、worker 端末から `orca orchestration send` が Orca runtime に接続できず、`worker_done` の配送に失敗した。コーディネータ側で provider transcript と一時成果物を確認し、完了として回復処理した。この事象を、runner と Orca の health を分ける要件へ反映した。
