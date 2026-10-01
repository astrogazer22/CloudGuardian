output "cluster_name" {
  value = aws_eks_cluster.this.name
}

output "cluster_endpoint" {
  value = aws_eks_cluster.this.endpoint
}

output "cluster_ca_certificate" {
  value = aws_eks_cluster.this.certificate_authority[0].data
}

output "cluster_security_group_id" {
  description = "EKS-managed security group attached to the control plane and managed nodes."
  value       = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}

output "node_role_arn" {
  value = aws_iam_role.node.arn
}

output "ready" {
  description = "Resolves once nodes, add-ons and admin access are in place; use for depends_on."
  value       = { for k, v in aws_eks_addon.this : k => v.id }
  depends_on  = [aws_eks_access_policy_association.admin, aws_eks_node_group.default]
}
