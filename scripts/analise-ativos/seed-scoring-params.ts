/**
 * Semeia o ScoringParams v1 (SCORING_PARAMS_V1 do código) na tabela scoring_params.
 *
 * Idempotente e imutável: insere a v1 só se ausente; se já existir, compara com o código e avisa
 * quando divergir, mas NUNCA altera uma versão existente (recalibrar = nova versão).
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-scoring-params.ts           # dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-scoring-params.ts --apply   # grava
 */
import { isDeepStrictEqual } from 'util';
import { PrismaClient, type Prisma } from '@prisma/client';
import { SCORING_PARAMS_V1 } from '../../src/services/analiseAtivos/params/scoringParamsV1';
import { validarScoringParams } from '../../src/services/analiseAtivos/params/obterScoringParams';

const VERSAO = 1;

async function main() {
  const aplicar = process.argv.includes('--apply');
  const params = validarScoringParams(SCORING_PARAMS_V1, 'SCORING_PARAMS_V1');
  if (params.versao !== VERSAO) throw new Error(`SCORING_PARAMS_V1.versao = ${params.versao}`);
  console.log(`=== seed ScoringParams v${VERSAO} (${aplicar ? 'APPLY' : 'dry-run'}) ===`);
  console.log('  ✓ SCORING_PARAMS_V1 válido pelo schema');

  const prisma = new PrismaClient();
  try {
    const existente = await prisma.scoringParams.findUnique({ where: { version: VERSAO } });
    if (existente) {
      const igual = isDeepStrictEqual(existente.params, JSON.parse(JSON.stringify(params)));
      console.log(
        igual
          ? `  ✓ v${VERSAO} já existe e é idêntica ao código — nada a fazer`
          : `  ⚠ v${VERSAO} já existe e DIVERGE do código — não alterada (crie uma nova versão)`,
      );
      return;
    }
    if (!aplicar) {
      console.log(`  → v${VERSAO} ausente; seria inserida. Use --apply para gravar.`);
      return;
    }
    await prisma.scoringParams.create({
      data: {
        version: VERSAO,
        params: params as unknown as Prisma.InputJsonValue,
        validFrom: new Date('2026-09-30T00:00:00.000Z'),
        createdBy: 'seed-fase0',
        notas: 'v1 = spec v1.3 §4 + decisões de 30/09/2026 (docs/analise-ativos/decisoes-fase0.md)',
      },
    });
    console.log(`  ✓ v${VERSAO} inserida`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
