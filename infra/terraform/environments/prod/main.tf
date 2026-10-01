provider "aws" {
  region = var.region

  default_tags {
    tags = local.tags
  }
}

locals {
  name = "${var.project}-${var.environment}"
  tags = { Project = var.project, Environment = var.environment, ManagedBy = "terraform" }

  # Whoever runs Terraform (the GitLab CI role) must be a cluster admin so the
  # kubernetes/helm providers work; extra humans come from admin_principal_arns.
  cluster_admins = toset(concat([data.aws_iam_session_context.current.issuer_arn], var.admin_principal_arns))
}

data "aws_caller_identity" "current" {}

data "aws_iam_session_context" "current" {
  arn = data.aws_caller_identity.current.arn
}

# ─── Infrastructure ──────────────────────────────────────────────────────────

module "network" {
  source = "../../modules/network"

  name               = local.name
  cluster_name       = local.name
  cidr_block         = var.vpc_cidr
  az_count           = 2
  enable_nat_gateway = var.enable_nat_gateway
  tags               = local.tags
}

module "eks" {
  source = "../../modules/eks"

  cluster_name         = local.name
  kubernetes_version   = var.kubernetes_version
  subnet_ids           = concat(module.network.public_subnet_ids, module.network.private_subnet_ids)
  node_subnet_ids      = module.network.node_subnet_ids
  public_access_cidrs  = var.eks_public_access_cidrs
  admin_principal_arns = local.cluster_admins

  node_capacity_type  = var.node_capacity_type
  node_instance_types = var.node_instance_types
  node_desired_size   = var.node_desired_size
  node_min_size       = var.node_min_size
  node_max_size       = var.node_max_size

  tags = local.tags
}

module "ecr" {
  source = "../../modules/ecr"

  prefix       = var.project
  repositories = ["api", "web"]
  force_delete = var.allow_destroy
  tags         = local.tags
}

module "rds" {
  source = "../../modules/rds"

  identifier                 = local.name
  vpc_id                     = module.network.vpc_id
  subnet_ids                 = module.network.private_subnet_ids
  allowed_security_group_ids = [module.eks.cluster_security_group_id]
  instance_class             = var.db_instance_class
  multi_az                   = false
  backup_retention_days      = var.db_backup_retention_days
  deletion_protection        = !var.allow_destroy
  skip_final_snapshot        = var.allow_destroy
  tags                       = local.tags
}

# ─── Cluster add-ons and app prerequisites ───────────────────────────────────

data "aws_eks_cluster_auth" "this" {
  name = module.eks.cluster_name
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
  token                  = data.aws_eks_cluster_auth.this.token
}

provider "helm" {
  kubernetes = {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
    token                  = data.aws_eks_cluster_auth.this.token
  }
}

module "alb_controller" {
  source = "../../modules/alb-controller"

  cluster_name       = module.eks.cluster_name
  region             = var.region
  vpc_id             = module.network.vpc_id
  controller_version = var.alb_controller_version
  chart_version      = var.alb_controller_chart_version
  tags               = local.tags

  depends_on = [module.eks]
}

module "app_runtime" {
  source = "../../modules/app-runtime"

  cluster_name     = module.eks.cluster_name
  namespace        = var.app_namespace
  release_name     = var.project
  database_url     = module.rds.database_url
  extra_secret_env = var.app_secret_env
  tags             = local.tags

  depends_on = [module.eks]
}
