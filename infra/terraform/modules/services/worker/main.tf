resource "cloudflare_worker" "app" {
  account_id     = var.account_id
  name           = var.worker_name
  logpush        = false
  tail_consumers = []

  observability = {
    enabled            = true
    head_sampling_rate = 1
    logs = {
      enabled            = true
      invocation_logs    = false
      head_sampling_rate = 1
      persist            = true
    }
    traces = {
      enabled            = false
      head_sampling_rate = 1
      persist            = true
    }
  }

  subdomain = {
    enabled          = false
    previews_enabled = false
  }

  lifecycle {
    prevent_destroy = true
    # 初回は非公開で作り、以降の URL 設定は配信開始後の Wrangler に任せる。
    ignore_changes = [subdomain]
  }
}
