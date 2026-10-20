/**
 * Semeia uma versão do CriteriaParams (Filtros de Fundamentos) na tabela criteria_params.
 * Molde: seed-scoring-params.ts.
 *
 * DRY-RUN por padrão (mostra a versão e o que faria); grava só com --apply. Idempotente e imutável:
 * insere a versão só se ausente; se já existir, compara com o código (após a validação pelo schema)
 * e avisa quando divergir, mas NUNCA altera uma versão existente (recalibrar = nova versão).
 *
 * v2.5: --versao=N escolhe a versão do código (1 = v2.4, 2 = spec do Pedro + camada de fontes,
 * 3 = v2 + Stocks e REITs pela SEC, 4 = v3 com o 'alav' do fii_tijolo sobre o ativo total (A6); padrão
 * 1, o comportamento antigo do script) e --valid-from=AAAA-MM-DD a vigência. Para ativar sem
 * pressa (desenho final.ativacao_prod): semear com validFrom no FUTURO (ex.: 2099-01-01), rodar
 * 'criterios --sem-aplicar --versao-params=N' e só então adiantar o validFrom. Grava o JSON como
 * foi escrito (a v1 com os nomes legados, igual à de produção; o parse aplica o alias).
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-criteria-params.ts --versao=2   # dry-run
 *   npx tsx --env-file=.env scripts/analise-ativos/seed-criteria-params.ts --versao=2 \
 *     --valid-from=2099-01-01 --apply                                                   # grava
 *   (--valido-a-partir=AAAA-MM-DD continua aceito como sinônimo de --valid-from)
 */
import { isDeepStrictEqual } from 'util';
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  fontesEfetivas,
  idsNaoSeAplica,
  type CriteriaParams,
  type CriteriaParamsEntrada,
} from '../../src/services/analiseAtivos/params/criteriaParamsSchema';
import { CRITERIA_PARAMS_V1_JSON } from '../../src/services/analiseAtivos/params/criteriaParamsV1';
import { CRITERIA_PARAMS_V2_JSON } from '../../src/services/analiseAtivos/params/criteriaParamsV2';
import { CRITERIA_PARAMS_V3_JSON } from '../../src/services/analiseAtivos/params/criteriaParamsV3';
import { CRITERIA_PARAMS_V4_JSON } from '../../src/services/analiseAtivos/params/criteriaParamsV4';
import { validarCriteriaParams } from '../../src/services/analiseAtivos/params/obterCriteriaParams';

const CREATED_BY = 'seed-v2-filtros';

/** Versões do código que o script sabe semear (JSON como é gravado + notas da linha). */
export const VERSOES_CODIGO: Record<number, { json: CriteriaParamsEntrada; notas: string }> = {
  1: {
    json: CRITERIA_PARAMS_V1_JSON,
    notas:
      'v1 = spec v2.4 §4.1 (screen.js) + D2/D3/D4 e recomendações de 13/10/2026 ' +
      '(docs/analise-ativos/v2-filtros/decisoes.md)',
  },
  2: {
    json: CRITERIA_PARAMS_V2_JSON,
    notas:
      'v2 = regras da spec do Pedro (§3.2, §4.1, §4.4, §5, §6) + camada de fontes; decisões de ' +
      '15/10/2026 (docs/analise-ativos/v25-regras-pedro/desenho.json)',
  },
  3: {
    json: CRITERIA_PARAMS_V3_JSON,
    notas:
      'v3 = v2 (Brasil, igual) + Stocks e REITs pela SEC (perfis stock, stock_financeira e reit; ' +
      'universo ≥ US$ 2 bi); decisões de 17/10/2026 (docs/analise-ativos/stocks-reits/desenho.json)',
  },
  4: {
    json: CRITERIA_PARAMS_V4_JSON,
    notas:
      "v4 = v3 com o critério 'alav' do fii_tijolo sobre o ativo total (obrigações ÷ ativo ≤ 15%, " +
      'série leverage_assets_pct, mesmo id); decisão 1 do Wellington de 19/10/2026 ' +
      '(docs/analise-ativos/fundamentei-trazer/desenho.json, item 7)',
  },
};

export function lerArgs(argv: string[]): {
  aplicar: boolean;
  validoAPartir: Date | null;
  versao: number;
} {
  const valor = (nome: string) => argv.find((a) => a.startsWith(`${nome}=`))?.split('=')[1];
  const data = valor('--valid-from') ?? valor('--valido-a-partir') ?? null;
  if (data !== null && !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error(`--valid-from inválido (AAAA-MM-DD): ${data}`);
  }
  const versaoTexto = valor('--versao');
  const versao = versaoTexto === undefined ? 1 : Number(versaoTexto);
  if (!Number.isInteger(versao) || !VERSOES_CODIGO[versao]) {
    throw new Error(
      `--versao inválida: ${versaoTexto} (disponíveis: ${Object.keys(VERSOES_CODIGO).join(', ')})`,
    );
  }
  return {
    aplicar: argv.includes('--apply'),
    validoAPartir: data ? new Date(`${data}T00:00:00.000Z`) : null,
    versao,
  };
}

/** Resumo legível da versão (o dry-run mostra a v1 inteira para conferência). */
export function resumoParams(p: CriteriaParams): string[] {
  const linhas = [
    `versao ${p.versao} · janelas ${p.janelas.join('/')} (padrão ${p.janelaPadrao}) · ` +
      `ano anterior liberado em ${p.ancoraAno.mesLiberaAnoAnterior}/AAAA`,
  ];
  for (const perfil of ['acao', 'fii_tijolo', 'fii_papel', 'stock', 'reit'] as const) {
    const lista = p.perfis[perfil];
    if (!lista) continue;
    linhas.push(`  ${perfil}:`);
    for (const c of lista) {
      const limite = c.limite !== undefined ? ` limite ${c.limite}` : '';
      const inativo = c.ativo === false ? ` [INATIVO: ${c.motivoInativo}]` : '';
      const serie = c.serieFallback ? `${c.serie}→${c.serieFallback}` : c.serie;
      linhas.push(
        `    ${c.id.padEnd(6)} ${c.tipo.padEnd(6)} ${c.rotulo}${limite}${inativo} · ${serie}`,
      );
    }
  }
  const fin = p.perfis.acao_financeira;
  const nsa = idsNaoSeAplica(p, 'acao_financeira');
  const f = fontesEfetivas(p);
  linhas.push(
    `  acao_financeira: não se aplica ${nsa.length ? nsa.join(', ') : '(nenhum: n de 6)'} ` +
      `(${fin.regraPerfil}) · margem sem receita comparável: ${fin.margemSemReceitaComparavel} ` +
      `· nota no Essencial: ${fin.notaEssencial ? 'sim' : 'não'}`,
    `  margem com receita ≤ lucro: ${p.criterios.margem.receitaMenorQueLucro}`,
    `  fontes: padrão ${f.prioridade.padrao.join(' > ')} · por série ${JSON.stringify(f.prioridade.porSerie)} ` +
      `· agregação ${JSON.stringify(f.agregacaoAnual)} · sanidade em ${f.sanidade.aplicaA.join(', ')}`,
    `  equivalencias: ${Object.entries(p.equivalencias)
      .map(([a, b]) => `${a}↔${b}`)
      .join(', ')}`,
    `  regraHibrido: imóveis ≥ ${p.regraHibrido.limiarImoveisPlPct}% do PL → tijolo ` +
      `(${p.regraHibrido.aplicaA.join(', ')})`,
    `  dlEbitda: ${JSON.stringify(p.dlEbitda)}`,
    `  meses: ${JSON.stringify(p.meses)}`,
  );
  if (p.perfis.stock_financeira) {
    const nsaEua = idsNaoSeAplica(p, 'stock_financeira');
    linhas.push(
      `  stock_financeira: não se aplica ${nsaEua.length ? nsaEua.join(', ') : '(nenhum: n de 6)'} ` +
        `(${p.perfis.stock_financeira.regraPerfil})`,
    );
  }
  if (f.prioridade.porMercado) {
    linhas.push(`  fontes por mercado: ${JSON.stringify(f.prioridade.porMercado)}`);
  }
  if (p.universoEua) {
    const u = p.universoEua;
    linhas.push(
      `  universo EUA: stocks ≥ US$ ${u.stock.floatEntradaUsd / 1e9} bi (sai < ${u.stock.floatSaidaUsd / 1e9} bi) · ` +
        `REITs ≥ US$ ${u.reit.floatEntradaUsd / 1e9} bi (sai < ${u.reit.floatSaidaUsd / 1e9} bi)`,
    );
  }
  return linhas;
}

async function main() {
  const { aplicar, validoAPartir, versao: VERSAO } = lerArgs(process.argv.slice(2));
  const { json, notas: NOTAS } = VERSOES_CODIGO[VERSAO];
  const params = validarCriteriaParams(json, `CRITERIA_PARAMS_V${VERSAO}`);
  if (params.versao !== VERSAO)
    throw new Error(`CRITERIA_PARAMS_V${VERSAO}.versao = ${params.versao}`);
  console.log(`=== seed CriteriaParams v${VERSAO} (${aplicar ? 'APPLY' : 'dry-run'}) ===`);
  console.log(`  ✓ CRITERIA_PARAMS_V${VERSAO} válido pelo schema`);
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
        // o JSON como foi escrito (a v1 com os nomes legados, igual à de produção)
        params: json as unknown as Prisma.InputJsonValue,
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
