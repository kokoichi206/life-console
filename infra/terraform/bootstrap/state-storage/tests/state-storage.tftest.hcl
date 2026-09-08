mock_provider "cloudflare" {}

run "state_storage_configuration" {
  command = plan
}
