mock_provider "cloudflare" {}
variables {
  account_id                 = "00000000000000000000000000000000"
  application_name           = "test-worker"
  worker_id                  = "11111111111111111111111111111111"
  owner_policy_id            = "00000000-0000-0000-0000-000000000001"
  session_duration           = "24h"
  http_only_cookie_attribute = true
}
run "protect_existing_worker_with_shared_policy" {
  command = plan
  assert {
    condition     = length(cloudflare_zero_trust_access_application.worker.destinations) == 1 && one(cloudflare_zero_trust_access_application.worker.destinations).type == "worker" && one(cloudflare_zero_trust_access_application.worker.destinations).worker_id == var.worker_id
    error_message = "既存 Worker の ID による保護を維持してください。"
  }
  assert {
    condition     = length(cloudflare_zero_trust_access_application.worker.policies) == 1 && one(cloudflare_zero_trust_access_application.worker.policies).id == var.owner_policy_id
    error_message = "共有の本人ポリシーだけを参照してください。"
  }
}
