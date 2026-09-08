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
  policy_name = "Life Console development owner"
  owner_email = var.owner_email
}

module "owner_access" {
  source                     = "../../modules/services/owner-access"
  account_id                 = var.cloudflare_account_id
  worker_id                  = var.access_worker_id
  application_name           = "life-console-development - Cloudflare Workers"
  owner_policy_id            = module.owner_policy.policy_id
  http_only_cookie_attribute = true
}

module "worker" {
  source            = "../../modules/services/worker"
  account_id        = var.cloudflare_account_id
  worker_name       = local.worker_name
  environment       = "development"
  database_id       = module.database.database_id
  photo_bucket_name = module.meal_photos.bucket_name

  # Worker の配置・公開より先に、本人の Access 保護を確定する。
  depends_on = [module.owner_access]
}
