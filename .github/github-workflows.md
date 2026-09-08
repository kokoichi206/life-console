<!-- .github/README.md はルートの README.md より優先して表示されるため、このファイル名を使う。 -->

# GitHub のテンプレートと CI

## PR・Issue テンプレート

- [PR](PULL_REQUEST_TEMPLATE.md): 目的、変更内容、検証結果を記載します。関連 Issue、画面の変更、レビュー時の補足は任意です。
- [機能追加・改善](ISSUE_TEMPLATE/01_feature.md): 困っていること、実現したいこと、完了条件を整理します。
- [技術的課題](ISSUE_TEMPLATE/02_technical_problem.md): 現状の課題、対応する理由、完了条件を整理します。
- [不具合報告](ISSUE_TEMPLATE/03_bug.md): 発生環境、再現手順、期待する挙動を記録します。

Markdown 形式なので、不要な任意の節は削除できます。ラベルや担当者は自動設定しません。

GitHub の作成画面で使うには、テンプレートをデフォルトブランチへ反映する必要があります（[GitHub の仕様](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates)）。

## GitHub Actions の検査

[ci](workflows/ci.yml) の `Quality checks` と [deploy](workflows/deploy.yml) の配置前検査は、AI ハーネス、migration、lint、型検査、Vitest、Web / API / runner の各ビルド、Storybook のビルドとブラウザテストを個別の step で実行します。Chromium はブラウザテストの直前に準備し、それ以前の検査が失敗したら準備を省きます。step は順次実行です。

ローカルの一括確認には `pnpm check` を使います。検査を追加・変更するときは `package.json` の `check` / `build` と両 workflow の検査内容を揃えてください。

[ci-github-workflows](workflows/ci-github-workflows.yml) は `.github/workflows/` と `.github/scripts/` の変更を含む `develop` / `main` 向け PR・両ブランチへの push、手動実行で動きます。

- zizmor `1.30.0`: action の SHA 固定、token の権限、shell への式の直接展開、checkout の認証情報保持などを検査。結果は annotation に出力します。
- `scripts/lint-workflows.py`: workflow 名とファイル名の一致、各 job の `timeout-minutes`、空でない step 名、step 間の空行を検査。reusable workflow を呼ぶ job は `timeout-minutes` を指定できないため対象外です。

zizmor 本体を更新するときは、固定した `zizmor-action` の `support/versions` にそのバージョンが含まれることを確認してください。Action は同ファイルに登録されたコンテナだけを実行します。

ローカルでは [uv](https://docs.astral.sh/uv/) を用意し、リポジトリルートで実行します。Python の依存はスクリプトに固定しています。

```bash
uv run --script .github/scripts/lint-workflows.py --test
uv run --script .github/scripts/lint-workflows.py
uvx zizmor==1.30.0 --offline .github/workflows/
```

CI は GitHub token を用いて online audit も実行します。ローカルでも online audit を行う場合は `GH_TOKEN` を設定し、`--offline` を外してください。`gh` の token を使う場合は次のコマンドで実行できます。

```bash
GH_TOKEN="$(gh auth token)" uvx zizmor==1.30.0 .github/workflows/
```

[aip-pro-labo の workflow](https://github.com/Wareware-PJ/aip-pro-labo/blob/develop/.github/workflows/ci-github-workflows.yml) を参考にしています。規約の検査は macOS でも同じコマンドで動く Python 実装にし、YAML パーサーの位置情報から行番号を出します。参照先固有の zizmor 除外設定は移植していません。
