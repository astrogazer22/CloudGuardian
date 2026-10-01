output "region" {
  value = var.region
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "kubeconfig_command" {
  value = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name}"
}

output "ecr_registry" {
  value = module.ecr.registry
}

output "ecr_repository_urls" {
  value = module.ecr.repository_urls
}

output "app_namespace" {
  value = module.app_runtime.namespace
}

output "api_secret_name" {
  value = module.app_runtime.api_secret_name
}

output "api_role_arn" {
  description = "Role used by API pods via EKS Pod Identity (the 'This environment' AWS connection)."
  value       = module.app_runtime.api_role_arn
}

output "db_address" {
  value = module.rds.address
}
