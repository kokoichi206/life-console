variable "account_id" {
  type        = string
  description = "配置先の Cloudflare account ID"
}

variable "worker_name" {
  type        = string
  description = "既存 Worker の名前"
}

variable "environment" {
  type        = string
  description = "Worker の APP_ENV"
}

variable "database_id" {
  type        = string
  sensitive   = true
  description = "同じ環境で管理する D1 の ID"
}

variable "photo_bucket_name" {
  type        = string
  description = "同じ環境で管理する写真用 R2 bucket"
}
