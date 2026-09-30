/**
 * Leitura do ScoringParams ativo (maior version com validFrom ≤ agora) ou de uma versão específica.
 * O JSON é revalidado pelo schema zod na leitura: parâmetro inválido nunca chega a uma regra.
 */
import type { PrismaClient } from '@prisma/client';
import {
  scoringParamsSchema,
  type ScoringParams,
} from '@/services/analiseAtivos/params/scoringParamsSchema';

export type CodigoErroParams = 'sem_versao_ativa' | 'versao_inexistente' | 'json_invalido';

export class ErroParams extends Error {
  constructor(
    public readonly codigo: CodigoErroParams,
    message: string,
  ) {
    super(message);
    this.name = 'ErroParams';
  }
}

/** Valida um JSON de params; lança ErroParams('json_invalido') com os problemas encontrados. */
export function validarScoringParams(json: unknown, rotulo = 'params'): ScoringParams {
  const r = scoringParamsSchema.safeParse(json);
  if (!r.success) {
    const problemas = r.error.issues
      .slice(0, 10)
      .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('; ');
    throw new ErroParams('json_invalido', `${rotulo} inválido: ${problemas}`);
  }
  return r.data;
}

export async function obterScoringParams(
  prisma: PrismaClient,
  opts?: { versao?: number },
): Promise<{ versao: number; params: ScoringParams }> {
  const linha =
    opts?.versao !== undefined
      ? await prisma.scoringParams.findUnique({ where: { version: opts.versao } })
      : await prisma.scoringParams.findFirst({
          where: { validFrom: { lte: new Date() } },
          orderBy: { version: 'desc' },
        });
  if (!linha) {
    throw opts?.versao !== undefined
      ? new ErroParams('versao_inexistente', `ScoringParams v${opts.versao} não existe`)
      : new ErroParams('sem_versao_ativa', 'nenhuma versão ativa de ScoringParams no banco');
  }
  return {
    versao: linha.version,
    params: validarScoringParams(linha.params, `ScoringParams v${linha.version}`),
  };
}
