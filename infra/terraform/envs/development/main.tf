module "database" {
  source        = "../../modules/services/d1-database"
  account_id    = local.cloudflare_account_id
  database_name = local.database_name
}

module "meal_photos" {
  source      = "../../modules/services/meal-photo-storage"
  account_id  = local.cloudflare_account_id
  bucket_name = local.photo_bucket_name
}

module "owner_policy" {
  source      = "../../modules/platform/owner-policy"
  account_id  = local.cloudflare_account_id
  policy_name = "Life Console development owner"
  owner_email = var.owner_email
}

module "owner_access" {
  source                     = "../../modules/services/owner-access"
  account_id                 = local.cloudflare_account_id
  worker_id                  = module.worker.worker_id
  application_name           = "life-console-development - Cloudflare Workers"
  owner_policy_id            = module.owner_policy.policy_id
  http_only_cookie_attribute = true
}

module "worker" {
  source      = "../../modules/services/worker"
  account_id  = local.cloudflare_account_id
  worker_name = local.worker_name
}
