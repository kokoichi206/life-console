# ネイティブクライアント

`clients/` は Life Console のネイティブクライアントの置き場です。Web クライアントは `apps/web` に置きます。

`apps/` と `packages/` は pnpm workspace で管理し、`clients/` は各プラットフォームのビルドツールで管理します。`pnpm check` はネイティブクライアントのビルド・検証を含みません。

- [Android](android/README.md): 体重グラフ・ごみ収集予定を表示するウィジェットと、体重・食事の入力 URL を開くウィジェット。Gradle でビルド・検証します。
