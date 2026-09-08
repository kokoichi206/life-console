variable "account_id" {
  type        = string
  description = "対象 Worker の Cloudflare account ID"
}

variable "application_name" {
  type        = string
  description = "既存の Access アプリケーション名"
}

variable "worker_id" {
  type        = string
  sensitive   = true
  description = "Access の保護対象である Worker ID。スクリプト名とは異なる"
}

variable "owner_policy_id" {
  type        = string
  sensitive   = true
  description = "shared state が管理する本人用ポリシー ID"
}

variable "session_duration" {
  type        = string
  description = "既存の Access セッション有効期間"
}

variable "http_only_cookie_attribute" {
  type        = bool
  description = "既存の HttpOnly cookie 設定"
}
