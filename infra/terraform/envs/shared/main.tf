module "owner_policy" {
  source      = "../../modules/platform/owner-policy"
  account_id  = var.cloudflare_account_id
  policy_name = var.access_owner_policy_name
  owner_email = var.owner_email
}
module "state_storage" {
  source     = "../../modules/platform/state-storage"
  account_id = var.cloudflare_account_id
}
