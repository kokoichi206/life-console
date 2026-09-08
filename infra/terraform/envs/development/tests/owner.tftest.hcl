mock_provider "cloudflare" {}
variables {
  account_id  = "00000000000000000000000000000000"
  policy_name = "Owner only"
  owner_email = "owner@example.com"
}
run "allow_only_owner_email" {
  command = plan

  module {
    source = "../../modules/platform/owner-policy"
  }
  assert {
    condition     = cloudflare_zero_trust_access_policy.owner.decision == "allow" && length(cloudflare_zero_trust_access_policy.owner.include) == 1 && one(cloudflare_zero_trust_access_policy.owner.include).email.email == var.owner_email
    error_message = "本人メール完全一致の Allow 条件を維持してください。"
  }
}
