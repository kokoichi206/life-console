variable "account_id" {
  type        = string
  description = "本番の Cloudflare account ID"
}

variable "worker_hostname" {
  type        = string
  sensitive   = true
  description = "本番 Worker のホスト名"
}

variable "service_token_id" {
  type        = string
  sensitive   = true
  description = "既存 runner 専用 Service Token の ID。資格情報の値は管理しない"
}
