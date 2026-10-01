# Cluster-side prerequisites for the Helm chart in deploy/helm/cloudguardian:
# namespace, runtime secrets and the AWS role used by the API pods.

resource "kubernetes_namespace_v1" "this" {
  metadata {
    name   = var.namespace
    labels = { "app.kubernetes.io/part-of" = "cloudguardian" }
  }
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "random_password" "redis" {
  length  = 32
  special = false
}

# Consumed by the chart via api.existingSecret / redis.existingSecret.
resource "kubernetes_secret_v1" "api" {
  metadata {
    name      = "${var.release_name}-api"
    namespace = kubernetes_namespace_v1.this.metadata[0].name
  }

  data = merge(
    {
      DATABASE_URL   = var.database_url
      JWT_SECRET     = random_password.jwt.result
      REDIS_PASSWORD = random_password.redis.result
      REDIS_URL      = "redis://:${random_password.redis.result}@${var.release_name}-redis:6379"
    },
    var.extra_secret_env,
  )
}

# ─── API pod AWS access (EKS Pod Identity) ──────────────────────────────────
# Read-only permissions for the inventory sync and reports in the hosting
# account, plus AssumeRole into onboarded accounts.

resource "aws_iam_role" "api" {
  name = "${var.cluster_name}-${var.release_name}-api"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "pods.eks.amazonaws.com" }
      Action    = ["sts:AssumeRole", "sts:TagSession"]
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "api" {
  name = "cloudguardian-readonly"
  role = aws_iam_role.api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "InventoryAndReports"
        Effect = "Allow"
        Action = [
          "ec2:Describe*",
          "elasticloadbalancing:Describe*",
          "iam:ListUsers",
          "iam:ListAccessKeys",
          "iam:ListMFADevices",
          "iam:ListGroupsForUser",
          "iam:ListUserTags",
          "iam:GetLoginProfile",
          "iam:GetAccessKeyLastUsed",
          "cloudwatch:DescribeAlarms",
          "backup:List*",
          "backup:Describe*",
          "inspector2:ListFindings",
          "inspector2:ListCoverage",
          "sts:GetCallerIdentity",
        ]
        Resource = "*"
      },
      {
        Sid      = "AssumeOnboardedAccounts"
        Effect   = "Allow"
        Action   = "sts:AssumeRole"
        Resource = var.assumable_role_arns
      },
    ]
  })
}

resource "aws_eks_pod_identity_association" "api" {
  cluster_name    = var.cluster_name
  namespace       = kubernetes_namespace_v1.this.metadata[0].name
  service_account = "${var.release_name}-api"
  role_arn        = aws_iam_role.api.arn
  tags            = var.tags
}
