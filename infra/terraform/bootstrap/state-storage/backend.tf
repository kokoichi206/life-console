terraform {
  # backend の初期化に先立ち、state 用 bucket だけは bootstrap する。
  backend "s3" {
    key                         = "life-console/bootstrap/terraform.tfstate"
    region                      = "auto"
    use_lockfile                = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}
