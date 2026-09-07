# Web

Vite + React、TanStack Router / Query、Tailwind CSS、shadcn 形式の共通 UI を使用します。UI primitive は現在 Base UI です。

## 配置

```text
src/
  pages/
    dashboard/
    work/
      TasksPage.tsx
      TasksPage.stories.tsx
      queries.ts
      work-search.ts
      work-search.test.ts
      _components/              受信箱、返信案、タスク一覧
    health/
      HealthPage.tsx
      HealthPage.test.tsx
      HealthPage.stories.tsx
      queries.ts
      meal-photo.ts
      _components/WeightTrendChart.tsx
    finance/
    operations/
  features/
    jobs/                       仕事と同期画面で使う実行状況
    repositories/               複数ページで使うリポジトリ query
    overview/                   ホームと同期画面で使う概要 query
  components/                   複数ページで使う部品
    ui/                         共通 UI と stories
  env/                          公開環境変数の検証
```

ページ内だけで使う部品・query・テスト・stories は、そのページの隣に置きます。複数のページで実際に使うものだけ features / components へ移します。先に共通化用の空ディレクトリや再 export 専用ファイルは作りません。

`router.tsx` は URL、遷移時の loader、共通レイアウトを担当します。各ページの queryKey は配置変更前と同じで、フィルター切り替えでもアプリ全体を再作成しません。

## 開発

ルートから `pnpm dev` で Web と API を起動します。Web は 5173、API は 8788 です。公開環境変数は `.env.development` と `.env.production` の `VITE_APP_ENV`。追加する場合は `src/env` の Zod schema でも検証してください。

## Storybook

```sh
pnpm storybook
pnpm storybook:build
pnpm storybook:test
```

開発画面は <http://localhost:6006>。初回のブラウザテストには `pnpm --filter @life-console/web exec playwright install chromium` が必要です。

共通 UI、健康、仕事の受信箱、実行状況の stories を部品やページの隣に置いています。テーマの toolbar で light / dark を切り替えられます。空の状態、取得失敗、結果不明も確認できます。

Storybook では MSW が架空の応答を返します。未定義の API 操作は 501 とし、アプリ用の API proxy は無効にしています。会話、メール、体重などの実データや外部サービスの認証は使いません。生成された Service Worker は `.storybook/public` に置き、アプリの配信物には含めません。

Vitest Browser Mode で stories を実際に描画し、play の操作とアクセシビリティ検査を行います。`pnpm check` に静的ビルドとブラウザテストも含めています。共通 UI を追加して story を忘れた場合は ESLint が失敗します。

`src/styles.css` は Tailwind の読込、テーマの CSS 変数、ベーススタイルを持ちます。ページごとのスタイルをまとめる場所ではありません。
