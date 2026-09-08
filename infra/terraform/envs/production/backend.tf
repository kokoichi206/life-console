terraform {
  # state 用 R2 bucket は、この state で管理するアプリ資源とは別に用意する。
  backend "s3" {
    key                         = "life-console/production/terraform.tfstate"
    region                      = "auto"
    use_lockfile                = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}
