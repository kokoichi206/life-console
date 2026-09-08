# 既存環境は Worker 本体を取り込み、新規環境は通常の create に進む。
import {
  for_each = nonsensitive(var.access_worker_id == null) ? toset([]) : toset(["existing"])
  to       = module.worker.cloudflare_worker.app
  id       = "${local.cloudflare_account_id}/${var.access_worker_id}"
}
