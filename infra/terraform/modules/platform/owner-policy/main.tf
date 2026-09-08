resource "cloudflare_zero_trust_access_policy" "owner" {
  account_id       = var.account_id
  name             = var.policy_name
  decision         = "allow"
  include          = [{ email = { email = var.owner_email } }]
  connection_rules = { rdp = {} }

  lifecycle { prevent_destroy = true }
}
