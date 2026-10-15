/**
 * Leitura do CriteriaParams ativo (maior version com validFrom ≤ agora) ou de uma versão específica.
 * Molde: obterScoringParams. O JSON é revalidado pelo schema zod na leitura: parâmetro inválido nunca
 * chega ao motor de critérios (fatia A). Erros com o mesmo ErroParams do ScoringParams.
 */
import type { PrismaClient } from '@prisma/client';
import {
  criteriaParamsSchema,
  type CriteriaParams,
} from '@/services/analiseAtivos/params/criteriaParamsSchema';
import { ErroParams } from '@/services/analiseAtivos/params/obterScoringParams';

export { ErroParams };

/** Valida um JSON de params; lança ErroParams('json_invalido') com os problemas encontrados. */
export function validarCriteriaParams(json: unknown, rotulo = 'criteria_params'): CriteriaParams {
  const r = criteriaParamsSchema.safeParse(json);
  if (!r.success) {
    const problemas = r.error.issues
      .slice(0, 10)
      .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('; ');
    throw new ErroParams('json_invalido', `${rotulo} inválido: ${problemas}`);
  }
  return r.data;
}

export async function obterCriteriaParams(
  prisma: Pick<PrismaClient, 'criteriaParams'>,
  opts?: { versao?: number },
): Promise<{ versao: number; params: CriteriaParams }> {
  const linha =
    opts?.versao !== undefined
      ? await prisma.criteriaParams.findUnique({ where: { version: opts.versao } })
      : await prisma.criteriaParams.findFirst({
          where: { validFrom: { lte: new Date() } },
          orderBy: { version: 'desc' },
        });
  if (!linha) {
    throw opts?.versao !== undefined
      ? new ErroParams('versao_inexistente', `CriteriaParams v${opts.versao} não existe`)
      : new ErroParams('sem_versao_ativa', 'nenhuma versão ativa de CriteriaParams no banco');
  }
  return {
    versao: linha.version,
    params: validarCriteriaParams(linha.params, `CriteriaParams v${linha.version}`),
  };
}
