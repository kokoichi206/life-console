# Cloudflare の Terraform 管理

D1、写真用 R2、Access、Worker コード・Static Assets・bindings・Cron・公開 URL、state 用 R2 を管理する。GHA の `deploy.yml` が build・SQL migration の後に保存済み Terraform plan を apply する。Wrangler はローカル開発、Worker の bundle 作成、D1 の SQL migration に使い、アプリ配置には使わない。

既存資源は import 済み。開発は 7 件、本番は 9 件、state 保存先は 1 件を管理する。本番の Worker・Cron・公開 URL は読み取り専用 token で import し、この移行作業で本番へ apply はしない。詳細な検証記録は非公開の運用ディレクトリに保存する。

## ディレクトリと責務

`core-AI-inc/chatbot-pro` を参考に、`envs` が `modules` を組み合わせる。モジュールから別モジュールを呼ばず、環境分岐も持たせない。

```text
infra/terraform/
├── bootstrap/
│   └── state-storage/ # Terraform 自身の state bucket
├── envs/
│   ├── development/  # 開発の保存先・Access・Worker 配置
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
| Worker・Static Assets・bindings・Cron・公開 URL | Terraform の `modules/services/worker` |
| Web の build と Worker の bundle 作成 | Vite と Wrangler の dry-run |
| DB テーブルと SQL | `packages/db/migrations` と Wrangler |
| アプリ用 token、runner の Service Token の発行・秘密値 | 既存の非公開設定 |
| Terraform provider と S3 backend の資格情報 | リポジトリ外の非公開ファイル |

開発・本番の本人用 Access は、既存の Worker ID を `destinations` に指定する。本人用 Allow ポリシーは環境ごとに作成し、同じ root 内でその ID を Access に渡す。本番は既存ポリシーの ID・名前・条件を維持し、開発だけ別のポリシーに付け替える。環境間でポリシー ID や remote state を受け渡さない。開発・本番で異なる HttpOnly cookie 設定も維持する。

本番の runner 用 Access は `/api/v1/runner/*` だけを対象に、既存 Service Token の ID を参照する Service Auth ポリシーを持つ。資格情報の発行・ローテーションや runner のジョブ実行は Terraform の対象外。

## state と資格情報

専用の非公開 R2 bucket `life-console-tfstate` を S3 backend として使う。state の分割単位は次のとおり。

| root | R2 のキー |
| --- | --- |
| `bootstrap/state-storage` | `life-console/bootstrap/terraform.tfstate` |
| `development` | `life-console/development/terraform.tfstate` |
| `production` | `life-console/production/terraform.tfstate` |

`use_lockfile = true` により、各キーの `.tflock` で同時更新を排他する。AWS 向けの資格情報・リージョン確認を省く設定は、R2 に接続するために必要。bucket の公開ドメインは無効とし、写真用 bucket を流用しない。

ローカルの資格情報は `~/.config/life-console/terraform/credentials.env` に保存する。ディレクトリは `0700`、ファイルは `0600`。provider 用 `CLOUDFLARE_API_TOKEN` と、state bucket のみに読み書きを許可した `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` をプロセスの環境変数へ渡す。資格情報を `backend.hcl` や tfvars に書かない。

ローカルの provider token は D1 / R2 / Access Apps / Access Policies / Workers Scripts の読み取り専用で、import・refresh・plan に使える。GHA には同じ 5 サービスの編集権限を持つ token を環境別に用意する。Cloudflare 側の権限範囲は対象アカウントで、GHA 側の Environment と許可ブランチで開発・本番の利用経路を分ける。

`terraform.tfvars`、`backend.hcl`、`imports.tf` は各 root 内の Git 管理外ファイル。新しい checkout では、`~/.config/life-console/terraform/` 以下の、リポジトリと同じ root 相対パスから同名ファイルを復元する（例: `envs/development/`、`bootstrap/state-storage/`）。入力はアカウント・Worker・Service Token の ID、本人メール、アカウントの workers.dev サブドメインに絞る。既知のアプリ名やセッション期間は定義に固定する。

state と plan は本人メールなどを含むため、Git や公開 CI artifact に保存しない。変更前のバックアップは `terraform state pull` で非公開の別保存先へ残す。state bucket 自体も管理対象だが、初回作成は backend の初期化より先に行う。

## state 保存先の初回準備

`bootstrap/state-storage` はアプリの第三の環境ではなく、Terraform 自身の保存先だけを管理する root。bucket `life-console-tfstate` はすでに作成・import 済みなので、既存環境では再作成しない。開発・本番の state は同じ専用 bucket の別キーに保存し、Access ポリシーは共有しない。

新しいアカウントで初めて構築する場合だけ、Cloudflare dashboard の R2 で非公開 bucket `life-console-tfstate` を先に作成する。公開ドメインを有効にせず、この bucket だけに Object Read & Write を許可した R2 API token を発行する。provider 用 token と S3 資格情報を非公開の環境変数ファイルに保存し、`bootstrap/state-storage` の example から `backend.hcl` と `terraform.tfvars` を用意する。

```bash
source ~/.config/life-console/terraform/credentials.env
cd infra/terraform/bootstrap/state-storage
terraform init -input=false -lockfile=readonly -backend-config=backend.hcl
terraform import -input=false \
  module.state_storage.cloudflare_r2_bucket.state \
  '<account-id>/life-console-tfstate/default'
terraform plan -input=false -detailed-exitcode
```

backend が存在しない段階では、その backend を使う Terraform 自身から bucket を初回作成できないため、この 1 件だけ作成が先になる。以後の構成管理は Terraform に移る。

## 日常の確認

```bash
source ~/.config/life-console/terraform/credentials.env
VITE_APP_ENV=development pnpm --filter @life-console/web build
pnpm --filter @life-console/api build
cd infra/terraform/envs/development
terraform init -input=false -lockfile=readonly -backend-config=backend.hcl
terraform plan -input=false -detailed-exitcode
```

本番は `VITE_APP_ENV=production` で build してから `envs/production`、state 保存先は build 不要で `bootstrap/state-storage` を使う。最後の exit code は `0` が差分なし、`2` が差分あり、`1` が失敗。`-lock=false` で競合を回避しない。

D1 / R2 / Access / Worker / Cron / 公開 URL は `prevent_destroy` を持つ。定義が残っている間の削除・置き換えを止めるもので、モジュール自体の削除や管理外の操作は防がない。state bucket は両環境の管理に必要なため、アプリ環境とは別の root に置き、通常の環境変更では操作しない。

## 既存環境の import

1. 実際の配置アカウント、D1 ID、bucket 名・jurisdiction、Access の対象・条件・ポリシー共有先を API と配置設定で照合する。
2. `backend.hcl.example`、`terraform.tfvars.example`、`imports.tf.example` から Git 管理外の設定を作る。既存値に合わせ、本人メールや実環境の ID を example に書かない。
3. state 保存先を準備してから、開発・本番それぞれの backend を初期化して取り込む。各 `imports.tf` の `to` と `id` は CLI import のアドレス・ID にも対応する。
4. 実環境を変更しない `terraform import` で state に登録し、plan の各差分を実設定と照合する。D1 / R2 / Access は差分なしに合わせる。Worker は build 成果物を初めて Terraform から配置する更新が残るため、import と初回配置を分けて確認する。DB データや写真はコピーしない。

```bash
terraform import -input=false \
  module.database.cloudflare_d1_database.database \
  '<account-id>/<existing-database-id>'
terraform plan -input=false -detailed-exitcode
```

import block を使う場合は `terraform plan -out=import.tfplan` で計画を保存し、追加・更新・削除・置き換えがないことを確認してから `terraform apply import.tfplan` を実行する。既存値の省略や provider の既定値が原因で変更が出る場合は、取得した実設定を定義へ反映する。`ignore_changes` で隠さない。秘密扱いの属性マークだけの差分も import plan では更新と表示されることがあるため、値と state のメタデータを分けて確認する。

Cloudflare provider `5.24.0` の Cron resource は import・refresh で schedule を state に読み戻さない。初回 plan の schedule 更新は実 API の式と照合し、apply 後も Cron の確認には API を使う。plan の差分なしだけで、管理外の Cron 変更がないとは判断しない。

R2 の公開ドメイン設定はこの定義では作成しない。import 前後に managed domain が無効で custom domain が空であることを別途確認する。既存の公開ドメインを自動削除する定義ではない。

## GHA からの配置

`deploy.yml` は `develop` で開発、`main` で本番を扱う。`workflow_dispatch` でも対象ブランチを選んで同じ処理を実行できる。GitHub Environment の許可ブランチは開発が `develop`、本番が `main` のみとする。

1. アプリの検査・build と Terraform の mock 検証を行う。
2. 対象 Environment の入力と資格情報で R2 backend を初期化し、plan を保存する。
3. plan に削除・置き換えがあれば停止する。module の定義を消した場合も対象にする。
4. Terraform output から D1 の接続先を生成し、既存の SQL migration を適用する。
5. 同じ build 成果物のまま、保存済み plan を `terraform apply` する。Worker と Static Assets もこの apply で配置する。

Terraform は既存の Worker の secret bindings を保持する。runner token や Web Push の秘密値を tfvars に複製しない。plan / state / 資格情報を CI artifact にアップロードしない。

各 GitHub Environment に次の Secrets を登録する。

| Secret | 内容 |
| --- | --- |
| `TERRAFORM_TFVARS_JSON` | その環境の `terraform.tfvars` と同じ入力を JSON で保存 |
| `TERRAFORM_CLOUDFLARE_API_TOKEN` | 対象アカウントの D1・R2・Access Apps・Access Policies・Workers Scripts 編集 token |
| `TERRAFORM_STATE_ACCESS_KEY_ID` | state 用 R2 bucket 専用の S3 access key |
| `TERRAFORM_STATE_SECRET_ACCESS_KEY` | 同じ S3 secret key |

D1 ID を GitHub Secret と二重管理せず、migration は `cloudflare_d1_database_id` output を参照する。旧 `CLOUDFLARE_*` Secrets は新しい workflow では参照しないが、旧 workflow が残るブランチで必要な間は削除しない。

R2 の state lock と GHA の環境別 concurrency を使う。plan と apply の間に別の操作が state を更新した場合は、保存済み plan が stale と判定され、apply が停止する。migration はすでに適用されている可能性があるため、稼働中の Worker と互換性のある SQL にする。

既存の D1 と Worker がある環境を対象にしている。新しいアカウント・環境の初回構築では、state 保存先、D1、非公開 Worker、Worker ID に紐づく Access の順に準備し、実在する ID を入力して import してからこの workflow を有効にする。state bucket 自体の初回準備は通常のアプリ配置 workflow では行わない。

## ローカルと CI の検証

Terraform は [.tool-versions](.tool-versions) の `1.13.5` を使う。Cloudflare provider の厳密なバージョン `5.24.0` と lock file は 3 つの root で管理する。子 module の `versions.tf` は `cloudflare/cloudflare` と最低対応版だけを宣言し、root の provider 設定を継承する。provider の更新ごとに子 module の最低対応版を上げる必要はない。

`required_providers` の source は子 module にも必要。これを省くと Terraform は `hashicorp/cloudflare` と解釈する。`provider "cloudflare" {}` の設定ブロックは root にだけ置く。

```bash
bash infra/terraform/check.sh
pnpm check
```

`check.sh` は fmt を確認し、公開用の定義とテストだけを一時ディレクトリへコピーして、backend 接続なしの init / validate・mock test を実行する。実運用の backend 初期化情報は書き換えない。子 module のテストは環境 root から実行し、その lock file を使う。環境ごとの保存先、Worker ID の保護、環境内の本人条件、runner のパスと Service Auth、Worker の secret 保持と API / SPA の配信設定を確認する。

[ci-terraform.yml](../../.github/workflows/ci-terraform.yml) は同じ検証を行う。PR の検証には資格情報を渡さない。実環境の plan / apply は、許可ブランチの `deploy.yml` が担当する。mock test と実際の R2 ロック・import・認証の確認は区別する。

## 公式資料

- [D1 schema と import](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/d1_database.md)
- [R2 schema と import](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/r2_bucket.md)
- [Access アプリケーション](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/zero_trust_access_application.md)
- [Access ポリシー](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/zero_trust_access_policy.md)
- [Terraform S3 backend と lockfile](https://developer.hashicorp.com/terraform/language/backend/s3)
- [R2 の認証と bucket 単位の権限](https://developers.cloudflare.com/r2/api/tokens/)
- [Worker 配置・Static Assets と import](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/workers_script.md)
- [子 module の provider 宣言と継承](https://developer.hashicorp.com/terraform/language/modules/develop/providers)
