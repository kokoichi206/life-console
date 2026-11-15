mock_provider "cloudflare" {}
override_resource {
  target          = cloudflare_zero_trust_access_policy.health_share
  override_during = plan
  values          = { id = "00000000-0000-0000-0000-000000000003" }
}
variables {
  account_id      = "00000000000000000000000000000000"
  worker_hostname = "life-console.test-account.workers.dev"
}
run "only_share_and_static_assets_bypass_access" {
  command = plan
  module {
    source = "../../modules/services/health-share-access"
  }
  assert {
    condition = toset([for destination in cloudflare_zero_trust_access_application.health_share.destinations : destination.uri]) == toset([
      "life-console.test-account.workers.dev/share/health/*",
      "life-console.test-account.workers.dev/api/v1/share/*",
      "life-console.test-account.workers.dev/assets/*",
      "life-console.test-account.workers.dev/icons/*",
      "life-console.test-account.workers.dev/manifest.webmanifest",
    ])
    error_message = "本人用・runner 用の経路へ bypass を広げないでください。"
  }
  assert {
    condition     = cloudflare_zero_trust_access_policy.health_share.decision == "bypass" && length(cloudflare_zero_trust_access_policy.health_share.include) == 1 && one(cloudflare_zero_trust_access_policy.health_share.include).everyone != null
    error_message = "共有経路はログイン不要とし、API の共有トークンで認証してください。"
  }
}
