output "cloudflare_account_id" {
  value       = local.cloudflare_account_id
  description = "SQL migration が参照する Cloudflare account ID"
}

output "cloudflare_d1_database_id" {
  value       = module.database.database_id
  sensitive   = true
  description = "SQL migration が参照する D1 database ID"
}

output "cloudflare_r2_bucket_name" {
  value       = module.meal_photos.bucket_name
  description = "この環境の写真用 R2 bucket 名"
}

output "access_application_id" {
  value       = module.owner_access.application_id
  sensitive   = true
  description = "取り込んだ Access アプリケーションの照合用 ID"
}
