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

variable "workers_subdomain" {
  type        = string
  sensitive   = true
  description = "本番 Worker の workers.dev サブドメイン"
}

variable "runner_service_token_id" {
  type        = string
  sensitive   = true
  description = "既存 runner 専用 Service Token の ID"
}

variable "owner_email" {
  type        = string
  sensitive   = true
  description = "この環境で許可する本人メール"
}
