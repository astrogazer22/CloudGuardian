output "address" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "database_name" {
  value = aws_db_instance.this.db_name
}

output "username" {
  value = aws_db_instance.this.username
}

output "password" {
  value     = random_password.master.result
  sensitive = true
}

output "database_url" {
  description = "Prisma connection string. RDS PostgreSQL 15+ enforces TLS (rds.force_ssl=1)."
  value       = "postgresql://${aws_db_instance.this.username}:${random_password.master.result}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${aws_db_instance.this.db_name}?schema=public&sslmode=require"
  sensitive   = true
}
