INSERT OR IGNORE INTO repositories (
  id, name, local_path, archived_at, created_at, updated_at
) VALUES (
  'repo-demo-app', 'sample-app', '/path/to/private/sample-app', NULL,
  '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'
);

INSERT OR IGNORE INTO tasks (
  id, title, description, status, due_at, completed_at, conversation_id, created_at, updated_at
) VALUES
  (
    'task-review-dashboard', 'ダッシュボードの初期表示を確認する',
    '架空データで作成したローカル開発用タスクです。', 'todo',
    '2026-09-01T12:00:00.000Z', NULL, NULL,
    '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'
  ),
  (
    'task-organize-mention', '未処理メンションを分類する',
    'connector の分類フローを確認します。', 'inbox', NULL, NULL, 'conversation-demo-slack',
    '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'
  );

INSERT OR IGNORE INTO task_repositories (task_id, repository_id, role, created_at)
VALUES ('task-review-dashboard', 'repo-demo-app', 'work', '2026-09-01T00:00:00.000Z');

INSERT OR IGNORE INTO conversations (
  id, connector, source_id, external_message_id, author_label, excerpt,
  source_url, classification, occurred_at, recorded_at
) VALUES (
  'conversation-demo-slack', 'slack', 'workspace-demo/channel-demo', 'message-demo-1',
  '山田（サンプル）', '来週の公開前に表示内容を確認してください。',
  NULL, 'unprocessed', '2026-09-01T01:00:00.000Z', '2026-09-01T01:05:00.000Z'
);

INSERT OR IGNORE INTO connector_states (
  connector, source_id, watermark, last_success_at, next_run_at, last_error_code, updated_at
) VALUES
  ('slack', 'workspace-demo/channel-demo', 'message-demo-1', '2026-09-01T01:05:00.000Z', '2026-09-01T02:05:00.000Z', NULL, '2026-09-01T01:05:00.000Z'),
  ('chatwork', 'account-demo/room-demo', NULL, NULL, '2026-09-01T02:00:00.000Z', NULL, '2026-09-01T00:00:00.000Z');

INSERT OR IGNORE INTO weights (
  id, source, source_key, weight_grams, occurred_at, recorded_at, source_job_id, deleted_at
) VALUES
  ('weight-demo-1', 'csv', '2026-08-29', 68400, '2026-08-29T22:00:00.000+09:00', '2026-08-29T22:05:00.000+09:00', NULL, NULL),
  ('weight-demo-2', 'csv', '2026-08-30', 68100, '2026-08-30T22:00:00.000+09:00', '2026-08-30T22:05:00.000+09:00', NULL, NULL),
  ('weight-demo-3', 'manual', 'demo-2026-09-01', 67900, '2026-09-01T07:00:00.000+09:00', '2026-09-01T07:01:00.000+09:00', NULL, NULL);

INSERT OR IGNORE INTO finance_transactions (
  id, source, source_transaction_id, kind, amount_yen, category, payment_method,
  payee, occurred_at, recorded_at, source_job_id, deleted_at
) VALUES
  ('txn-demo-income', 'demo', 'income-2026-08', 'income', 420000, '給与', '振込', '架空企業', '2026-08-25T09:00:00.000+09:00', '2026-08-25T09:00:00.000+09:00', NULL, NULL),
  ('txn-demo-food', 'demo', 'expense-food-1', 'expense', 1280, '食費', 'カード', 'サンプル食堂', '2026-08-31T12:30:00.000+09:00', '2026-08-31T12:31:00.000+09:00', NULL, NULL),
  ('txn-demo-tools', 'demo', 'expense-tools-1', 'expense', 2400, '開発', 'カード', 'サンプルサービス', '2026-09-01T09:00:00.000+09:00', '2026-09-01T09:01:00.000+09:00', NULL, NULL);

INSERT OR IGNORE INTO asset_balances (
  id, account_name, asset_kind, amount_yen, occurred_at, recorded_at
) VALUES
  ('asset-demo-cash', '生活口座（サンプル）', 'cash', 850000, '2026-09-01T00:00:00.000+09:00', '2026-09-01T00:05:00.000+09:00'),
  ('asset-demo-investment', '積立口座（サンプル）', 'investment', 1250000, '2026-09-01T00:00:00.000+09:00', '2026-09-01T00:05:00.000+09:00'),
  ('asset-demo-debt', 'カード未払（サンプル）', 'debt', 80000, '2026-09-01T00:00:00.000+09:00', '2026-09-01T00:05:00.000+09:00');

INSERT OR IGNORE INTO schedules (
  id, name, job_kind, interval, timezone, next_run_at, coalescing,
  deadline_seconds, enabled, created_at, updated_at
) VALUES
  ('schedule-slack-demo', 'Slack 取込', 'slack_sync', 'hourly', 'Asia/Tokyo', '2026-09-01T02:00:00.000Z', 'skip_if_pending', 10800, 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
  ('schedule-chatwork-demo', 'Chatwork 取込', 'chatwork_sync', 'hourly', 'Asia/Tokyo', '2026-09-01T02:00:00.000Z', 'skip_if_pending', 10800, 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
  ('schedule-backup-demo', 'D1/R2 バックアップ', 'backup', 'weekly', 'Asia/Tokyo', '2026-09-06T18:00:00.000Z', 'skip_if_pending', 86400, 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
