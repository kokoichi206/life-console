variable "account_id" {
  type        = string
  description = "共有ポリシーの Cloudflare account ID"
}

variable "policy_name" {
  type        = string
  description = "共有する本人ポリシーの既存名"
}

variable "owner_email" {
  type        = string
  sensitive   = true
  description = "完全一致で許可する本人のメールアドレス"
}
