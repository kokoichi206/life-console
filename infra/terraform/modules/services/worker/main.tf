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

# コード・Cron・公開 URL の管理を移し、稼働中の Worker は削除しない。
removed {
  from = cloudflare_workers_script.app
  lifecycle {
    destroy = false
  }
}

removed {
  from = cloudflare_workers_cron_trigger.app
  lifecycle {
    destroy = false
  }
}

removed {
  from = cloudflare_workers_script_subdomain.app
  lifecycle {
    destroy = false
  }
}
