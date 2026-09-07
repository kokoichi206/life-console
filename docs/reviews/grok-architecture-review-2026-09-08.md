# 共通パッケージ・環境変数・Storybook のレビュー

日付: 2026-09-08

対象: 共通パッケージの分離、Result とカスタム ESLint、環境変数の Zod 検証、ページ単位の配置、Storybook。初期実装のコミット `ee46496553f39664236832e292da1abb14fe377a` 以後の差分を対象とした。

秘密情報・個人データ・依存パッケージの実体を除いたソースのコピーを Grok CLI に渡し、読み取り専用でレビューを依頼した。修正後は変更箇所と直接の関連箇所を再レビューした。

## 結果

初回は Grok から P2 の指摘が 2 件あった。両方を修正し、実装側で発見した runner の起動不良も合わせて再確認した。再レビューでは、確認できた修正必須は残っておらず、PR 作成可能と判定された。

## 指摘と対応

| 発見者 | 指摘 | 対応 |
|---|---|---|
| Grok / P2 | LaunchAgent の例が必須の APP_ENV を渡さず起動できない | plist に `APP_ENV=local` を追加。本番用の設定との差を README に明記し、回帰テストと `plutil` で検証 |
| Grok / P2 | contracts が core の Result を相対パスで再公開し、パッケージの責務が分離できていない | 再 export を削除。contracts の公開口に Result ヘルパーが残らないことをテスト |
| 実装側の実行確認 | runner のビルドは成功するが、Node.js が core 内の import を解決できない | tsup の `noExternal` で TS ソースを公開する共通パッケージをバンドル。ビルド済み runner の起動テストを追加 |

追加したテストでは、修正前の失敗と修正後の成功を確認した。

## 検証

- `pnpm check`: ESLint、全ワークスペースの型チェック、通常テスト 101 件、Web/API/runner のビルド、runner の起動テスト 1 件、Storybook のビルドとブラウザテスト 29 件が成功。
- runner の起動テストは、ビルド済みコードを Node.js で実行し、テスト専用 API への登録・heartbeat・空のジョブ取得まで確認。実 CLI・実 API・実ジョブは使用しない。
- `pnpm install --frozen-lockfile --ignore-scripts`: 成功。
- `pnpm audit --prod --audit-level high`: 既知の脆弱性なし。
- `plutil -lint apps/runner/launchd/com.life-console.runner.plist.example`: 成功。
- `git diff --check`: 成功。
- DB の schema / migration / seed 計 9 ファイルは、移動前とバイト一致。
- Storybook のライト・ダーク表示、下書き取得失敗時にも会話を残す表示をブラウザで確認。

## 確認範囲

Grok は静的レビューを担当し、テストと実行確認は実装側で行った。Grok の実行環境では `.env.*` の読み取りが制限されたため、Web の公開設定値は実装側で確認し、再レビュー時に伝えた。

このリポジトリに GitHub Actions の設定はない。上記はローカルでの検証結果であり、GitHub 上の CI 成功を示すものではない。Storybook のビルドにはチャンクサイズの警告、テスト設定には将来の Vite 設定ローダーに関する警告が残るが、現在のビルドとテストは成功している。

外部サービスへの返信送信、実際の agent ジョブ、本番デプロイは実施していない。DB のスキーマ・実データも変更していない。
