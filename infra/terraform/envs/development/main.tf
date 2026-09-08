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

module "owner_access" {
  source                     = "../../modules/services/owner-access"
  account_id                 = var.cloudflare_account_id
  worker_id                  = var.access_worker_id
  application_name           = var.access_application_name
  owner_policy_id            = var.access_owner_policy_id
  session_duration           = var.access_session_duration
  http_only_cookie_attribute = true
}
