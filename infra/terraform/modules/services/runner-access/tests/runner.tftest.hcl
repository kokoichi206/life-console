mock_provider "cloudflare" {}
override_resource {
  target          = cloudflare_zero_trust_access_policy.runner
  override_during = plan
  values          = { id = "00000000-0000-0000-0000-000000000001" }
}
variables {
  account_id       = "00000000000000000000000000000000"
  worker_hostname  = "life-console.test-account.workers.dev"
  service_token_id = "00000000-0000-0000-0000-000000000002"
}
run "service_auth_only_for_runner_path" {
  command = plan
  assert {
    condition     = length(cloudflare_zero_trust_access_application.runner.destinations) == 1 && one(cloudflare_zero_trust_access_application.runner.destinations).uri == "life-console.test-account.workers.dev/api/v1/runner/*"
    error_message = "機械認証を runner API 以外へ広げないでください。"
  }
  assert {
    condition     = cloudflare_zero_trust_access_policy.runner.decision == "non_identity" && length(cloudflare_zero_trust_access_policy.runner.include) == 1 && one(cloudflare_zero_trust_access_policy.runner.include).service_token.token_id == var.service_token_id && one(cloudflare_zero_trust_access_application.runner.policies).id == cloudflare_zero_trust_access_policy.runner.id
    error_message = "既存の専用 Service Token による認証条件を維持してください。"
  }
}
