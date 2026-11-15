resource "cloudflare_zero_trust_access_application" "worker" {
  account_id                 = var.account_id
  name                       = var.application_name
  auto_redirect_to_identity  = false
  enable_binding_cookie      = false
  options_preflight_bypass   = false
  type                       = "self_hosted"
  session_duration           = "24h"
  http_only_cookie_attribute = var.http_only_cookie_attribute
  destinations               = [{ type = "worker", worker_id = var.worker_id }]
  policies                   = [{ id = var.owner_policy_id, precedence = 1 }]
  oauth_configuration = {
    enabled = true
    dynamic_client_registration = {
      enabled                = true
      allow_any_on_localhost = false
      allow_any_on_loopback  = true
      allowed_uris           = []
    }
    grant = {
      access_token_lifetime = "15m"
      session_duration      = "24h"
    }
  }
  lifecycle {
    # Access の削除は公開済み Worker の保護を外すため、通常の変更では許可しない。
    prevent_destroy = true
  }
}
