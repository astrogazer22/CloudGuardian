terraform {
  required_version = ">= 1.10"

  required_providers {
    aws        = { source = "hashicorp/aws", version = "~> 6.0" }
    helm       = { source = "hashicorp/helm", version = "~> 3.0" }
    http       = { source = "hashicorp/http", version = "~> 3.4" }
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.38" }
    random     = { source = "hashicorp/random", version = "~> 3.6" }
  }

  # GitLab-managed Terraform state. Address and credentials come from TF_HTTP_*
  # environment variables (set automatically in .gitlab-ci.yml).
  backend "http" {}
}
