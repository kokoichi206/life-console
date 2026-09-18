resource "cloudflare_zero_trust_access_policy" "health_share" {
  account_id = var.account_id
  name       = "${var.worker_hostname} health sharing"
  decision   = "bypass"
  include    = [{ everyone = {} }]

  lifecycle { prevent_destroy = true }
}

resource "cloudflare_zero_trust_access_application" "health_share" {
  account_id = var.account_id
  name       = "${var.worker_hostname} health sharing"
  type       = "self_hosted"
  destinations = [for path in ["share/health/*", "api/v1/share/*", "assets/*", "icons/*", "manifest.webmanifest"] : {
    type = "public"
    uri  = "${var.worker_hostname}/${path}"
  }]
  policies = [{ id = cloudflare_zero_trust_access_policy.health_share.id, precedence = 1 }]

  lifecycle { prevent_destroy = true }
}
