mock_provider "cloudflare" {}

variables {
  owner_email = "owner@example.com"
}

run "bootstrap_without_existing_worker_or_build" {
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
