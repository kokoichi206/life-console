variable "cloudflare_account_id" {
  type        = string
  sensitive   = true
  description = "配置先の Cloudflare account ID"
}

variable "owner_email" {
  type        = string
  sensitive   = true
  description = "開発・本番で共通の本人メール"
}

variable "access_owner_policy_name" {
  type        = string
  description = "本人の共有 Allow ポリシー名"
}
