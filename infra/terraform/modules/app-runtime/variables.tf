variable "cluster_name" {
  type = string
}

variable "namespace" {
  type    = string
  default = "cloudguardian"
}

variable "release_name" {
  description = "Helm release name; resource names in the chart are derived from it."
  type        = string
  default     = "cloudguardian"
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "extra_secret_env" {
  description = "Additional secret env vars for the API (e.g. SLACK_BOT_TOKEN, TRENDMICRO_API_KEY)."
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "assumable_role_arns" {
  description = "Roles the API may assume in onboarded AWS accounts."
  type        = list(string)
  default     = ["arn:aws:iam::*:role/CloudGuardianInventory*"]
}

variable "tags" {
  type    = map(string)
  default = {}
}
