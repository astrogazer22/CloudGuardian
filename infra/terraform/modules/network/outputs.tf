output "vpc_id" {
  value = aws_vpc.this.id
}

output "vpc_cidr_block" {
  value = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "node_subnet_ids" {
  description = "Subnets for worker nodes: private when a NAT gateway exists, otherwise public."
  value       = var.enable_nat_gateway ? aws_subnet.private[*].id : aws_subnet.public[*].id
}
