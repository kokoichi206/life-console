mock_provider "cloudflare" {}

variables {
  cloudflare_account_id = "00000000000000000000000000000000"
}

run "state_storage_configuration" {
  command = plan
}
