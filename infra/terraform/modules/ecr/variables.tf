variable "prefix" {
  description = "Repository namespace, e.g. \"cloudguardian\" -> cloudguardian/api."
  type        = string
}

variable "repositories" {
  type    = list(string)
  default = ["api", "web"]
}

variable "keep_images" {
  type    = number
  default = 15
}

variable "force_delete" {
  description = "Allow terraform destroy to delete repositories that still contain images."
  type        = bool
  default     = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
