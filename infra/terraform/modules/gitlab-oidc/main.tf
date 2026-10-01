locals {
  issuer_host = trimprefix(trimsuffix(var.gitlab_url, "/"), "https://")

  # GitLab id_token "sub": project_path:<group>/<project>:ref_type:<branch|tag>:ref:<name>
  subjects = [for ref in var.allowed_refs : "project_path:${var.project_path}:ref_type:${ref}"]
}

data "tls_certificate" "gitlab" {
  url = trimsuffix(var.gitlab_url, "/")
}

resource "aws_iam_openid_connect_provider" "gitlab" {
  count = var.create_oidc_provider ? 1 : 0

  url             = trimsuffix(var.gitlab_url, "/")
  client_id_list  = [var.audience]
  thumbprint_list = [data.tls_certificate.gitlab.certificates[length(data.tls_certificate.gitlab.certificates) - 1].sha1_fingerprint]
  tags            = var.tags
}

data "aws_iam_openid_connect_provider" "existing" {
  count = var.create_oidc_provider ? 0 : 1
  url   = trimsuffix(var.gitlab_url, "/")
}

locals {
  provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.gitlab[0].arn : data.aws_iam_openid_connect_provider.existing[0].arn
}

resource "aws_iam_role" "ci" {
  name                 = var.role_name
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "${local.issuer_host}:aud" = var.audience }
        StringLike   = { "${local.issuer_host}:sub" = local.subjects }
      }
    }]
  })

  tags = var.tags
}

# Terraform in CI creates VPCs, EKS, IAM roles and RDS, which needs broad rights.
# Tighten to a scoped policy (or a permissions boundary) in the security phase.
resource "aws_iam_role_policy_attachment" "ci" {
  for_each = toset(var.policy_arns)

  role       = aws_iam_role.ci.name
  policy_arn = each.value
}
