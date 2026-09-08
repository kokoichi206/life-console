module "database" {
  source        = "../../modules/services/d1-database"
  account_id    = var.cloudflare_account_id
  database_name = local.database_name
}

module "meal_photos" {
  source      = "../../modules/services/meal-photo-storage"
  account_id  = var.cloudflare_account_id
  bucket_name = local.photo_bucket_name
}

module "owner_policy" {
  source      = "../../modules/platform/owner-policy"
  account_id  = var.cloudflare_account_id
  policy_name = "Life Console owner"
  owner_email = var.owner_email
}

module "owner_access" {
  source                     = "../../modules/services/owner-access"
  account_id                 = var.cloudflare_account_id
  worker_id                  = var.access_worker_id
  application_name           = "Life Console"
  owner_policy_id            = module.owner_policy.policy_id
  http_only_cookie_attribute = false
}

module "runner_access" {
  source           = "../../modules/services/runner-access"
  account_id       = var.cloudflare_account_id
  worker_hostname  = local.worker_hostname
  service_token_id = var.runner_service_token_id
}
