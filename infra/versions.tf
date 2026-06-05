terraform {
  required_version = ">= 1.15.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # State local primeiro. Migrar pra S3+DynamoDB quando a infra firmar:
  # backend "s3" {
  #   bucket         = "myfinance-tfstate-<sufixo>"
  #   key            = "infra/terraform.tfstate"
  #   region         = "sa-east-1"
  #   dynamodb_table = "myfinance-tflock"
  #   encrypt        = true
  # }
}
