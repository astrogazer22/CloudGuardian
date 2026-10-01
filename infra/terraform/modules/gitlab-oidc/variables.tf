variable "gitlab_url" {
  description = "GitLab instance URL (the id_token issuer)."
  type        = string
  default     = "https://gitlab.com"
}

variable "audience" {
  description = "Must match `aud` in the .gitlab-ci.yml id_tokens block."
  type        = string
  default     = "sts.amazonaws.com"
}

variable "project_path" {
  description = "GitLab project path, e.g. my-group/cloudguardian."
  type        = string
}

variable "allowed_refs" {
  description = "ref_type:ref patterns allowed to assume the role (wildcards allowed)."
  type        = list(string)
  default     = ["branch:ref:main"]
}

variable "create_oidc_provider" {
  description = "Set false if the account already has an IAM OIDC provider for this GitLab URL."
  type        = bool
  default     = true
}

variable "role_name" {
  type    = string
  default = "cloudguardian-gitlab-ci"
}

variable "policy_arns" {
  type    = list(string)
  default = ["arn:aws:iam::aws:policy/AdministratorAccess"]
}

variable "tags" {
  type    = map(string)
  default = {}
}
