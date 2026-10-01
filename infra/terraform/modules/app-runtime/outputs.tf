output "namespace" {
  value = kubernetes_namespace_v1.this.metadata[0].name
}

output "api_secret_name" {
  value = kubernetes_secret_v1.api.metadata[0].name
}

output "api_role_arn" {
  value = aws_iam_role.api.arn
}
