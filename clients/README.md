# ネイティブクライアント

`clients/` は Life Console のネイティブクライアントの置き場です。Web クライアントは `apps/web` に置きます。

`apps/` と `packages/` は pnpm workspace で管理し、`clients/` は各プラットフォームのビルドツールで管理します。`pnpm check` はネイティブクライアントのビルド・検証を含みません。

- [Android](android/README.md): 撮影・背景ぼかし・保存ができる食事記録アプリと、体重グラフ・ごみ収集予定・記録入口のウィジェット。Gradle でビルド・検証します。
