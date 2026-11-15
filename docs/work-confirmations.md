# PR・Issue の本人確認待ち

## 目的と役割

『仕事』の『自分の確認待ち』に、本人のレビュー・方針判断・マージ確認が必要な依頼を集める。通知だけでは判断材料が足りず、GitHub を探し直すことになるため、何を判断するかと根拠を同じ画面に置く。

GitHub は PR・Issue の状態の管理元。Orca の巡回は既存の PR・Issue を確認し、本人に依頼すべきものを選んで送る。Life Console は依頼を保存し、本人が次に行うことを表示する。既存の agent への質問・回答とは別の記録で、ここから agent への回答送信や GitHub のマージ・クローズは行わない。

| 表示する情報 | 判断に使う目的 |
| --- | --- |
| 行動の見出し、種類、要約 | レビュー・判断・マージ確認のどれを行うか把握 |
| リポジトリ、元の PR・Issue、対象環境 | 操作対象と影響先を特定 |
| 確認してほしいこと、本人が必要な理由 | 何への回答・操作を求められているか確認 |
| 推奨案 | 判断の出発点を示す。空なら推奨案なしと表示 |
| 確認済み・未確認の根拠、参照リンク | 確認できた範囲と残る不確実さを区別 |
| 依頼時刻、対象確認時刻、取得元、最終同期 | 古い観測を現在の GitHub の状態と混同しない |
| 対応済み時刻と記録者 | 本人の記録か、取得元の解消確認かを区別 |

最終同期は Life Console が取り込みに成功した時刻であり、全 PR・Issue の巡回完了を保証しない。対象確認時刻は取得元がその依頼を確認した時刻。

PC では一覧と詳細を並べる。スマホでは一覧から詳細へ進み、『一覧に戻る』で戻る。状態・リポジトリの絞り込みと選択 ID は URL に保持する。『GitHub で確認』から元の画面を開き、操作後は『対応済みとして記録』で本人の確認待ちを外す。元の PR・Issue の状態は変えない。

## Orca からの取り込み

`POST /api/v1/runner/work-confirmations/import` を既存の runner 認証で呼ぶ。

- `Authorization: Bearer <RUNNER_TOKEN>`
- クラウドでは Cloudflare Access の Service Auth も必要。`CF-Access-Client-Id` と `CF-Access-Client-Secret` を付ける
- 認証値はローカル環境の資格情報として管理し、巡回の成果物やログへ出さない

[接続設定](operations.md#外部サービスとファイル連携)と同じ認証を使う。ローカル開発だけは `local-runner-token` を使用できる。

以下は架空の入力例。1 回につき最大 50 件、根拠は依頼ごとに最大 20 件。

```json
{
  "sourceId": "shodan-dev-patrol",
  "sourceLabel": "shodan-pro の dev 巡回",
  "confirmations": [
    {
      "externalId": "pr-123-review-request-20261002T024000Z",
      "repositoryName": "example/project",
      "sourceUrl": "https://github.com/example/project/pull/123",
      "kind": "review",
      "title": "修正 PR の差分をレビューする",
      "summary": "修正と検証が済み、本人へのレビュー依頼が届いています。",
      "environment": "dev",
      "question": "この変更で問題ないか、差分をレビューしてください。",
      "reason": "本人宛てのレビュー依頼があるためです。",
      "recommendation": "変更箇所と回帰テストを確認し、GitHub でレビューを返す。",
      "evidence": [
        {
          "state": "confirmed",
          "title": "差分を確認",
          "detail": "架空の結果です。",
          "url": "https://github.com/example/project/pull/123/files"
        },
        {
          "state": "unconfirmed",
          "title": "配置後の動作",
          "detail": "この例では未配置です。",
          "url": null
        }
      ],
      "requestedAt": "2026-10-02T02:40:00Z",
      "checkedAt": "2026-10-02T03:00:00Z",
      "status": "pending"
    }
  ]
}
```

成功は `200 {"data":null}`。入力不正は `400`、runner 認証失敗は `401`、保存失敗は `500`。保存と通知キューの作成は同じトランザクションで処理し、成功応答後の通知失敗は依頼の保存を取り消さない。

`sourceId + externalId` は一度の確認依頼の識別子。同じ依頼の再送・観測更新では同じ値を使う。更新には前回より新しい `checkedAt` が必要で、同じ時刻と古い時刻の入力は既存の内容を変えない。更新では表示内容を差し替えられるが、通知は追加しない。

本人の対応済み記録と取得元の解消記録は、後から届く `pending` で再開しない。もう一度確認してほしい場合は、新しい `externalId` で別の依頼を送る。同じ PR・Issue に複数の依頼履歴を残せる。

取得元が解消を確認したときは、新しい `checkedAt` と `status: "done"` を送る。PR が検索結果から抜けた、バッチに含まれなかった、巡回に失敗した、という理由だけで解消扱いにしない。空の `confirmations` は同期成功時刻だけを更新する。

本人画面用の API は `GET /api/v1/work-confirmations` と `POST /api/v1/work-confirmations/:id/complete`。クラウドでは既存の本人用 Access 認証を使う。

## 通知と再送

既存の Web Push 設定と端末登録を使う。新規の未対応依頼を保存した時点の登録端末ごとに送信待ちを保存し、取り込み後と既存の毎分 Cron で送る。1 回に最大 5 件、送信の lease は 60 秒。失敗は 60 秒から最大 1 時間の間隔で再試行する。送信先の失効時は購読を削除する。

通知本文は『自分の確認待ちに新しい依頼があります。』に固定し、リポジトリ名や判断内容をロック画面へ載せない。通知を押すと `/tasks?view=confirmations&confirmationId=<id>` を開く。既存の実行状況通知は引き続き `/operations` を開く。

二重実行は lease で排他する。ただし通知サービスの受付直後、保存前に実行が停止すると再送される可能性がある。同じ依頼は同じ通知 tag を使う。対応済みの未送信通知はキャンセルするが、既に外部へ送信中の通知は取り消せない。

Web Push 未設定・端末未登録でも依頼は画面に残る。未設定時は外部送信しない。通知失敗が残る場合は画面に再送待ちの件数を表示する。件数は端末ごとの通知件数で、依頼件数とは異なる。

## この変更の範囲

Life Console の受信 API・保存・画面・通知処理を実装する。Orca の既存巡回の設定、GitHub のトリアージ条件、実際の送信処理は別途接続が必要。本人確認が必要という判断自体を Life Console が行うわけではない。

本番へ適用する際は migration とアプリを配備し、Orca 側から本人に対応が必要な PR・Issue を上記 API へ送る。実際の取り込み、通知受信、GitHub での対応後の解消送信まで確認する。
