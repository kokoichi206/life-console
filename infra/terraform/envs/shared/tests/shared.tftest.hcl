mock_provider "cloudflare" {}
variables {
  cloudflare_account_id    = "00000000000000000000000000000000"
  owner_email              = "owner@example.com"
  access_owner_policy_name = "Owner only"
}
run "shared_configuration" { command = plan }
