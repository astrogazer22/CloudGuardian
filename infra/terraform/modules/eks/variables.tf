variable "cluster_name" {
  type = string
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version. Keep it within standard support to avoid extended-support pricing."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets for the control-plane ENIs (at least two AZs)."
  type        = list(string)
}

variable "node_subnet_ids" {
  description = "Subnets for worker nodes."
  type        = list(string)
}

variable "public_access_cidrs" {
  description = "CIDRs allowed to reach the public Kubernetes API endpoint."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "admin_principal_arns" {
  description = "IAM role/user ARNs granted cluster-admin through EKS access entries."
  type        = set(string)
}

variable "cluster_log_types" {
  type    = list(string)
  default = []
}

variable "node_capacity_type" {
  description = "SPOT (cheapest) or ON_DEMAND."
  type        = string
  default     = "SPOT"

  validation {
    condition     = contains(["SPOT", "ON_DEMAND"], var.node_capacity_type)
    error_message = "node_capacity_type must be SPOT or ON_DEMAND."
  }
}

variable "node_instance_types" {
  description = "Several similar sizes improve Spot availability."
  type        = list(string)
  default     = ["t3.medium", "t3a.medium"]
}

variable "node_disk_size" {
  type    = number
  default = 20
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

variable "tags" {
  type    = map(string)
  default = {}
}
