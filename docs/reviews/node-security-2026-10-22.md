# 2026 年 10 月の Node.js セキュリティ更新

2026-10-22 に、本人から [Node.js の告知](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases#security-releases-available)の影響調査と更新を依頼された。調査基点は `develop` の `49f7687`。個人データ、認証情報、会話本文は記録しない。

## 結論と更新前の状態

24 系の修正版は [24.22.1](https://nodejs.org/en/blog/release/v24.22.1/)。このプロジェクトでは Mac の常駐 runner と、CI・ローカルの開発ツールが Node.js を使う。Cloudflare 上の Web/API は Workers runtime で動くため、リポジトリの Node.js 指定を上げる操作とは管理対象が異なる。[Workers の実行方式](https://developers.cloudflare.com/workers/reference/how-workers-works/)、[Node.js API の互換性](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)。

| 対象 | 確認できた更新前の状態 | 判断 |
| --- | --- | --- |
| 対話シェル | Node.js 24.22.1、内蔵 Undici 7.30.1 | 修正済み |
| 本番 Mac runner | LaunchAgent の PID と実体パスは Node.js 24.16.0 | 更新が必要 |
| GitHub Actions | 6 箇所とも `node-version: "24"`。PR #118 の Quality checks はキャッシュから 24.21.0 を選択 | 修正版を明示する必要がある |
| インストール済みの Undici | 7.29.0。Miniflare、shadcn、@dotenvx/dotenvx 経由 | Node.js 内蔵版とは別に更新が必要 |
| Cloudflare Workers | Web/API の配信先。Node.js プロセスではない | Node.js のバージョン更新とは別管理 |

CI の実行ログは [PR #118 の Quality checks](https://github.com/kokoichi206/life-console/actions/runs/39702002428/job/119573193393)で確認した。`setup-node` は既定でキャッシュを優先するため、メジャーだけの指定ではセキュリティ更新の適用を保証しない。[setup-node の仕様](https://github.com/actions/setup-node/blob/v6/docs/advanced-usage.md#check-latest)。

## コード上の到達条件

脆弱性の対象バージョンであることと、このアプリで攻撃が成立することは区別する。悪用の再現や、外部サービスに対する攻撃テストは行っていない。

| 告知の対象 | プロジェクトで確認した利用経路 |
| --- | --- |
| DNS の NUL 入力（CVE-2026-105482） | runner に `dns.resolve()` の直接呼び出しはない。Node.js 本体と c-ares を更新する |
| TLS のホスト名検証（CVE-2026-105483 / CVE-2026-106069 / CVE-2026-106072） | runner は API 接続と生成する報告コマンドで HTTPS の `fetch()` を使う。接続先は設定した API のホストだが、更新対象の TLS 実装を利用する |
| Brotli の展開処理（CVE-2026-111497） | Brotli の直接呼び出しはないが、Undici の `fetch()` には `Content-Encoding: br` の展開経路がある。外部 HTTP 応答を扱う runner と開発ツールを更新対象にする |
| HTTP keep-alive（CVE-2026-105481） | runner のアプリコードに `http.Agent` の直接使用はない。依存ツールを含む Node.js 実行環境を更新する |
| 乱数キャッシュ（CVE-2026-106074） | `randomUUID()` は使うが、runner は通常の ESM 配布物。起動 snapshot・SEA の生成や使用は確認できない |
| Permission Model（CVE-2026-106073） | runner の起動指定に Permission Model のフラグはない。権限境界として利用していない |
| Node.js 26 系だけの 2 件（CVE-2026-106070 / CVE-2026-106071） | 今回確認した 24 系の実行環境は対象外 |

主な確認元は `apps/runner/src/repositories/api-repository.ts`、`capability-repository.ts`、`weight-history-repository.ts`、`apps/runner/tsup.config.ts`、LaunchAgent の起動スクリプト。SQLite は runner の監視キューで使うが、今回の告知の SQLite 更新は 22 系が対象。24 系では CA 証明書、OpenSSL、c-ares、Undici の更新も取り込む。

Undici 7.30.1 自体にも TLS・HTTP 応答処理などの修正が含まれる。lockfile の 7.29.0 を残すと Node.js 本体だけの更新では解消しない。[Undici 7.30.1 のリリース](https://github.com/nodejs/undici/releases/tag/v7.30.1)。

## リポジトリの変更

- `.node-version` に 24.22.1 を指定し、CI・Terraform plan・デプロイの 6 箇所から参照する。指定ファイルだけの変更もデプロイの変更検出に含める。
- root と runner の `engines.node` を `^24.22.1 || ^26.12.1` にする。従来の 24 以上という範囲から、既知の修正前バージョンと 25 系を外す。標準環境は 24 系のままで、26 系への移行は行わない。
- `pnpm-workspace.yaml` で修正前の Undici 7 系に限定した override を追加する。Miniflare が 7.29.0 に固定しているため、上位の開発ツール全体を更新せずに修正版を適用する。lockfile の全 3 経路は 7.30.1 に統一する。
- 開発手順と常駐 runner の更新手順を更新する。

## 検証と適用

`pnpm install --frozen-lockfile` が成功し、`pnpm why undici -r` で全 3 経路が 7.30.1 になったことを確認した。Node.js 内蔵版も `process.versions.undici` が 7.30.1。`actionlint` が成功し、全 6 箇所が `.node-version` を参照すること、宣言した engine の範囲に修正前の 24 / 26 系と 25 系が含まれないことを確認した。

実際の常駐 runner の配布物を Node.js 24.22.1 で起動し、隔離したローカル HTTP API への登録・監視登録・観測送信・空のジョブ取得を確認した。環境変数はテスト専用とし、本人の API・外部 CLI・実ジョブを呼ばない。workspace の runner をビルドする確認とは分けて実施した。

`pnpm check` は成功。lint・型検査・通常テスト 516 件・Web/API/runner と Storybook の build・ブラウザテスト 262 件が通過した。

2026-10-22 10:03 JST に、本番の待機・実行中・本人の回答待ちのジョブが 0 件であることを確認して常駐 runner を更新した。起動スクリプトには、本体の実行パスと子プロセス用の `PATH` の 2 箇所に 24.16.0 が固定されていたため、両方を 24.22.1 に変更した。現行の runner 配布物と設定・資格情報は維持した。変更前のスクリプトは非公開のローカル領域に保存している。

再起動後の PID の実体パスと、そのプロセスの `PATH` で解決する子プロセス用の `node --version` が 24.22.1 で一致した。10:05 JST に、本番 API に届いた runner 自身の観測が再起動後の時刻で `healthy` になったことを確認した。初回の観測は登録完了前に保存されることがあるため、即時の反映ではなく、次の 2 分周期の観測まで確認した。観測の確認元は本番 D1 の対象 runner の行であり、ブラウザ操作による確認ではない。[本番の同期・実行状況](https://life-console.kokoichi206.workers.dev/operations)で対象の状態を参照できる。

切り替え直後には `runner_crashed` が 1 件記録されたが、プロセスは存続し、runner・Slack・Chatwork・Gmail・Calendar の観測は切り替え後に更新された。Orca の最終観測は更新前から古いまま、Talknote は `auth_required` だった。現行配布物は最上位の catch で例外の詳細を記録しないため、このログと Node.js 更新との因果関係は未確定。監視の例外原因と Orca・Talknote の復旧は今回の変更には含めていない。実ジョブを新規に実行する検証も行っていない。

GitHub Actions の新設定による実行と、Cloudflare の内部ランタイムの修正状況は、このローカル検証では確認していない。JavaScript action 自体が使う Node.js は GitHub runner 側の管理で、`setup-node` に指定する後続コマンド用の Node.js とは別である。
