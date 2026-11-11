# Life Console

仕事の連絡とタスク、体重と食事、収支と資産をまとめた、自分用の Web アプリ。

## 主な機能

- タスクと買い物の管理
- Slack・Chatwork・Gmail・Talknote の連絡整理と返信案の作成
- Codex / Claude Code への作業依頼と GitHub へのタスク昇格
- 体重・食事・運動の記録と振り返り
- 収支・資産の管理

## 開発環境

Node.js は [.node-version](.node-version)、pnpm は [package.json](package.json) の `packageManager` に指定したバージョンを使う。CI とデプロイも同じ Node.js 指定を参照する。初回は `pnpm install --frozen-lockfile`、検証は `pnpm check`。健康読み取り skill のテストには Python 3.11 以降と uv を使う。

Mac の常駐 runner の更新方法は [運用上の注意](docs/operations.md#nodejs-の更新)、2026 年 10 月のセキュリティ更新の影響は [調査記録](docs/reviews/node-security-2026-10-22.md)を参照。

健康記録を他のリポジトリの AI agent から読む場合は、[読み取り skill の導入と更新](docs/agent-configuration.md#健康記録を読む-skill-の配布)を参照。

依存パッケージの install script の実行可否は [pnpm-workspace.yaml](pnpm-workspace.yaml) の `allowBuilds` に指定する。esbuild・workerd は実行ファイルの準備に必要なため許可する。unrs-resolver は対象環境の optional dependency に含まれるバイナリを使い、postinstall の追加取得は実行しない。MSW の Service Worker は Git で管理するため、MSW の更新時に `pnpm --filter @life-console/web exec msw init .storybook/public --save` で生成して差分を確認する。

## ライセンス

[MIT License](LICENSE)
