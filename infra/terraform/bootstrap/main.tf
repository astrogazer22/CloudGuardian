# One-time stack, applied from a workstation with admin credentials. It creates
# the IAM role that GitLab CI assumes (OIDC, no static keys) to run everything else.
#
#   cd infra/terraform/bootstrap
#   terraform init && terraform apply -var project_path=my-group/cloudguardian
#
# Then set the GitLab CI/CD variable AWS_ROLE_ARN to the `ci_role_arn` output.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
    tls = { source = "hashicorp/tls", version = "~> 4.0" }
  }

  # Local state is fine for this tiny stack; keep terraform.tfstate safe or
  # migrate it to the GitLab-managed backend (see README).
}

provider "aws" {
  region = var.region

  default_tags {
    tags = { Project = "cloudguardian", ManagedBy = "terraform", Stack = "bootstrap" }
  }
}

module "gitlab_oidc" {
  source = "../modules/gitlab-oidc"

  gitlab_url           = var.gitlab_url
  project_path         = var.project_path
  allowed_refs         = var.allowed_refs
  create_oidc_provider = var.create_oidc_provider
  role_name            = var.role_name
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "gitlab_url" {
  type    = string
  default = "https://gitlab.com"
}

variable "project_path" {
  description = "GitLab project path, e.g. my-group/cloudguardian."
  type        = string
}

variable "allowed_refs" {
  description = "Only pipelines on these refs can assume the CI role. Protect these branches in GitLab."
  type        = list(string)
  default     = ["branch:ref:main"]
}

variable "create_oidc_provider" {
  type    = bool
  default = true
}

variable "role_name" {
  type    = string
  default = "cloudguardian-gitlab-ci"
}

output "ci_role_arn" {
  description = "Set as the GitLab CI/CD variable AWS_ROLE_ARN."
  value       = module.gitlab_oidc.role_arn
}
