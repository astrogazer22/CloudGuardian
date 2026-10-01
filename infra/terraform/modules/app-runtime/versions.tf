terraform {
  required_providers {
    aws        = { source = "hashicorp/aws", version = ">= 6.0" }
    kubernetes = { source = "hashicorp/kubernetes", version = ">= 2.38" }
    random     = { source = "hashicorp/random", version = ">= 3.6" }
  }
}
