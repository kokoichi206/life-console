resource "cloudflare_r2_bucket" "meal_photos" {
  account_id   = var.account_id
  name         = var.bucket_name
  jurisdiction = "default"

  lifecycle {
    # 写真本体の保存先を plan の置き換えで失わないようにする。
    prevent_destroy = true
  }
}
