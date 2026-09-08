# Claude Code / Codex 共通ハーネス

開発用の指示、必要なときに読むルール、繰り返す作業手順、機械的な検証を共有する。アプリが返信下書きを生成する際のプロンプトとは別の設定。

## 正本と読み込み経路

| 内容 | 編集する正本 | Codex | Claude Code |
| --- | --- | --- | --- |
| 常時指示・参照先 | `AGENTS.md` | 自動読み込み | `CLAUDE.md -> AGENTS.md` |
| 対象別ルール | `docs/agent-rules/` | AGENTS の表から該当文書を読む | `.claude/rules -> ../docs/agent-rules`、`paths` で適用 |
| 作業手順 | `.agents/skills/` | 標準のスキル探索 | `.claude/skills -> ../.agents/skills` |
| 機械的な検証 | `package.json`、`packages/eslint-config/` | `pnpm check` | `pnpm check` |
| Claude 固有の動作 | `.claude/settings.json`、`.claude/hooks/` | 対象外 | 日本語・実行時間・編集後 lint |

相対 symlink を Git 管理する。個々のスキル・ルールへのリンクを増やす方式と違い、正本にファイルを追加すれば両方から参照できる。リンク先を複製する同期スクリプトは不要。

Codex の [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) と [スキル探索](https://learn.chatgpt.com/docs/build-skills)、Claude Code の [メモリとルール](https://code.claude.com/docs/en/memory) と [スキル](https://code.claude.com/docs/en/skills) の仕様に沿う。`docs/agent-rules/` の自動探索や `paths` の自動評価を Codex に期待しない。

## 使い方

リポジトリ内で通常どおり `codex` または `claude` を起動する。新しいルート指示を確実に読み込むにはセッションを開始し直す。

| 作業 | Codex | Claude Code |
| --- | --- | --- |
| 実装の動作確認 | `$verify-implementation` | `/verify-implementation` |
| 差分の自己点検 | `$self-review` | `/self-review` |
| レビュー指摘の仕組み化 | `$learn-from-review` | `/learn-from-review` |
| 明示された Life Console タスクの昇格 | `$github-task-promotion` | `/github-task-promotion` |

自然文でも description が対象に合えば利用できる。GitHub 昇格の入力条件・報告先は既存スキルのまま。スキルを利用できること自体は、外部投稿や本番操作の許可にはならない。

モデル、承認モード、sandbox、個人アカウント、MCP、プラグインは各クライアントの利用者設定で管理する。共通化のために個人の設定を上書きしない。Claude 専用の `context: fork`、動的 shell 展開、特定 MCP や未導入スキルへの依存は共通スキルに入れない。

## Claude 固有の settings と hook

[settings.json](../.claude/settings.json) はプロジェクトで共有する。日本語、`@` ファイル候補での gitignore の尊重、Bash の既定 timeout 5 分・上限 20 分を設定する。利用者だけの上書きは Git 管理外の `.claude/settings.local.json` に置く。

`PostToolUse` の `Edit|Write` に [lint-after-edit.mjs](../.claude/hooks/lint-after-edit.mjs) を登録する。編集した 1 ファイルへ既存の ESLint 設定を適用し、error / warning があれば exit code 2 と stderr で Claude に返す。自動修正はせず、成功時は無出力。対象外の拡張子・生成物などは ESLint の ignore 判定に従い、リポジトリ外のファイルも除く。

依存関係は通常の `pnpm install --frozen-lockfile` で準備する。依存不足や設定エラーは hook の実行エラーとして表示される。検証成功に置き換えたり、自動インストールしたりしない。Bash 経由の書き換えや削除、ファイル間の整合性はこの hook だけでは確認できないため、完了前の `pnpm check` は引き続き必要。

Claude Code をリポジトリルートから起動し、`/hooks` で登録を確認する。hooks は利用者のグローバル設定とも併用される。Codex ではこの hook は動かず、同じ ESLint を `pnpm lint` / `pnpm check` から実行する。仕様は [Claude Code settings](https://code.claude.com/docs/en/settings)、[hooks](https://code.claude.com/docs/en/hooks)、[環境変数](https://code.claude.com/docs/en/env-vars) を参照。

## 追加・更新・検証

1. 共通の前提は `AGENTS.md`、条件付きの規約は `docs/agent-rules/`、作業手順は `.agents/skills/<name>/SKILL.md` に書く。スキルには `name` と `description` の YAML frontmatter を付ける。
2. ルールを増やしたら `AGENTS.md` の参照表にも対象とリンクを追加する。`paths` は YAML の block style で書く。各パッケージの README や ESLint が正本の内容はリンクで参照する。
3. `pnpm harness:check` を実行する。共通リンクの種類・リンク先、スキルの必須メタデータ、指示文書の Markdown 相対リンクを検査する。指示内容の正しさや、クライアントでの読み込み成功を証明するコマンドではない。
4. 読み込みを変更した場合は、新規セッションで指示元・利用可能スキルを確認する。Claude Code では `/memory` と `/skills`、Codex ではスキル選択と読み込んだ指示元を確認する。利用者のグローバル設定が探索を制限する場合も、この静的チェックの対象外。

`pnpm check` と既存 CI にハーネス検証を含める。文言を正規表現で禁止する Stop hook や、各編集のたびに全テストを実行する hook は追加しない。実装品質は既存 ESLint・型・テストと、要件に沿った動作確認で判断する。

symlink が通常ファイルに展開される checkout は `pnpm harness:check` で失敗する。Windows で使う場合は WSL または symlink を保持できる Git / OS 設定で checkout する。コピーへの暗黙の切り替えは行わない。

## 参考元と採用判断

2026-09-08 にローカルの以下のプロジェクトを確認した。

- `Wareware-PJ/japagate-systems-ops`: `AGENTS.md`、共通ルールとスキルの正本、Claude 側の相対リンク、実装検証・セルフレビュー・レビュー学習を採用。Life Console の D1 / Hono / Vite 構成と実在するコマンドに合わせて書き直した。
- `Wareware-PJ/ads-report-pro`: Claude 専用 commands / rules と `.agents` / `.codex` の併存を確認。今回は探索先と正本を増やさず、`.agents/skills` にまとめる。
- `kokoichi206/orgctl`、`kokoichi206/slack-cli`: 短い入口から実装・CLI リファレンスへ案内し、実行境界を明記する構成を採用。
- `kokoichi206/portfolio`: 編集後に対象ファイルを lint し、違反を Claude へ返す hook を採用。Life Console の既存 ESLint を使う構成にした。
- `Wareware-PJ/kicho-pro`、`Wareware-PJ/aip-skilld-seal`: 終了時の検証を確認。Life Console では対象ファイルの lint が実測約 1〜2 秒だったため、編集直後に返す方式を採用した。終了時の追加検証は既存の `pnpm check` と CI で扱う。

Supabase / Next.js 固有ルール、未導入のツール・プラグイン、広いコマンド許可、モデル固定は移植していない。必要な規約は、実コードや繰り返した不具合を根拠に追加する。
