/**
 * Semeia um ScoringParams do código (v1 = SCORING_PARAMS_V1; v2 = SCORING_PARAMS_V2, bloco C) na
 * tabela scoring_params.
 *
 * Idempotente e imutável: insere a versão só se ausente; se já existir, compara com o código (após
 * a validação pelo schema, que aplica os defaults dos campos acrescentados depois) e avisa quando
 * divergir, mas NUNCA altera uma versão existente (recalibrar = nova versão).
 *
 * ATENÇÃO v2: a maior versão com validFrom ≤ agora é a ATIVA. Gravar a v2 sem --valido-a-partir no
 * futuro liga as regras de conferência no próximo cálculo (em produção: só com OK do Wellington,
 * depois do dry-run; ver docs/analise-ativos/blocoC/ATIVACAO.md). O padrão continua --versao=1.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-scoring-params.ts                    # v1 dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-scoring-params.ts --apply            # v1 grava
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-scoring-params.ts --versao=2         # v2 dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-scoring-params.ts --versao=2 --apply \
 *     [--valido-a-partir=AAAA-MM-DD]                                                         # v2 grava
 */
import { isDeepStrictEqual } from 'util';
import { PrismaClient, type Prisma } from '@prisma/client';
import type { ScoringParams } from '../../src/services/analiseAtivos/params/scoringParamsSchema';
import { SCORING_PARAMS_V1 } from '../../src/services/analiseAtivos/params/scoringParamsV1';
import { SCORING_PARAMS_V2 } from '../../src/services/analiseAtivos/params/scoringParamsV2';
import { validarScoringParams } from '../../src/services/analiseAtivos/params/obterScoringParams';

interface DefVersao {
  params: ScoringParams;
  rotulo: string;
  validFromPadrao: () => Date;
  createdBy: string;
  notas: string;
}

const VERSOES: Record<number, DefVersao> = {
  1: {
    params: SCORING_PARAMS_V1,
    rotulo: 'SCORING_PARAMS_V1',
    validFromPadrao: () => new Date('2026-09-30T00:00:00.000Z'),
    createdBy: 'seed-fase0',
    notas: 'v1 = spec v1.3 §4 + decisões de 30/09/2026 (docs/analise-ativos/decisoes-fase0.md)',
  },
  2: {
    params: SCORING_PARAMS_V2,
    rotulo: 'SCORING_PARAMS_V2',
    validFromPadrao: () => new Date(),
    createdBy: 'seed-bloco-c',
    notas:
      'v2 = v1 + sanidade.conferencia.ligada (bloco C, docs/analise-ativos/blocoC/decisoes.md)',
  },
};

export function lerArgs(argv: string[]): {
  versao: number;
  aplicar: boolean;
  validoAPartir: Date | null;
} {
  const arg = (nome: string) =>
    argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? null;
  const versao = Number(arg('versao') ?? '1');
  if (!VERSOES[versao]) {
    throw new Error(`--versao inválida: ${arg('versao')} (válidas: ${Object.keys(VERSOES)})`);
  }
  const data = arg('valido-a-partir');
  if (data !== null && !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error(`--valido-a-partir inválido (AAAA-MM-DD): ${data}`);
  }
  return {
    versao,
    aplicar: argv.includes('--apply'),
    validoAPartir: data ? new Date(`${data}T00:00:00.000Z`) : null,
  };
}

async function main() {
  const { versao, aplicar, validoAPartir } = lerArgs(process.argv.slice(2));
  const def = VERSOES[versao];
  const params = validarScoringParams(def.params, def.rotulo);
  if (params.versao !== versao) throw new Error(`${def.rotulo}.versao = ${params.versao}`);
  console.log(`=== seed ScoringParams v${versao} (${aplicar ? 'APPLY' : 'dry-run'}) ===`);
  console.log(`  ✓ ${def.rotulo} válido pelo schema`);

  const prisma = new PrismaClient();
  try {
    const existente = await prisma.scoringParams.findUnique({ where: { version: versao } });
    if (existente) {
      const lido = validarScoringParams(existente.params, `ScoringParams v${versao} do banco`);
      const igual = isDeepStrictEqual(
        JSON.parse(JSON.stringify(lido)),
        JSON.parse(JSON.stringify(params)),
      );
      console.log(
        igual
          ? `  ✓ v${versao} já existe e é equivalente ao código — nada a fazer`
          : `  ⚠ v${versao} já existe e DIVERGE do código — não alterada (crie uma nova versão)`,
      );
      return;
    }
    const validFrom = validoAPartir ?? def.validFromPadrao();
    if (!aplicar) {
      console.log(
        `  → v${versao} ausente; seria inserida com validFrom ${validFrom.toISOString()}. ` +
          'Use --apply para gravar.',
      );
      return;
    }
    await prisma.scoringParams.create({
      data: {
        version: versao,
        params: params as unknown as Prisma.InputJsonValue,
        validFrom,
        createdBy: def.createdBy,
        notas: def.notas,
      },
    });
    console.log(`  ✓ v${versao} inserida (validFrom ${validFrom.toISOString()})`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
