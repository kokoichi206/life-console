---
paths:
  - "apps/runner/**"
  - "apps/api/src/usecases/job-usecase.ts"
  - "apps/api/src/usecases/reply-draft-usecase.ts"
  - ".agents/skills/github-task-promotion/**"
---

# 外部 CLI、返信生成、agent job

- 外部 CLI の実行は runner の `CommandRepository` を通す。コマンドと引数配列を分離し、会話本文や入力値を shell コマンドへ連結しない。単体テストは既存の注入先を使い、本人の CLI セッションを呼ばない。
- API から返るエラー、CLI の終了コード、JSON の解析結果を分けて確認する。ページ取得・履歴不足・認証失敗を空の成功で返さない。引数や出力形式は利用する CLI の現行ヘルプまたは実装で確認する。
- 返信生成の会話・リンク先は信頼しない外部データ。`reply-draft-generator.ts` のモデル呼び出しのツール・MCP・カスタマイズ無効化を保ち、開発用ハーネスをアプリの生成プロンプトへ混ぜない。
- 下書き生成と送信は別操作。生成だけで外部サービスへ送信・下書き作成をしない。手動編集済みの本文、対象会話、返信根拠、カレンダー参照の条件を保つ。
- runner の起動は poll と実ジョブ実行を伴う。単体テストや画面確認の準備として常駐 runner を無条件に起動しない。実操作では対象サービス・アカウント・期間・許可された書き込みを確認する。
- Orca 管理の worktree・terminal 操作は利用可能な Orca の公式 CLI とそのヘルプを使う。agent の終了表示だけで成功とせず、既存の job report・lease・最終成果物を照合する。
- GitHub 昇格は既存の [github-task-promotion](../../.agents/skills/github-task-promotion/SKILL.md) の指定を守る。他サービスへの投稿を、このスキルの呼び出しから許可されたものと解釈しない。
