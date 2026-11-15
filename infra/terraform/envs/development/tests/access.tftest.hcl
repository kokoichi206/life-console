mock_provider "cloudflare" {}
variables {
  account_id                 = "00000000000000000000000000000000"
  application_name           = "test-worker"
  worker_id                  = "11111111111111111111111111111111"
  owner_policy_id            = "00000000-0000-0000-0000-000000000001"
  http_only_cookie_attribute = true
}
run "protect_existing_worker_with_environment_policy" {
  command = plan

  module {
    source = "../../modules/services/owner-access"
  }
  assert {
    condition     = length(cloudflare_zero_trust_access_application.worker.destinations) == 1 && one(cloudflare_zero_trust_access_application.worker.destinations).type == "worker" && one(cloudflare_zero_trust_access_application.worker.destinations).worker_id == var.worker_id
    error_message = "既存 Worker の ID による保護を維持してください。"
  }
  assert {
    condition     = length(cloudflare_zero_trust_access_application.worker.policies) == 1 && one(cloudflare_zero_trust_access_application.worker.policies).id == var.owner_policy_id
    error_message = "この環境の本人ポリシーだけを参照してください。"
  }
  assert {
    condition     = cloudflare_zero_trust_access_application.worker.oauth_configuration.enabled && cloudflare_zero_trust_access_application.worker.oauth_configuration.dynamic_client_registration.enabled && cloudflare_zero_trust_access_application.worker.oauth_configuration.dynamic_client_registration.allow_any_on_loopback && !cloudflare_zero_trust_access_application.worker.oauth_configuration.dynamic_client_registration.allow_any_on_localhost && length(cloudflare_zero_trust_access_application.worker.oauth_configuration.dynamic_client_registration.allowed_uris) == 0
    error_message = "Chrome 認証の戻り先は端末内の loopback に限定してください。"
  }
  assert {
    condition     = cloudflare_zero_trust_access_application.worker.oauth_configuration.grant.session_duration == "24h" && cloudflare_zero_trust_access_application.worker.oauth_configuration.grant.access_token_lifetime == "15m"
    error_message = "本人用セッションの上限を延ばさず、短い access token を更新してください。"
  }

}
