output "worker_id" {
  value       = cloudflare_worker.app.id
  description = "Access の保護対象となる Worker ID"
}
