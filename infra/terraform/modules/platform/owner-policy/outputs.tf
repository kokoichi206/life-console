output "policy_id" {
  value     = cloudflare_zero_trust_access_policy.owner.id
  sensitive = true
}
