locals {
  worker_bundle = "${path.module}/../../../../../apps/api/dist/index.js"
  web_assets    = "${path.module}/../../../../../apps/web/dist"
}

resource "cloudflare_workers_script" "app" {
  account_id          = var.account_id
  script_name         = var.worker_name
  main_module         = "index.js"
  content_file        = local.worker_bundle
  content_sha256      = filesha256(local.worker_bundle)
  compatibility_date  = "2026-09-01"
  compatibility_flags = ["nodejs_compat"]
  usage_model         = "standard"
  logpush             = false
  tail_consumers      = []

  # 既存の runner・Web Push の秘密値を state へ取り込まず、配置時も保持する。
  keep_bindings = ["secret_text"]
  bindings = [
    { name = "APP_ENV", type = "plain_text", text = var.environment },
    { name = "ASSETS", type = "assets" },
    { name = "DB", type = "d1", id = var.database_id, database_id = var.database_id },
    { name = "MEAL_PHOTOS", type = "r2_bucket", bucket_name = var.photo_bucket_name },
    { name = "PHOTO_UPLOAD_MODE", type = "plain_text", text = "worker" },
  ]

  assets = {
    directory = local.web_assets
    config = {
      not_found_handling = "single-page-application"
      run_worker_first   = ["/api/*"]
    }
  }

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

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_workers_cron_trigger" "app" {
  account_id  = var.account_id
  script_name = cloudflare_workers_script.app.id
  schedules   = [{ cron = "* * * * *" }]

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_workers_script_subdomain" "app" {
  account_id       = var.account_id
  script_name      = cloudflare_workers_script.app.id
  enabled          = true
  previews_enabled = false

  lifecycle {
    prevent_destroy = true
  }
}
