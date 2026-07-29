# Deploy contínuo via GitHub Actions (workflow .github/workflows/deploy.yml):
# o runner assume esta role por OIDC (sem access key estática) e dispara o
# bootstrap-deploy.sh no EC2 via SSM. Escopo mínimo: SendCommand só no
# documento AWS-RunShellScript e só na instância do app.

locals {
  github_repo = "HuskeLuv/SFC"
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS valida o emissor via CA raiz desde 2023; o thumbprint é obrigatório no
  # schema mas não é mais o mecanismo de confiança efetivo.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
  tags            = local.tags
}

data "aws_iam_policy_document" "github_deploy_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Só a branch main deste repo pode deployar (cobre push e workflow_dispatch).
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${local.github_repo}:ref:refs/heads/main"]
    }
  }
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid     = "SendDeployCommand"
    effect  = "Allow"
    actions = ["ssm:SendCommand"]
    resources = [
      "arn:aws:ec2:${var.region}:${data.aws_caller_identity.current.account_id}:instance/${module.ec2.instance_id}",
      "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
    ]
  }

  # GetCommandInvocation não é escopável por recurso (o command id é dinâmico).
  statement {
    sid       = "PollCommandResult"
    effect    = "Allow"
    actions   = ["ssm:GetCommandInvocation"]
    resources = ["*"]
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "${local.name}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${local.name}-github-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}

output "github_deploy_role_arn" {
  description = "Role assumida pelo workflow deploy.yml via OIDC"
  value       = aws_iam_role.github_deploy.arn
}
