# Life Console の開発ガイド

本人用のダッシュボード。Web/API は Cloudflare、外部 CLI と coding agent の実行は Mac の runner が担当する。現行機能は [README](README.md)、記録済みの要件は [要件定義](docs/requirements.md) で確認する。

## 作業の原則

- 日本語で回答する。日本語と半角英数字の間には半角スペースを入れる。コード、コマンド、URL、パス、識別子、原文引用の内部は変えない。絵文字や過剰な賛辞は使わない。
- 操作前に対象、環境、アカウント、指定経路、禁止事項、終了地点を会話から確認する。既に許可された修正は実装・検証まで進める。調査や文案作成を送信・マージ・デプロイへ広げない。
- 要件は発言、現在の挙動はコード、記録済みの仕様はドキュメントで確認する。未回答をコードや沈黙で補完しない。矛盾があれば区別して報告する。
- 名前・値・挙動は実コードで確認し、編集前に既存コメントを読む。大きな設計変更は原因の仮説と影響範囲を先に共有する。
- 内部コードとフレームワークの保証を信頼し、検証はユーザー入力・外部 API などの境界に置く。暗黙の fallback、エラーの握りつぶし、起こり得ないケースへの防御を追加しない。
- 将来用の抽象化・設定・未使用コードは追加しない。コメントは理由を説明し、名前は対象と意図を区別できる具体性にする。同じ修正が 3 回続いたら原因とアプローチを見直す。
- 個人データ、会話本文、token、Cookie、transcript をリポジトリ・検証資料へ転記しない。送信、実ジョブ実行、本番変更は依頼で許可された範囲だけで行う。

## 作業に応じて読む

下表の該当文書を実装・レビュー前に読む。詳細ルールの正本は `docs/agent-rules/`。Codex はこの表から対象のルールを読み、Claude Code は `.claude/rules/` のリンク経由でも読む。ルールの `paths` は Claude Code 用の適用条件であり、Codex が自動評価するとはみなさない。

| 対象 | 参照先 |
| --- | --- |
| API、runner、共通型、環境変数 | [サーバー境界](docs/agent-rules/server-boundaries.md)、[core](packages/core/README.md)、[env](packages/env/README.md) |
| DB schema、migration、永続化 | [DB](docs/agent-rules/database.md)、[DB パッケージ](packages/db/README.md) |
| Web、URL、共通 UI、Storybook | [UI](docs/agent-rules/web-ui.md)、[Web 開発](apps/web/README.md) |
| 外部 CLI、会話取り込み、返信生成、agent job | [外部実行](docs/agent-rules/runner-integrations.md)、README の該当機能 |
| lint の変更・違反 | [ESLint](packages/eslint-config/README.md) と該当ルールの README |
| Android などの native client | [クライアント](clients/README.md)、[Android](clients/android/README.md) |
| AI 設定、rule、skill | [ハーネスの管理](docs/agent-configuration.md) |
| 本番配置、認証、運用設定 | [運用上の注意](docs/operations.md)、[デプロイ workflow](.github/workflows/deploy.yml) |

## 実装から検証まで

Node.js 24 以上、pnpm は `package.json` の `packageManager` を使う。初回は `pnpm install --frozen-lockfile`。ローカル API と Web は `pnpm local:setup`、`pnpm dev` で準備する。runner は外部 CLI やジョブを実行するため、画面確認だけなら起動しない。

- 実装中は変更箇所のテストと lint・型検査を選んで実行する。バグ修正では再現条件を確認し、継続して守る必要がある挙動に回帰テストを追加する。
- コード・実行設定の変更を仕上げるときは `pnpm check` を実行する。AI 指示・ルール・スキル本文のみなら `pnpm harness:check` と参照先・内容の確認でよい。CI は `develop` 向け PR で全チェックを実行する。
- `pnpm check` はハーネスの整合性、lint、型検査、Vitest、Web/API/runner の build、Storybook の build とブラウザテストを実行する。Chromium の初回準備は `pnpm --filter @life-console/web exec playwright install chromium`。
- UI や実行経路を変更したら [verify-implementation](.agents/skills/verify-implementation/SKILL.md) を使い、要求された利用経路と最終結果を確認する。Storybook やスタブだけで実データ確認済みとはしない。
- 完了前は [self-review](.agents/skills/self-review/SKILL.md) の該当観点で差分を点検する。確認済み、未確認、失敗したチェックを分けて報告する。

共通スキルは `.agents/skills/*/SKILL.md`。依頼が `description` に合う場合に読む。レビュー指摘の仕組み化は `learn-from-review`、Life Console からの明示的なタスク昇格は既存の `github-task-promotion` を使う。

## Code Review Rules

- 外部送信・ジョブの再実行・本番操作が、利用者の指定と許可範囲を越えていないか確認する。
- Result の失敗を空配列・ゼロ・成功で隠す変更、lease や重複防止を迂回する保存、手動編集した下書きを上書きする変更を指摘する。
- 実際の入力と経路に基づく不具合を、再現条件・影響・根拠のコード位置とともに示す。好みの抽象化や未確認の要件を必須修正にしない。
