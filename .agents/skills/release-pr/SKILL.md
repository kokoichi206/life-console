---
name: release-pr
description: Life Console の本番リリースに向けて、develop から main への PR を作成する。リリース差分の要約、既存 PR の重複確認、CI と開発環境の配置状況の確認を行う。通常の feature PR 作成には使わない。
---

# 本番リリース PR の作成

対象は `kokoichi206/life-console` の `develop` → `main`。PR 作成の依頼なら作成まで進める。文案・調査だけの依頼や、このスキル自体の作成・修正では GitHub に書き込まない。

[運用上の注意](../../../docs/operations.md)、[deploy workflow](../../../.github/workflows/deploy.yml)、[PR テンプレート](../../../.github/pull_request_template.md) を読む。作業ツリーとリリース元が異なる場合は、`git show origin/develop:<path>` でリリース元の定義も確認する。

`main` へのマージは本番配置を開始する。通常の終了地点は PR 作成と状況報告まで。マージ・auto-merge の設定・ブランチ削除・workflow の手動実行・Mac runner の更新は含めない。マージまで明示的に依頼されている場合は、既存の許可範囲で CI と対象 SHA を確認し、運用文書どおり merge commit を使う。

## 対象と差分の確認

```sh
git remote get-url origin
gh repo view kokoichi206/life-console --json nameWithOwner,url
git status --short
git fetch origin main develop
gh pr list --repo kokoichi206/life-console --base main --head develop --state open --json number,title,url,headRefOid
git rev-parse origin/main origin/develop
git log --oneline origin/main..origin/develop
git diff --stat origin/main...origin/develop
git diff --name-status origin/main...origin/develop
```

- `origin` が対象リポジトリであることを確認してから fetch する
- ローカルの変更や現在のブランチはリリース対象に含めず、checkout・commit・push は行わない
- 既存 PR があれば本文と checks を確認して URL を返す。本文の更新は依頼された場合だけ行う
- PR のファイル差分がなければ新規作成せず、その旨を返す。取得失敗を差分なしと扱わない

対象 SHA を控え、変更ファイルの diff と、含まれるマージ済み PR の本文を必要な範囲で読む。過去のリリース PR の本文をコピーせず、今回の差分から利用者に伝わる単位で要約する。

## 検証状況と適用手順

開発環境の配置状況は、今回の `develop` の SHA に絞って確認する。以下の `<develop-sha>` は取得した SHA に置き換える。

```sh
gh run list --repo kokoichi206/life-console --workflow deploy.yml --branch develop --commit <develop-sha> --limit 5 --json status,conclusion,headSha,url
```

検証の根拠は対象 SHA と run / PR の URL を対応させる。過去の別 SHA の成功を今回の成功としない。配置 workflow の成功と、開発環境での実操作確認は区別する。実操作が未確認なら未確認と記載する。

差分に migration・Terraform・環境変数・Mac runner の変更があれば、必要な適用手順を本文に書く。SQL 適用後に配信が切り替わるため、migration と稼働中コードの互換性を確認する。GitHub Actions は Mac runner を更新しないので、runner の差分を本番へ自動反映済みと書かない。

PR 作成だけなら、別のローカル作業ツリーで `pnpm check` を実行してリリース対象の検証結果に置き換えない。自分でコードを修正する依頼もある場合は、その変更に必要な検証を [AGENTS.md](../../../AGENTS.md) に従って行う。

## PR の作成

タイトルは `リリース YYYY-MM-DD` とし、日付指定がなければ作成時の日本時間を使う。通常 PR と同じく日本語と半角英数字の間に半角スペースを入れる。

本文は PR テンプレートに沿って、目的、主な変更、検証状況、必要な適用手順を書く。任意の空欄や説明用 HTML コメントは残さず、チェックリストは実施した項目だけチェックする。関連 PR はリンクし、集約時に Issue を意図せず閉じる `Closes` / `Fixes` は付けない。

本文は一時ファイルに実際の改行で保存し、`--body-file` で渡す。`--fill` によるコミット一覧だけの本文や、空のテンプレートの投稿は避ける。

作成直前に、既存 PR とリモートの `main` / `develop` の SHA を再確認する。対象が進んでいたら差分と本文を更新してから作成する。

```sh
gh pr create --repo kokoichi206/life-console --base main --head develop --title 'リリース YYYY-MM-DD' --body-file <body-file>
```

`--head develop` を明示し、現在の作業ブランチを誤って公開しない。作成結果が不明な場合は既存 PR を再取得してから再試行し、重複投稿を避ける。

## 作成後の確認と報告

作成した PR 番号を指定して確認する。

```sh
gh pr view <number> --repo kokoichi206/life-console --json url,title,body,baseRefName,headRefName,headRefOid,mergeable,mergeStateStatus
gh pr checks <number> --repo kokoichi206/life-console
```

base / head と SHA、本文を照合する。checks の未登録・実行中を成功とせず、成功・失敗・未確認を分ける。CI 待機の依頼があれば完了まで確認する。失敗時に workflow を勝手に再実行しない。

最終報告は PR の URL、主なリリース内容、CI の状況、必要な手作業を簡潔に示す。PR 作成時点では本番反映済みと報告しない。
