# GitHub Actions の検査

[ci-github-workflows](workflows/ci-github-workflows.yml) は `.github/workflows/` と `.github/scripts/` の変更を含む `develop` / `main` 向け PR・両ブランチへの push、手動実行で動きます。

- zizmor `1.30.0`: action の SHA 固定、token の権限、shell への式の直接展開、checkout の認証情報保持などを検査。結果は annotation に出力します。
- `scripts/lint-workflows.py`: workflow 名とファイル名の一致、各 job の `timeout-minutes`、空でない step 名、step 間の空行を検査。reusable workflow を呼ぶ job は `timeout-minutes` を指定できないため対象外です。

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
