---
name: verify-implementation
description: Life Console の変更を、ローカルアプリ・Storybook・API・runner の該当経路で動作確認する。UI 確認、実装検証、修正後の再現確認で使う。
---

# 実装の動作確認

対象、環境、アカウント、依頼された利用経路と期待結果を確認する。既に許可された検証は進める。実データが必要な依頼を架空応答だけで完了扱いにしない。

## 検証経路

ルートの [package.json](../../../package.json) と対象パッケージの scripts を確認して実行する。

| 変更対象 | 主な確認 |
| --- | --- |
| UI の状態・部品 | `pnpm storybook`、対象 story の操作・テーマ・viewport、`pnpm storybook:test` |
| 画面から保存・再表示 | `pnpm local:setup` と `pnpm dev`。Web は 5173、API は 8788。既存プロセスと接続先を確認してから起動する |
| API / usecase / repository | 対象 Vitest、HTTP 入出力、保存後の読み取り。D1 固有の変更はローカル D1 でも検証する |
| migration | `packages/db/README.md` の storage テストとローカル適用手順 |
| runner | 対象 repository / usecase テスト、`pnpm --filter @life-console/runner build`。実 CLI・job 実行は依頼範囲で別途確認する |
| Android | `clients/android/README.md` のビルド・実機手順。`pnpm check` だけでは Android は検証されない |
| AI 指示・スキル | `pnpm harness:check`、リンク先と参照文書の内容。利用するクライアントでの読み込みは別に確認する |

ブラウザ・実機操作はユーザーが指定した経路を優先する。特定の MCP や個人用プラグインの存在を前提にしない。UI は表示を見るだけでなく、対象の入力・保存・閉じる・再表示・戻る操作まで確認する。

スクリーンショットが必要なら `test-results/` に保存し、実際に画像を見る。個人情報を含むものはリポジトリや外部へ添付しない。起動したプロセスは自分が開始したものだけを管理する。

コード・実行設定の変更は仕上げに `pnpm check`。失敗したコマンドと原因を調べ、修正後は必要なチェックを再実行する。環境不足による未実行、スタブでの成功、実操作での成功を分けて報告する。
