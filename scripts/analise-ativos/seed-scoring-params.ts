/**
 * Semeia um ScoringParams do código (v1 = SCORING_PARAMS_V1; v2 = SCORING_PARAMS_V2, bloco C; v3 =
 * SCORING_PARAMS_V3, alinhamento ao Fundamentei; v4 = SCORING_PARAMS_V4, a v3 com o DPA/DY pelo
 * ano-calendário também fora de dezembro) na tabela scoring_params.
 *
 * D6-a (out/2026): o Índice MF e o semáforo saíram do pipeline, mas o ScoringParams CONTINUA
 * vigente — o job derivados (eventos, proventos, per-share, múltiplos, sanidade/Bloco C), o Quadro
 * (financeiras, régua do FII, universo, pares) e o Valuation leem as partes que ficam. As chaves
 * indice/componentes/semaforo do JSON continuam validadas pelo schema e saem na D6-b
 * (acao.componentes.preco.minPontosHistorico ainda é lido pelo P/L médio de 10 anos).
 *
 * Idempotente e imutável: insere a versão só se ausente; se já existir, compara com o código (após
 * a validação pelo schema, que aplica os defaults dos campos acrescentados depois) e avisa quando
 * divergir, mas NUNCA altera uma versão existente (recalibrar = nova versão).
 *
 * ATENÇÃO v2: a maior versão com validFrom ≤ agora é a ATIVA. Gravar a v2 sem --valido-a-partir no
 * futuro liga as regras de conferência no próximo cálculo (em produção: só com OK do Wellington,
 * depois do dry-run; ver docs/analise-ativos/blocoC/ATIVACAO.md). O padrão continua --versao=1.
 *
 * v3 (fundamentei-regras, F2): INERTE — sem --valido-a-partir nasce com validFrom 2099-01-01 FIXO
 * (VALID_FROM_SCORING_V3, nunca new Date()). Ativar = UPDATE do validFrom com OK, depois do dry-run
 * recalcular-analise --versao-params=3 (docs/analise-ativos/fundamentei-regras/ATIVACAO.md). A v4
 * (21/10/2026) nasce inerte do mesmo jeito (VALID_FROM_SCORING_V4).
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-scoring-params.ts                    # v1 dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-scoring-params.ts --apply            # v1 grava
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-scoring-params.ts --versao=2         # v2 dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-scoring-params.ts --versao=2 --apply \
 *     [--valido-a-partir=AAAA-MM-DD]                                                         # v2 grava
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-scoring-params.ts --versao=3 --apply # v3 inerte (2099)
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-scoring-params.ts --versao=4 --apply # v4 inerte (2099)
 */
import { isDeepStrictEqual } from 'util';
import { PrismaClient, type Prisma } from '@prisma/client';
import type { ScoringParams } from '../../src/services/analiseAtivos/params/scoringParamsSchema';
import { SCORING_PARAMS_V1 } from '../../src/services/analiseAtivos/params/scoringParamsV1';
import { SCORING_PARAMS_V2 } from '../../src/services/analiseAtivos/params/scoringParamsV2';
import {
  SCORING_PARAMS_V3,
  VALID_FROM_SCORING_V3,
} from '../../src/services/analiseAtivos/params/scoringParamsV3';
import {
  SCORING_PARAMS_V4,
  VALID_FROM_SCORING_V4,
} from '../../src/services/analiseAtivos/params/scoringParamsV4';
import { validarScoringParams } from '../../src/services/analiseAtivos/params/obterScoringParams';

export interface DefVersao {
  params: ScoringParams;
  rotulo: string;
  validFromPadrao: () => Date;
  createdBy: string;
  notas: string;
}

export const VERSOES: Record<number, DefVersao> = {
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
  3: {
    params: SCORING_PARAMS_V3,
    rotulo: 'SCORING_PARAMS_V3',
    // inerte: validFrom FIXO no futuro (desenho F2); ativar = UPDATE do validFrom com OK
    validFromPadrao: () => new Date(VALID_FROM_SCORING_V3),
    createdBy: 'seed-fundamentei-regras',
    notas:
      "v3 = v2 + payout.regra 'dfc', proventos por data-ex (sem data-ex futura, exercício real fora " +
      'de dezembro) e serie10aPorDtFim (docs/analise-ativos/fundamentei-regras/desenho.json, F2)',
  },
  4: {
    params: SCORING_PARAMS_V4,
    rotulo: 'SCORING_PARAMS_V4',
    // inerte como a v3; ativar = UPDATE do validFrom com OK
    validFromPadrao: () => new Date(VALID_FROM_SCORING_V4),
    createdBy: 'seed-fundamentei-regras',
    notas:
      'v4 = v3 com o DPA/DY do ano pelo ano-calendário da data-ex também no exercício fora de ' +
      'dezembro; decisão do Wellington de 21/10/2026',
  },
};

/** validFrom que o seed usaria (o informado ou o padrão da versão). */
export function validFromDoSeed(versao: number, validoAPartir: Date | null): Date {
  return validoAPartir ?? VERSOES[versao].validFromPadrao();
}

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
    const validFrom = validFromDoSeed(versao, validoAPartir);
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
