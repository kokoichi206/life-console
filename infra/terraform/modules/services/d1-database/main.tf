resource "cloudflare_d1_database" "database" {
  account_id = var.account_id
  name       = var.database_name

  read_replication = { mode = "disabled" }

  lifecycle {
    # 置き換えは保存済みの個人データを失うため、通常の変更では許可しない。
    prevent_destroy = true
  }
}
