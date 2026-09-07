---
name: github-task-promotion
description: Life Console のタスクを GitHub Issue または private Project へ一方向に昇格する。
---

# GitHub task promotion

Life Console の task ID、タスク本文、昇格先が prompt で渡されたときだけ使う。

1. `git remote get-url origin` と `gh repo view --json nameWithOwner,url` で対象を確認する。
2. Issue 本文に Life Console task ID とダッシュボードへの逆リンクを記載する。個人情報や元会話本文は転記しない。
3. `gh issue create` で Issue を一つ作る。再実行時は同じ Life Console task ID を検索して重複作成しない。
4. private Project への昇格が指定された場合だけ、非公開設定の owner と project number を使って `gh project item-add` を実行する。設定がなければ失敗として報告する。
5. 双方向同期は作らない。GitHub 側の更新を Life Console へ書き戻さない。
6. prompt にある report command で成功または失敗を明示的に返す。
