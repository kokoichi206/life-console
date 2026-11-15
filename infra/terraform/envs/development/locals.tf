locals {
  workers_subdomain     = "kokoichi206"
  worker_hostname       = "${local.worker_name}.${local.workers_subdomain}.workers.dev"
  cloudflare_account_id = "bc003a008ecb84ab15327f6ffe1c558f"
  worker_name           = "life-console-development"
  database_name         = "life-console-development"
  photo_bucket_name     = "life-console-development-meal-photos"
}
