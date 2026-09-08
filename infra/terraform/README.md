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

ローカルの資格情報は `~/.config/life-console/terraform/credentials.env` に保存する。ディレクトリは `0700`、ファイルは `0600`。provider 用 `CLOUDFLARE_API_TOKEN` と、state bucket のみに読み書きを許可した `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` をプロセスの環境変数へ渡す。資格情報を Terraform の定義や tfvars に書かない。

ローカルの provider token は D1 / R2 / Access Apps / Access Policies / Workers Scripts の読み取り専用で、import・refresh・plan に使える。GHA の配置には同じ 5 サービスの編集権限を持つ token を環境別に用意し、PR の plan には読み取り専用 token を使う。Cloudflare 側の権限範囲は対象アカウントで、GHA 側の Environment と許可ブランチで開発・本番の利用経路を分ける。

`terraform.tfvars` と `imports.tf` は各 root 内の Git 管理外ファイル。新しい checkout では、`~/.config/life-console/terraform/` 以下の、リポジトリと同じ root 相対パスから同名ファイルを復元する（例: `envs/development/`）。入力は既存 Worker・Service Token の ID と本人メールに絞る。Cloudflare account ID と workers.dev サブドメインは各 root の `locals.tf`、state bucket と R2 endpoint は `backend.tf` に固定する。`backend.hcl` の生成・復元は不要。state 保存先の root は入力変数を持たない。

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
VITE_APP_ENV=development pnpm --filter @life-console/web build
pnpm --filter @life-console/api build
cd infra/terraform/envs/development
terraform init -input=false -lockfile=readonly
terraform plan -input=false -detailed-exitcode
```

本番は `VITE_APP_ENV=production` で build してから `envs/production`、state 保存先は build 不要で `bootstrap/state-storage` を使う。最後の exit code は `0` が差分なし、`2` が差分あり、`1` が失敗。`-lock=false` で競合を回避しない。

D1 / R2 / Access / Worker / Cron / 公開 URL は `prevent_destroy` を持つ。定義が残っている間の削除・置き換えを止めるもので、モジュール自体の削除や管理外の操作は防がない。state bucket は両環境の管理に必要なため、アプリ環境とは別の root に置き、通常の環境変更では操作しない。

## 既存環境の import

1. 実際の配置アカウント、D1 ID、bucket 名・jurisdiction、Access の対象・条件・ポリシー共有先を API と配置設定で照合する。
2. アカウントと backend の固定値を確認し、環境 root の `terraform.tfvars.example` と各 root の `imports.tf.example` から Git 管理外の設定を作る。本人メールや既存 Worker・Service Token の ID は example に書かない。
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

品質検査・単体／保存テスト・Storybook・Terraform 検証・runner の build は PR の CI が担当する。deploy では繰り返さず、配置対象の Web / API の build と配置だけを行う。Web は環境名を埋め込むため、対象環境向けに Vite で build する。

1. `build` job で配置用の Web / API を build する。
2. build の成功後、`deploy` job が同じ run の build 成果物を artifact ID で受け取る。artifact は API / Web の `dist` だけを含み、7 日間保存する。配置 job の再実行では成功済み build の成果物を使う。
3. Repository Secret から対象環境の入力を選び、Environment の配置用資格情報で R2 backend を初期化して plan を保存する。
4. plan に削除・置き換えがあれば停止する。module の定義を消した場合も対象にする。
5. Terraform output から D1 の接続先を生成し、既存の SQL migration を適用する。
6. 同じ build 成果物のまま、保存済み plan を `terraform apply` する。Worker と Static Assets もこの apply で配置する。

plan・SQL migration・apply は同じ配置 job に置く。秘密値を含む plan を job 間で転送せず、削除検査を通った plan と配置対象の build を揃えるため。Environment と配置用資格情報もこの job だけで使う。

Worker の `annotations.workers_tag` は API bundle と Web 全ファイルのパス・内容から計算したハッシュにする。Cloudflare provider `5.24.0` は Web だけの変更を plan modifier で検出した際、`startup_time_ms` を旧 state の値に固定したまま更新し、apply で不整合になる。バージョンタグを設定差分に含めることで、plan の初期段階から変更を認識させ、起動時間を apply 後に確定させる。provider 自体の修正ではなく、配置内容の変更を Terraform の設定に明示する対応。根拠は [provider の ModifyPlan](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/internal/services/workers_script/resource.go#L471) と [静的ファイルの差分検出](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/internal/services/workers_script/assets.go#L270)。

Terraform は既存の Worker の secret bindings を保持する。runner token や Web Push の秘密値を tfvars に複製しない。plan / state / 資格情報を CI artifact にアップロードしない。

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

既存の D1 と Worker がある環境を対象にしている。新しいアカウント・環境の初回構築では、state 保存先、D1、非公開 Worker、Worker ID に紐づく Access の順に準備し、実在する ID を入力して import してからこの workflow を有効にする。state bucket 自体の初回準備は通常のアプリ配置 workflow では行わない。

## ローカルと CI の検証

Terraform は [.tool-versions](.tool-versions) の `1.13.5` を使う。Cloudflare provider の厳密なバージョン `5.24.0` と lock file は 3 つの root で管理する。子 module の `versions.tf` は `cloudflare/cloudflare` と最低対応版だけを宣言し、root の provider 設定を継承する。provider の更新ごとに子 module の最低対応版を上げる必要はない。

`required_providers` の source は子 module にも必要。これを省くと Terraform は `hashicorp/cloudflare` と解釈する。`provider "cloudflare" {}` の設定ブロックは root にだけ置く。

```bash
bash infra/terraform/check.sh
pnpm check
```

`check.sh` は fmt を確認し、公開用の定義とテストだけを一時ディレクトリへコピーして、backend 接続なしの init / validate・mock test を実行する。実運用の backend 初期化情報は書き換えない。子 module のテストは環境 root から実行し、その lock file を使う。環境ごとの保存先、Worker ID の保護、環境内の本人条件、runner のパスと Service Auth、Worker の secret 保持と API / SPA の配信設定を確認する。

[ci-terraform.yml](../../.github/workflows/ci-terraform.yml) の validate job は資格情報なしで同じ検証を行う。同じリポジトリ内のブランチから `develop` / `main` へ出した PR では、別の plan job が開発・本番をそれぞれ build し、読み取り専用 Cloudflare token で実環境の plan を取得する。fork PR には plan 用の資格情報を渡さず、validate のみ実行する。

plan の変更資源・操作・検証コミット・実行ログへのリンクを、`actions/github-script` で環境ごとの PR コメントに表示する。push のたびに既存コメントを更新し、build・init・plan の失敗時も未完了として表示する。本人情報や Worker 本文を含む plan / state の値はコメントや artifact に載せない。

PR では apply・SQL migration を実行しない。apply は許可ブランチの `deploy.yml` が毎回作り直した plan を使う。R2 の lock を解放するため、PR の plan job は後続 push で自動キャンセルしない。

workflow の規約とセキュリティ上の設定は、`kokoichi206/gh-actions/.github/workflows/workflow-ci.yml@main` の `workflow lint` と `zizmor` で検査する。配置前の削除・置き換え拒否は `deploy.yml` 内の `jq` で行い、専用のスクリプトやテストは持たない。

## 公式資料

- [D1 schema と import](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/d1_database.md)
- [R2 schema と import](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/r2_bucket.md)
- [Access アプリケーション](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/zero_trust_access_application.md)
- [Access ポリシー](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/zero_trust_access_policy.md)
- [Terraform S3 backend と lockfile](https://developer.hashicorp.com/terraform/language/backend/s3)
- [R2 の認証と bucket 単位の権限](https://developers.cloudflare.com/r2/api/tokens/)
- [Worker 配置・Static Assets と import](https://github.com/cloudflare/terraform-provider-cloudflare/blob/v5.24.0/docs/resources/workers_script.md)
- [子 module の provider 宣言と継承](https://developer.hashicorp.com/terraform/language/modules/develop/providers)
