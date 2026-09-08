module "state_storage" {
  source     = "../../modules/platform/state-storage"
  account_id = var.cloudflare_account_id
}
