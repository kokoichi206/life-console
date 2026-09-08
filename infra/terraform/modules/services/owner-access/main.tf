resource "cloudflare_zero_trust_access_application" "worker" {
  account_id                 = var.account_id
  name                       = var.application_name
  auto_redirect_to_identity  = false
  enable_binding_cookie      = false
  options_preflight_bypass   = false
  type                       = "self_hosted"
  session_duration           = var.session_duration
  http_only_cookie_attribute = var.http_only_cookie_attribute
  destinations               = [{ type = "worker", worker_id = var.worker_id }]
  policies                   = [{ id = var.owner_policy_id, precedence = 1 }]
  lifecycle {
    # Access の削除は公開済み Worker の保護を外すため、通常の変更では許可しない。
    prevent_destroy = true
  }
}
