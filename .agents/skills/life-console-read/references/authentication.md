# 接続設定

接続先の環境・Cloudflare アカウント・D1・写真用 R2 bucket を確認してから設定する。実際の資格情報は shell や secret store から環境変数で渡す。token や key をチャット、Git、PR、テスト用 fixture に貼らない。

| 環境変数 | 用途 |
| --- | --- |
| `LIFE_CONSOLE_ACCOUNT_ID` | D1 と R2 を持つ Cloudflare アカウント |
| `LIFE_CONSOLE_D1_DATABASE_ID` | 読み取る環境の D1 ID |
| `LIFE_CONSOLE_D1_READ_TOKEN` | D1 のデータ読み取り専用 token |
| `LIFE_CONSOLE_R2_BUCKET` | 食事写真の bucket 名。`--photos` で必要 |
| `LIFE_CONSOLE_R2_READ_ACCESS_KEY_ID` | 対象 bucket の Object Read only 資格情報。`--photos` で必要 |
| `LIFE_CONSOLE_R2_READ_SECRET_ACCESS_KEY` | 上記の Secret Access Key。`--photos` で必要 |

D1 は Cloudflare のクエリ API、R2 は `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` の S3 互換 API を使う。現行 Life Console の通常 bucket を対象とする。別 jurisdiction の bucket へ移行する際は endpoint を実装と合わせて更新する。

デプロイ用・管理用の書き込み資格情報を流用せず、専用の読み取り資格情報を使う。D1 API が要求する権限と、発行画面で選べる資源範囲は [Cloudflare のクエリ API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/) と [権限の公式資料](https://developers.cloudflare.com/workers/authorization/) で確認する。テーブル単位に権限が限定されているとは扱わない。

R2 の [Object Read only](https://developers.cloudflare.com/r2/api/tokens/) は対象 bucket に限定する。既存 AWS profile やデプロイ用 key には依存せず、上記の専用環境変数を明示的に使う。

読み取り権限は Cloudflare 側で制限する。skill の指示や固定 SELECT だけを、書き込み権限を無効化した根拠にしない。写真の公開設定、公開 URL、Life Console の共有 token は不要。

## 結果の保管

既定の保存先はリポジトリ外の `~/.cache/life-console-read/`。実行ごとに新しいサブディレクトリを作る。`--output-dir` で親ディレクトリを指定できるが、本人の記録と写真を Git 管理下に保存しない。

R2 の取得が途中で失敗するとコマンドは非ゼロで終了し、成功の summary や `records.json` は出さない。その実行で取得済みの画像が cache に残る場合がある。削除は本人が指定した範囲で行う。
