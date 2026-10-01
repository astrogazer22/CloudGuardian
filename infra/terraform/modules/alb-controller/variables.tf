variable "cluster_name" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "controller_version" {
  description = "Controller app version (git tag) used to fetch the matching IAM policy."
  type        = string
  default     = "v3.5.0"
}

variable "chart_version" {
  description = "eks-charts/aws-load-balancer-controller chart version matching controller_version."
  type        = string
  default     = "3.5.0"
}

variable "replicas" {
  description = "1 keeps the footprint small; raise to 2 for HA."
  type        = number
  default     = 1
}

variable "tags" {
  type    = map(string)
  default = {}
}
