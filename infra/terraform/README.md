# Cloudflare の Terraform 管理

Terraform は D1・写真用 R2・Access・Worker 本体と観測設定・state 用 R2 を管理する。Wrangler はコード・Static Assets・bindings の version 登録、配信 version の切替、Cron・公開 URL、D1 の SQL migration を担当する。

`deploy.yml` は `detect → infra → upload → migration → deploy` の順に実行する。Terraform の plan は基盤の変更予定を計算し、apply がその変更を実行する。アプリの build 成果物は plan / apply に不要。

## ディレクトリと責務

`core-AI-inc/chatbot-pro` を参考に、`envs` が `modules` を組み合わせる。モジュールから別モジュールを呼ばず、環境分岐も持たせない。

```text
infra/terraform/
├── bootstrap/
│   └── state-storage/ # Terraform 自身の state bucket
├── envs/
│   ├── development/  # 開発の保存先・Access・Worker 本体
│   └── production/   # 本番の同資源と runner API の Access
└── modules/
    ├── platform/
    │   ├── owner-policy/
    │   └── state-storage/
    └── services/
        ├── d1-database/
        ├── meal-photo-storage/
        ├── owner-access/
        ├── runner-access/
        └── worker/
```

| 項目 | 管理元 |
| --- | --- |
| D1 本体、写真用 R2、Access のアプリ・ポリシー | Terraform |
| 非公開の state 用 R2 bucket | 初回だけ先に作成し、`bootstrap/state-storage` へ import |
| Worker 本体・観測設定・logpush・tail consumers | Terraform の `modules/services/worker` |
| コード・Static Assets・bindings・Cron・公開 URL | Wrangler の環境別設定 |
| Web の build と Worker の bundle 作成 | Vite と Wrangler の dry-run |
| DB テーブルと SQL | `packages/db/migrations` と Wrangler |
| アプリ用 token、runner の Service Token の発行・秘密値 | 既存の非公開設定 |
| Terraform provider と S3 backend の資格情報 | リポジトリ外の非公開ファイル |

開発・本番の本人用 Access は、同じ root の `module.worker.worker_id` を `destinations` に指定する。本人用 Allow ポリシーは環境ごとに作成し、同じ root 内でその ID を Access に渡す。本番は既存ポリシーの ID・名前・条件を維持し、開発だけ別のポリシーに付け替える。環境間でポリシー ID や remote state を受け渡さない。開発・本番で異なる HttpOnly cookie 設定も維持する。

本番の runner 用 Access は `/api/v1/runner/*` だけを対象に、既存 Service Token の ID を参照する Service Auth ポリシーを持つ。資格情報の発行・ローテーションや runner のジョブ実行は Terraform の対象外。

## state と資格情報

専用の非公開 R2 bucket `life-console-tfstate` を S3 backend として使う。state の分割単位は次のとおり。

| root | R2 のキー |
| --- | --- |
| `bootstrap/state-storage` | `life-console/bootstrap/terraform.tfstate` |
| `development` | `life-console/development/terraform.tfstate` |
| `production` | `life-console/production/terraform.tfstate` |

`use_lockfile = true` により、各キーの `.tflock` で同時更新を排他する。AWS 向けの資格情報・リージョン確認を省く設定は、R2 に接続するために必要。bucket の公開ドメインは無効とし、写真用 bucket を流用しない。

ローカルの資格情報は `~/.config/life-console/terraform/credentials.env` に保存する。ディレクトリは `0700`、ファイルは `0600`。provider 用 `CLOUDFLARE_API_TOKEN` と、state bucket のみに読み書きを許可した `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` をプロセスの環境変数へ渡す。資格情報を Terraform の定義や tfvars に書かない。

ローカルの provider token は D1 / R2 / Access Apps / Access Policies / Workers Scripts の読み取り専用で、import・refresh・plan に使える。GHA の配置には同じ 5 サービスの編集権限を持つ token を環境別に用意し、PR の plan には読み取り専用 token を使う。Cloudflare 側の権限範囲は対象アカウントで、GHA 側の Environment と許可ブランチで開発・本番の利用経路を分ける。

`terraform.tfvars` と `imports.tf` は各 root 内の Git 管理外ファイル。新しい checkout では、`~/.config/life-console/terraform/` 以下の、リポジトリと同じ root 相対パスから `terraform.tfvars` を復元する（例: `envs/development/`）。`imports.tf` は未取り込みの資源がある場合だけ使い、取り込み済みの旧 Worker・Cron・subdomain の import block は削除する。入力は本人メールと本番 runner の既存 Service Token ID。既存 Worker の管理移行時だけ `access_worker_id` も指定する。Cloudflare account ID と workers.dev サブドメインは各 root の `locals.tf`、state bucket と R2 endpoint は `backend.tf` に固定する。`backend.hcl` の生成・復元は不要。state 保存先の root は入力変数を持たない。

state と plan は本人メールなどを含むため、Git や公開 CI artifact に保存しない。変更前のバックアップは `terraform state pull` で非公開の別保存先へ残す。state bucket 自体も管理対象だが、初回作成は backend の初期化より先に行う。

## state 保存先の初回準備

`bootstrap/state-storage` はアプリの第三の環境ではなく、Terraform 自身の保存先だけを管理する root。bucket `life-console-tfstate` はすでに作成・import 済みなので、既存環境では再作成しない。開発・本番の state は同じ専用 bucket の別キーに保存し、Access ポリシーは共有しない。

新しいアカウントで初めて構築する場合だけ、Cloudflare dashboard の R2 で非公開 bucket `life-console-tfstate` を先に作成する。公開ドメインを有効にせず、この bucket だけに Object Read & Write を許可した R2 API token を発行する。provider 用 token と S3 資格情報を非公開の環境変数ファイルに保存する。別アカウントへ配置する場合は各 root の `locals.tf` と `backend.tf` をそのアカウントに合わせる。

```bash
source ~/.config/life-console/terraform/credentials.env
cd infra/terraform/bootstrap/state-storage
terraform init -input=false -lockfile=readonly
terraform import -input=false \
  module.state_storage.cloudflare_r2_bucket.state \
  '<account-id>/life-console-tfstate/default'
terraform plan -input=false -detailed-exitcode
```

backend が存在しない段階では、その backend を使う Terraform 自身から bucket を初回作成できないため、この 1 件だけ作成が先になる。以後の構成管理は Terraform に移る。

## 日常の確認

```bash
source ~/.config/life-console/terraform/credentials.env
cd infra/terraform/envs/development
terraform init -input=false -lockfile=readonly
terraform plan -input=false -detailed-exitcode
```

本番は `envs/production`、state 保存先は `bootstrap/state-storage` を使う。どの root も build は不要。最後の exit code は `0` が差分なし、`2` が差分あり、`1` が失敗。`-lock=false` で競合を回避しない。

D1 / R2 / Access / Worker 本体は `prevent_destroy` を持つ。定義が残っている間の削除・置き換えを止めるもので、モジュール自体の削除や管理外の操作は防がない。state bucket は両環境の管理に必要なため、アプリ環境とは別の root に置き、通常の環境変更では操作しない。

## 既存資源の取り込みと Worker の管理移行

新規環境では import は不要。別途作成済みの D1・R2・Access を取り込む場合だけ `imports.tf.example` の ID を実環境に合わせ、plan の差分を確認して import する。state と plan の検証記録は非公開の保存先へ置く。

旧 `cloudflare_workers_script` で管理済みの開発・本番では、既存の `access_worker_id` をそのまま使う。`worker-import.tf` が同じ Worker を `cloudflare_worker` に取り込み、module 内の `removed { lifecycle { destroy = false } }` が旧 script・Cron・subdomain を state から外す。Worker の削除や再作成は行わない。移行後は `access_worker_id` を入力から省略できる。新規環境では最初から省略する。

Worker の `subdomain` は作成時だけ非公開にし、以降は `ignore_changes` で Wrangler に管理を任せる。provider は未指定でも `enabled = false` を補うため、単なる省略では既存 URL を無効にする差分になる。公開 URL は配信切替後の `wrangler triggers deploy` で有効化し、preview URL は無効のままにする。

Worker・D1・R2・Access の `prevent_destroy` と、配置時の plan に対する削除・置き換え拒否を維持する。旧 script の `workers_tag` による assets 差分検出は不要になるため削除する。Wrangler の upload は既存の secret bindings を引き継ぐ。秘密値を Terraform 入力へ複製しない。

R2 の公開ドメインは定義しない。既存 bucket を import する場合は managed domain が無効で custom domain が空であることを実 API でも確認する。

## GHA からの配置

`deploy.yml` は `develop` で開発、`main` で本番を扱う。`workflow_dispatch` でも対象ブランチを選んで同じ処理を実行できる。GitHub Environment の許可ブランチは開発が `develop`、本番が `main` のみとする。

品質検査・単体／保存テスト・Storybook・Terraform 検証・runner の build は PR の CI が担当する。deploy では繰り返さず、配置対象の Web / API の build と配置だけを行う。Web は環境名を埋め込むため、対象環境向けに Vite で build する。

| job | 実行内容 |
| --- | --- |
| `detect` | 同じブランチの最後に成功した deploy workflow の SHA と比較し、必要な job を決める |
| `infra` | 基盤の plan を保存し、削除・置き換えがないことを確認して apply。Worker 本体を先に作り、その ID で Access を設定 |
| `upload` | 適用済みの Terraform output から環境別 Wrangler 設定を生成。Web / API を build し、`versions upload` で version を登録 |
| `migration` | 適用済み D1 に `d1 migrations apply --remote` を実行 |
| `deploy` | upload が返した version ID を `versions deploy <id>@100% --yes` で配信し、`triggers deploy` で公開 URL と Cron を設定 |

初回・手動実行・比較元が現在の履歴にない場合は全工程を実行する。基盤や deploy 定義の変更も全工程、Web / API とその依存パッケージの変更は upload 以降、SQL migration だけなら migration を実行する。runner・Android・ドキュメントだけの変更ではアプリ配置を省く。workflow 自体は push ごとに起動し、失敗 run の変更を次の差分検出から落とさない。

`infra` が省略されても、必要な後続 job は実行する。上流の失敗やキャンセル後は進めない。配信だけ失敗した場合の「失敗したジョブを再実行」は、成功済み upload の version ID を使う。全ジョブの再実行では version を登録し直す。version ID は Wrangler の構造化出力 `version-upload` から取り、ログの文言を解析しない。

plan は `infra` 内だけで保持する。後続 job は state の output を読み直して設定を生成するため、plan / state / 資格情報を artifact に保存しない。version 自体は Cloudflare にあるため、build 成果物の job 間転送も不要。triggers の更新には公開経路と Cron だけの設定ファイルを生成し、assets のローカルディレクトリを参照させない。

Repository Secrets に次の 4 件を登録する。環境ごとの入力は `TERRAFORM_ENVIRONMENTS_JSON` の `development` / `production` に分け、各値には対応する tfvars の内容を JSON object として保存する。配置と PR の plan が同じ入力を参照する。

| Secret | 内容 |
| --- | --- |
| `TERRAFORM_ENVIRONMENTS_JSON` | 開発・本番の Terraform 入力を環境名でまとめた JSON |
| `TERRAFORM_PLAN_API_TOKEN` | D1・R2・Access Apps・Access Policies・Workers Scripts の読み取り専用 token |
| `TERRAFORM_PLAN_STATE_ACCESS_KEY_ID` | state 用 R2 bucket 専用の S3 access key |
| `TERRAFORM_PLAN_STATE_SECRET_ACCESS_KEY` | 同じ S3 secret key |

PR の plan でも R2 の state lock を使うため、S3 資格情報には専用 bucket の Object Read & Write 権限を持たせる。Cloudflare API token は読み取り専用。plan workflow は state 本体を更新せず、lock の作成・解放だけを書き込む。

配置用の編集資格情報は、各 GitHub Environment に次の 3 件を登録する。

| Secret | 内容 |
| --- | --- |
| `TERRAFORM_CLOUDFLARE_API_TOKEN` | 対象アカウントの D1・R2・Access Apps・Access Policies・Workers Scripts 編集 token |
| `TERRAFORM_STATE_ACCESS_KEY_ID` | state 用 R2 bucket 専用の S3 access key |
| `TERRAFORM_STATE_SECRET_ACCESS_KEY` | 同じ S3 secret key |

D1 ID を GitHub Secret と二重管理せず、migration は `cloudflare_d1_database_id` output を参照する。旧 `CLOUDFLARE_*` Secrets と Environment の `TERRAFORM_TFVARS_JSON` は新しい workflow では参照しないが、旧 workflow が残るブランチで必要な間は削除しない。

R2 の state lock と GHA の環境別 concurrency を使う。plan と apply の間に別の操作が state を更新した場合は、保存済み plan が stale と判定され、apply が停止する。migration はすでに適用されている可能性があるため、稼働中の Worker と互換性のある SQL にする。

## アプリ環境の初回実行

1. state bucket・API token・R2 backend 資格情報・GitHub Environment を準備する。別アカウントでは `locals.tf` と `backend.tf` も変更する。本番 runner の Service Auth を使う場合は Service Token の ID を入力する。
2. `TERRAFORM_ENVIRONMENTS_JSON` の対象環境には本人メールを入れ、`access_worker_id` は指定しない。
3. 対象ブランチで deploy を手動実行する。`infra` がコードなしの非公開 Worker・D1・R2・Access を作成し、以降は通常と同じ upload → migration → 配信切替を実行する。

通常の Worker は ECR 相当の独立したコンテナ registry を必要としない。ここで先に作るのはコードを載せる Worker 本体と、bindings が参照する D1・R2。state bucket の作成・認証資格情報の発行はアプリ配置の前提として分ける。

初回は引き継ぐ secret がないため、runner token や Web Push の秘密値は、それらの機能を利用する前に設定する。Worker コードの version を戻しても D1 の migration は戻らない。migration は切替前のコードでも動作する SQL にする。

## ローカルと CI の検証

Terraform は [.tool-versions](.tool-versions) の `1.13.5` を使う。Cloudflare provider の厳密なバージョン `5.24.0` と lock file は 3 つの root で管理する。子 module の `versions.tf` は `cloudflare/cloudflare` と最低対応版だけを宣言し、root の provider 設定を継承する。provider の更新ごとに子 module の最低対応版を上げる必要はない。

`required_providers` の source は子 module にも必要。これを省くと Terraform は `hashicorp/cloudflare` と解釈する。`provider "cloudflare" {}` の設定ブロックは root にだけ置く。

```bash
bash infra/terraform/check.sh
pnpm check
```

`check.sh` は fmt を確認し、公開用の定義とテストだけを一時ディレクトリへコピーして、backend 接続なしの init / validate・mock test を実行する。実運用の backend 初期化情報は書き換えない。子 module のテストは環境 root から実行し、その lock file を使う。build 成果物も既存 Worker ID もない状態の基盤 plan、環境ごとの保存先、Worker ID の保護、環境内の本人条件、runner のパスと Service Auth を確認する。

[ci-terraform.yml](../../.github/workflows/ci-terraform.yml) の validate job は資格情報なしで同じ検証を行う。同じリポジトリ内のブランチから `develop` / `main` へ出した PR では、別の plan job が読み取り専用 Cloudflare token で開発・本番の基盤 plan を取得する。アプリの build は不要。fork PR には plan 用の資格情報を渡さず、validate のみ実行する。

plan の変更資源・操作・検証コミット・実行ログへのリンクを、`actions/github-script` で環境ごとの PR コメントに表示する。push のたびに既存コメントを更新し、init・plan の失敗時も未完了として表示する。本人情報や Worker 本文を含む plan / state の値はコメントや artifact に載せない。

PR では apply・SQL migration を実行しない。apply は許可ブランチの `deploy.yml` が毎回作り直した plan を使う。R2 の lock を解放するため、PR の plan job は後続 push で自動キャンセルしない。

workflow の規約とセキュリティ上の設定は、`kokoichi206/gh-actions/.github/workflows/workflow-ci.yml@main` の `workflow lint` と `zizmor` で検査する。配置前の削除・置き換え拒否は `deploy.yml` 内の `jq` で行い、専用のスクリプトやテストは持たない。

## 公式資料

- [D1 schema と import](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/d1_database.md)
- [R2 schema と import](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/r2_bucket.md)
- [Access アプリケーション](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/zero_trust_access_application.md)
- [Access ポリシー](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/zero_trust_access_policy.md)
- [Terraform S3 backend と lockfile](https://developer.hashicorp.com/terraform/language/backend/s3)
- [R2 の認証と bucket 単位の権限](https://developers.cloudflare.com/r2/api/tokens/)
- [Worker 本体と import](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/worker.md)
- [Terraform と Wrangler の分担](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/)
- [version と deployment](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [子 module の provider 宣言と継承](https://developer.hashicorp.com/terraform/language/modules/develop/providers)
