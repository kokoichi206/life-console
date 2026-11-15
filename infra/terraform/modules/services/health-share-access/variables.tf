variable "account_id" {
  type        = string
  description = "対象環境の Cloudflare account ID"
}

variable "worker_hostname" {
  type        = string
  sensitive   = true
  description = "健康ページを共有する Worker のホスト名"
}
