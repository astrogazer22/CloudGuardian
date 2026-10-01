# Upstream-maintained IAM policy, pinned to the controller release.
data "http" "iam_policy" {
  url = "https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/${var.controller_version}/docs/install/iam_policy.json"

  request_headers = { Accept = "application/json" }
}

resource "aws_iam_policy" "this" {
  name   = "${var.cluster_name}-aws-load-balancer-controller"
  policy = data.http.iam_policy.response_body
  tags   = var.tags
}

resource "aws_iam_role" "this" {
  name = "${var.cluster_name}-aws-load-balancer-controller"

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

resource "aws_iam_role_policy_attachment" "this" {
  role       = aws_iam_role.this.name
  policy_arn = aws_iam_policy.this.arn
}

resource "aws_eks_pod_identity_association" "this" {
  cluster_name    = var.cluster_name
  namespace       = "kube-system"
  service_account = local.service_account
  role_arn        = aws_iam_role.this.arn
  tags            = var.tags
}

locals {
  service_account = "aws-load-balancer-controller"
}

resource "helm_release" "this" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = var.chart_version
  namespace  = "kube-system"

  values = [yamlencode({
    clusterName  = var.cluster_name
    region       = var.region
    vpcId        = var.vpc_id
    replicaCount = var.replicas
    serviceAccount = {
      create = true
      name   = local.service_account
    }
    resources = {
      requests = { cpu = "25m", memory = "64Mi" }
      limits   = { memory = "256Mi" }
    }
  })]

  depends_on = [aws_eks_pod_identity_association.this, aws_iam_role_policy_attachment.this]
}
