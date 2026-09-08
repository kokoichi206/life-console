mock_provider "cloudflare" {}

variables {
  account_id        = "00000000000000000000000000000000"
  worker_name       = "life-console-development"
  environment       = "development"
  database_id       = "00000000-0000-0000-0000-000000000001"
  photo_bucket_name = "life-console-development-meal-photos"
}

run "preserve_authentication_and_api_routing" {
  command = plan

  module {
    source = "../../modules/services/worker"
  }

  assert {
    condition     = cloudflare_workers_script.app.keep_bindings == toset(["secret_text"])
    error_message = "既存の runner と Web Push の秘密値を保持してください。"
  }

  assert {
    condition     = length(cloudflare_workers_script.app.assets.config.run_worker_first) == 1 && one(cloudflare_workers_script.app.assets.config.run_worker_first) == "/api/*" && cloudflare_workers_script.app.assets.config.not_found_handling == "single-page-application"
    error_message = "API の実行経路と SPA の配信設定を維持してください。"
  }

  assert {
    condition     = cloudflare_workers_script_subdomain.app.enabled && !cloudflare_workers_script_subdomain.app.previews_enabled
    error_message = "公開 URL とプレビュー URL の設定を維持してください。"
  }
}
