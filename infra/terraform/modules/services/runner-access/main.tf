resource "cloudflare_zero_trust_access_policy" "runner" {
  account_id       = var.account_id
  name             = "Life Console production runner"
  decision         = "non_identity"
  include          = [{ service_token = { token_id = var.service_token_id } }]
  connection_rules = { rdp = {} }

  lifecycle { prevent_destroy = true }
}

resource "cloudflare_zero_trust_access_application" "runner" {
  account_id                 = var.account_id
  name                       = "Life Console runner API"
  auto_redirect_to_identity  = false
  enable_binding_cookie      = false
  options_preflight_bypass   = false
  http_only_cookie_attribute = false
  type                       = "self_hosted"
  domain                     = "${var.worker_hostname}/api/v1/runner/*"
  destinations               = [{ type = "public", uri = "${var.worker_hostname}/api/v1/runner/*" }]
  session_duration           = "24h"
  policies                   = [{ id = cloudflare_zero_trust_access_policy.runner.id, precedence = 1 }]
  lifecycle { prevent_destroy = true }
}
