terraform {
  # state 用 R2 bucket は、この state で管理するアプリ資源とは別に用意する。
  backend "s3" {
    bucket = "life-console-tfstate"
    endpoints = {
      s3 = "https://bc003a008ecb84ab15327f6ffe1c558f.r2.cloudflarestorage.com"
    }
    key                         = "life-console/development/terraform.tfstate"
    region                      = "auto"
    use_lockfile                = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}
