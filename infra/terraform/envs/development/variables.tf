variable "cloudflare_account_id" {
  type        = string
  sensitive   = true
  description = "配置先の Cloudflare account ID"
}

variable "access_worker_id" {
  type        = string
  sensitive   = true
  description = "既存 Access が参照する Worker ID"
}


variable "owner_email" {
  type        = string
  sensitive   = true
  description = "この環境で許可する本人メール"
}
