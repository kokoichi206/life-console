module "state_storage" {
  source     = "../../modules/platform/state-storage"
  account_id = local.cloudflare_account_id
}
