locals {
  workers_subdomain     = "kokoichi206"
  cloudflare_account_id = "bc003a008ecb84ab15327f6ffe1c558f"
  worker_name           = "life-console"
  database_name         = "life-console"
  photo_bucket_name     = "life-console-meal-photos"
  worker_hostname       = "${local.worker_name}.${local.workers_subdomain}.workers.dev"
}
