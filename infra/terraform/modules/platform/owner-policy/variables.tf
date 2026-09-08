variable "account_id" {
  type        = string
  description = "本人用ポリシーの Cloudflare account ID"
}

variable "policy_name" {
  type        = string
  description = "この環境の本人用ポリシー名"
}

variable "owner_email" {
  type        = string
  sensitive   = true
  description = "完全一致で許可する本人のメールアドレス"
}
