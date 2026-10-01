variable "project" {
  description = "Used for resource names, ECR prefix and the Helm release name."
  type        = string
  default     = "cloudguardian"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "enable_nat_gateway" {
  description = "false = nodes in public subnets (saves ~$33/mo). true = private nodes behind one NAT gateway."
  type        = bool
  default     = false
}

variable "kubernetes_version" {
  description = "Check `aws eks describe-cluster-versions` and stay within standard support."
  type        = string
  default     = "1.35"
}

variable "eks_public_access_cidrs" {
  description = "CIDRs allowed to reach the Kubernetes API. GitLab SaaS runners need 0.0.0.0/0 unless you use your own runners."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "admin_principal_arns" {
  description = "Extra IAM role/user ARNs (e.g. your SSO admin role) to grant kubectl admin."
  type        = list(string)
  default     = []
}

variable "node_capacity_type" {
  type    = string
  default = "SPOT"
}

variable "node_instance_types" {
  type    = list(string)
  default = ["t3.medium", "t3a.medium"]
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "node_min_size" {
  type    = number
  default = 1
}

variable "node_max_size" {
  type    = number
  default = 3
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_backup_retention_days" {
  type    = number
  default = 7
}

variable "allow_destroy" {
  description = "Disables RDS deletion protection/final snapshot and lets ECR repos be force-deleted."
  type        = bool
  default     = false
}

variable "alb_controller_version" {
  type    = string
  default = "v3.5.0"
}

variable "alb_controller_chart_version" {
  type    = string
  default = "3.5.0"
}

variable "app_namespace" {
  type    = string
  default = "cloudguardian"
}

variable "app_secret_env" {
  description = "Extra secret env vars for the API pod, e.g. { SLACK_BOT_TOKEN = \"...\" }. Pass via TF_VAR_app_secret_env."
  type        = map(string)
  default     = {}
  sensitive   = true
}
