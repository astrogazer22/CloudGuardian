variable "name" {
  description = "Name prefix for network resources."
  type        = string
}

variable "cluster_name" {
  description = "EKS cluster name, used for subnet discovery tags."
  type        = string
}

variable "cidr_block" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.40.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones (EKS and RDS both require at least 2)."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 4
    error_message = "az_count must be between 2 and 4."
  }
}

variable "enable_nat_gateway" {
  description = "Create a single NAT gateway so nodes can run in private subnets."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default     = {}
}
