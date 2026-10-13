/**
 * Semeia o CriteriaParams v1 (Filtros de Fundamentos, v2.4) na tabela criteria_params.
 * Molde: seed-scoring-params.ts.
 *
 * DRY-RUN por padrão (mostra a v1 e o que faria); grava só com --apply. Idempotente e imutável:
 * insere a versão só se ausente; se já existir, compara com o código (após a validação pelo schema)
 * e avisa quando divergir, mas NUNCA altera uma versão existente (recalibrar = nova versão).
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-criteria-params.ts            # dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-criteria-params.ts --apply    # grava
 *     [--valido-a-partir=AAAA-MM-DD]
 */
import { isDeepStrictEqual } from 'util';
import { PrismaClient, type Prisma } from '@prisma/client';
import type { CriteriaParams } from '../../src/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V1 } from '../../src/services/analiseAtivos/params/criteriaParamsV1';
import { validarCriteriaParams } from '../../src/services/analiseAtivos/params/obterCriteriaParams';

const VERSAO = 1;
const CREATED_BY = 'seed-v2-filtros';
const NOTAS =
  'v1 = spec v2.4 §4.1 (screen.js) + D2/D3/D4 e recomendações de 13/10/2026 ' +
  '(docs/analise-ativos/v2-filtros/decisoes.md)';

export function lerArgs(argv: string[]): { aplicar: boolean; validoAPartir: Date | null } {
  const data = argv.find((a) => a.startsWith('--valido-a-partir='))?.split('=')[1] ?? null;
  if (data !== null && !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error(`--valido-a-partir inválido (AAAA-MM-DD): ${data}`);
  }
  return {
    aplicar: argv.includes('--apply'),
    validoAPartir: data ? new Date(`${data}T00:00:00.000Z`) : null,
  };
}

/** Resumo legível da versão (o dry-run mostra a v1 inteira para conferência). */
export function resumoParams(p: CriteriaParams): string[] {
  const linhas = [
    `versao ${p.versao} · janelas ${p.janelas.join('/')} (padrão ${p.janelaPadrao}) · ` +
      `ano anterior liberado em ${p.ancoraAno.mesLiberaAnoAnterior}/AAAA`,
  ];
  for (const perfil of ['acao', 'fii_tijolo', 'fii_papel'] as const) {
    linhas.push(`  ${perfil}:`);
    for (const c of p.perfis[perfil]) {
      const limite = c.limite !== undefined ? ` limite ${c.limite}` : '';
      const inativo = c.ativo === false ? ` [INATIVO: ${c.motivoInativo}]` : '';
      linhas.push(`    ${c.id.padEnd(6)} ${c.tipo.padEnd(6)} ${c.rotulo}${limite}${inativo}`);
    }
  }
  linhas.push(
    `  acao_financeira: não se aplica ${p.perfis.acao_financeira.naoSeAplica.join(', ')} ` +
      `(${p.perfis.acao_financeira.regraPerfil})`,
    `  equivalencias: ${Object.entries(p.equivalencias)
      .map(([a, b]) => `${a}↔${b}`)
      .join(', ')}`,
    `  regraHibrido: imóveis ≥ ${p.regraHibrido.limiarImoveisPlPct}% do PL → tijolo ` +
      `(${p.regraHibrido.aplicaA.join(', ')})`,
    `  dlEbitda: ${JSON.stringify(p.dlEbitda)}`,
    `  meses: ${JSON.stringify(p.meses)}`,
  );
  return linhas;
}

async function main() {
  const { aplicar, validoAPartir } = lerArgs(process.argv.slice(2));
  const params = validarCriteriaParams(CRITERIA_PARAMS_V1, 'CRITERIA_PARAMS_V1');
  if (params.versao !== VERSAO) throw new Error(`CRITERIA_PARAMS_V1.versao = ${params.versao}`);
  console.log(`=== seed CriteriaParams v${VERSAO} (${aplicar ? 'APPLY' : 'dry-run'}) ===`);
  console.log('  ✓ CRITERIA_PARAMS_V1 válido pelo schema');
  for (const l of resumoParams(params)) console.log(l);

  const prisma = new PrismaClient();
  try {
    const existente = await prisma.criteriaParams.findUnique({ where: { version: VERSAO } });
    if (existente) {
      const lido = validarCriteriaParams(existente.params, `CriteriaParams v${VERSAO} do banco`);
      const igual = isDeepStrictEqual(
        JSON.parse(JSON.stringify(lido)),
        JSON.parse(JSON.stringify(params)),
      );
      console.log(
        igual
          ? `  ✓ v${VERSAO} já existe e é equivalente ao código — nada a fazer`
          : `  ⚠ v${VERSAO} já existe e DIVERGE do código — não alterada (crie uma nova versão)`,
      );
      return;
    }
    const validFrom = validoAPartir ?? new Date();
    if (!aplicar) {
      console.log(
        `  → v${VERSAO} ausente; seria inserida com validFrom ${validFrom.toISOString()}. ` +
          'Use --apply para gravar.',
      );
      return;
    }
    await prisma.criteriaParams.create({
      data: {
        version: VERSAO,
        params: params as unknown as Prisma.InputJsonValue,
        validFrom,
        createdBy: CREATED_BY,
        notas: NOTAS,
      },
    });
    console.log(`  ✓ v${VERSAO} inserida (validFrom ${validFrom.toISOString()})`);
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
