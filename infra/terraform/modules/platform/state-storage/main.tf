resource "cloudflare_r2_bucket" "state" {
  account_id   = var.account_id
  name         = "life-console-tfstate"
  jurisdiction = "default"
  lifecycle { prevent_destroy = true }
}
