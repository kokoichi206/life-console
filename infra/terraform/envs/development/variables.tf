variable "access_worker_id" {
  type        = string
  sensitive   = true
  default     = null
  description = "旧 workers_script からの管理移行時だけ指定する既存 Worker ID。新規環境では不要"
}

variable "owner_email" {
  type        = string
  sensitive   = true
  description = "この環境で許可する本人メール"
}
