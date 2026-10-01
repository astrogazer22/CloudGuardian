output "repository_urls" {
  description = "Map of short name (api, web) to repository URL."
  value       = { for k, r in aws_ecr_repository.this : k => r.repository_url }
}

output "registry" {
  value = split("/", values(aws_ecr_repository.this)[0].repository_url)[0]
}
