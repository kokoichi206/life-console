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

## ルーティング

- 各 `createRoute` は定数にしてから `addChildren` に渡します。配列内で直接生成すると型が `any` に広がる場合があり、`Register` の登録があっても不正な遷移先を検出できなくなります。
- 内部遷移は `Link` / `useNavigate` を使います。ページ内で search を引き継ぐ `Link` は `from` を指定し、コールバックの型はルーターから推論させます。
- `validateSearch` は URL の入力を検証し、`search.strict: true` で検証結果にない項目を URL と画面の状態から除去します。パーサーの戻り値から省くだけでは、元の不正な値が保持されます。パラメーターを消す操作には `undefined` を使うため、任意項目の型も明示的な `undefined` を許可します。常設フォームへのリンクは hash を使います。
- ページは `lazyRouteComponent` で分割し、リンクの事前読み込みでコードも取得します。Query を使う loader では `ensureQueryData` を呼び、`defaultPreloadStaleTime: 0` でキャッシュの制御を Query に任せます。
- 未定義の URL はホームへ戻れる 404 画面にします。取得エラーは Query のエラー状態をリセットし、`router.invalidate()` で再試行します。

Web の `build` は型チェック後に Vite を実行します。`router.test-d.tsx` は型チェック専用で、存在しない path・不正な search・hook の対象ルートを `@ts-expect-error` で検証します。型の制約が抜けると、期待したエラーが消えたこと自体で失敗します。

仕事の Storybook は実アプリの `search` 設定を使い、不正な search を含む URL の初期表示も検証します。React の `RouterProvider` が表示前に URL を正規化する経路を通し、`search.strict` を外すとブラウザテストが失敗します。

参考: [型安全性](https://tanstack.com/router/latest/docs/guide/type-safety)、[ページの事前読み込み](https://tanstack.com/router/latest/docs/api/router/lazyRouteComponentFunction)、[外部キャッシュ連携](https://tanstack.com/router/latest/docs/guide/data-loading)、[Query のエラー処理](https://tanstack.com/router/latest/docs/guide/external-data-loading)。

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
