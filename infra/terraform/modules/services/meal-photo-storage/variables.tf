variable "account_id" {
  type        = string
  description = "配置先の Cloudflare account ID"
}

variable "bucket_name" {
  type        = string
  description = "環境専用の非公開 R2 bucket 名"
}
