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

variable "access_owner_policy_id" {
  type        = string
  sensitive   = true
  description = "shared state の owner_policy_id output"
}

variable "access_application_name" {
  type        = string
  description = "既存の Access アプリケーション名"
}

variable "access_session_duration" {
  type        = string
  description = "既存の Access セッション有効期間"
}
