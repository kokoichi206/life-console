mock_provider "cloudflare" {}

variables {
  cloudflare_account_id   = "00000000000000000000000000000000"
  access_application_name = "life-console-development"
  access_owner_policy_id  = "00000000-0000-0000-0000-000000000001"
  access_worker_id        = "11111111111111111111111111111111"
  access_session_duration = "24h"
}

run "environment_storage_names" {
  command = plan

  assert {
    condition     = module.database.database_name == "life-console-development"
    error_message = "D1 がこの環境のデータベース名と一致しません。"
  }

  assert {
    condition     = output.cloudflare_r2_bucket_name == "life-console-development-meal-photos"
    error_message = "写真保存先がこの環境の R2 bucket と一致しません。"
  }
}
