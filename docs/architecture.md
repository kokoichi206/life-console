# アーキテクチャ

```mermaid
flowchart TB
  web["PC / スマホ: React"]

  subgraph cloud["Cloudflare"]
    api["Workers: Hono API / Web 配信"]
    db[("D1: 記録・会話・タスク・job")]
    photos[("R2: 食事写真")]
    api <--> db
    api <--> photos
  end

  subgraph mac["本人の Mac"]
    runner["runner"]
    cli["サービス別 CLI / Claude Code / Orca"]
    runner --> cli
  end

  web <-->|"Access 認証"| api
  runner <-->|"job の取得・結果報告"| api
```

記録と写真の保存は Cloudflare で完結するため、Mac が止まっていても使えます。外部サービスとの同期や AI の実行は Mac の runner が担当し、各サービスの資格情報をローカルに保持します。

同期・送信・agent 起動は job として処理し、実行経過と結果を Web で確認できます。定期実行は D1 のスケジュールと Cloudflare Cron で管理。runner や外部 CLI の異常・復旧は Web Push で通知します。
