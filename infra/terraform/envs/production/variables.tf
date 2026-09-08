variable "access_worker_id" {
  type        = string
  sensitive   = true
  description = "既存 Access が参照する Worker ID"
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
