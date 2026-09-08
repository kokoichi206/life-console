mock_provider "cloudflare" {}

variables {
  owner_email             = "owner@example.com"
  workers_subdomain       = "test-account"
  runner_service_token_id = "00000000-0000-0000-0000-000000000002"
  cloudflare_account_id   = "00000000000000000000000000000000"
  access_worker_id        = "11111111111111111111111111111111"
}

run "environment_storage_names" {
  command = plan

  assert {
    condition     = module.database.database_name == "life-console"
    error_message = "D1 がこの環境のデータベース名と一致しません。"
  }

  assert {
    condition     = output.cloudflare_r2_bucket_name == "life-console-meal-photos"
    error_message = "写真保存先がこの環境の R2 bucket と一致しません。"
  }
}
