terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # optional: remote state (S3 + DynamoDB)
  # backend "s3" {
  #   bucket = "yap-terraform-state"
  #   key    = "profiles/dev/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

# ---------- DYNAMODB TABLE ----------
resource "aws_dynamodb_table" "profiles" {
  name         = "Profiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "walletAddress"

  attribute { name = "walletAddress" type = "S" }
  attribute { name = "xp"            type = "N" }

  global_secondary_index {
    name            = "XpIndex"
    hash_key        = "xp"
    range_key       = "walletAddress"
    projection_type = "ALL"
  }

  point_in_time_recovery { enabled = true }
}

output "profiles_table_name" {
  value = aws_dynamodb_table.profiles.name
}
