locals {
  worker_name       = "life-console"
  database_name     = "life-console"
  photo_bucket_name = "life-console-meal-photos"
  worker_hostname   = "${local.worker_name}.${var.workers_subdomain}.workers.dev"
}
