output "cloudflare_account_id" {
  value       = var.cloudflare_account_id
  sensitive   = true
  description = "同じ環境の GitHub Secret CLOUDFLARE_ACCOUNT_ID に渡す値"
}

output "cloudflare_d1_database_id" {
  value       = module.database.database_id
  sensitive   = true
  description = "同じ環境の GitHub Secret CLOUDFLARE_D1_DATABASE_ID に渡す値"
}

output "cloudflare_r2_bucket_name" {
  value       = module.meal_photos.bucket_name
  description = "同じ環境の GitHub Secret CLOUDFLARE_R2_BUCKET_NAME に渡す値"
}

output "access_application_id" {
  value       = module.owner_access.application_id
  sensitive   = true
  description = "取り込んだ Access アプリケーションの照合用 ID"
}
