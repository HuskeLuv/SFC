/**
 * Exporta (SÓ LEITURA) do banco de DEV as fixtures da Fase 1 usadas pelo seed do CI/e2e:
 *  - prisma/fixtures/analise-ativos/fase0-amostra.json: linhas das tabelas da Fase 0 para os
 *    símbolos da amostra (as rotas B/C leem essas tabelas);
 *  - prisma/fixtures/analise-ativos/quadro-linhas.json: as linhas de analise_quadro_linhas dos
 *    mesmos símbolos (a fatia A regera este arquivo com o gerador real).
 *
 * Amostra (spec 0a): ações WEGE3, ROMI3, KEPL3, TUPY3, FRAS3, PETR4, ITUB4, BBAS3, KLBN11, TGMA3
 * (incompleto), AURE3 (zero_regra), SOJA3; FIIs HGLG11, XPLG11, BTLG11, KNCR11, MXRF11, HFOF11
 * (FoF) e HCTR11 (sem score); + CELP3 (ação com score fora do Quadro, só na busca).
 * Cotação diária reduzida: último pregão de cada mês + últimos 45 dias.
 *
 * Uso: npx tsx --env-file=.env scripts/analise-ativos/exportar-fixtures-fase1.ts
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';

export const SIMBOLOS_FIXTURE = [
  'WEGE3',
  'ROMI3',
  'KEPL3',
  'TUPY3',
  'FRAS3',
  'PETR4',
  'ITUB4',
  'BBAS3',
  'KLBN11',
  'TGMA3',
  'AURE3',
  'SOJA3',
  'CELP3',
  'HGLG11',
  'XPLG11',
  'BTLG11',
  'KNCR11',
  'MXRF11',
  'HFOF11',
  'HCTR11',
] as const;

const DESDE = new Date('2015-01-01');
const DIR = path.join(__dirname, '..', '..', 'prisma', 'fixtures', 'analise-ativos');

const json = (v: unknown) =>
  JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? x.toString() : x));

/** Linha sem as colunas nulas (anuláveis voltam como null no createMany); Json interno intacto. */
const semNulos = (linha: unknown) =>
  linha && typeof linha === 'object'
    ? Object.fromEntries(Object.entries(linha).filter(([, y]) => y !== null))
    : linha;

/** Uma linha de tabela por linha do arquivo (diff legível, sem indentação que dobra o tamanho). */
function serializarLinhas(linhas: unknown[]): string {
  return `[\n${linhas.map((l) => json(semNulos(l))).join(',\n')}\n]`;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const S = [...SIMBOLOS_FIXTURE];
    const [tickersAcao, tickersFii] = await Promise.all([
      prisma.cvmCompanyTicker.findMany({ where: { symbol: { in: S } } }),
      prisma.fiiTickerMap.findMany({ where: { ticker: { in: S } } }),
    ]);
    const cnpjsAcao = [...new Set(tickersAcao.map((t) => t.cnpj))];
    const cnpjsFii = [...new Set(tickersFii.map((t) => t.cnpj))];
    const cnpjs = [...cnpjsAcao, ...cnpjsFii];
    const raizes = [...new Set(tickersAcao.map((t) => t.symbol.slice(0, 4)))];
    const ultimoScore = await prisma.assetScore.aggregate({ _max: { dataRef: true } });

    const [
      scoringParams,
      cvmCompany,
      assetSetorB3,
      fiiMonthly,
      fiiQuarterly,
      assetFundamentalsPeriod,
      assetShareCount,
      assetQuoteResumo,
      assetProventoAuditado,
      assetCorporateActionCheck,
      assetPerShareYearly,
      assetMultiplesYearly,
      assetMultiplesCurrent,
      assetScore,
      assetEvento,
      quadro,
    ] = await Promise.all([
      prisma.scoringParams.findMany(),
      prisma.cvmCompany.findMany({ where: { cnpj: { in: cnpjsAcao } } }),
      prisma.assetSetorB3.findMany({ where: { raiz: { in: raizes } } }),
      prisma.fiiMonthly.findMany({ where: { cnpj: { in: cnpjsFii } } }),
      prisma.fiiQuarterly.findMany({ where: { cnpj: { in: cnpjsFii } } }),
      prisma.assetFundamentalsPeriod.findMany({
        where: {
          emissorId: { in: cnpjsAcao },
          tipoPeriodo: { in: ['FY', 'TTM'] },
        },
      }),
      prisma.assetShareCount.findMany({ where: { cnpj: { in: cnpjsAcao } } }),
      prisma.assetQuoteResumo.findMany({ where: { symbol: { in: S } } }),
      prisma.assetProventoAuditado.findMany({
        where: { symbol: { in: S }, OR: [{ dataComReal: null }, { dataComReal: { gte: DESDE } }] },
      }),
      prisma.assetCorporateActionCheck.findMany({ where: { symbol: { in: S } } }),
      prisma.assetPerShareYearly.findMany({ where: { symbol: { in: S } } }),
      prisma.assetMultiplesYearly.findMany({ where: { symbol: { in: S } } }),
      prisma.assetMultiplesCurrent.findMany({ where: { symbol: { in: S } } }),
      prisma.assetScore.findMany({
        where: { symbol: { in: S }, dataRef: ultimoScore._max.dataRef ?? undefined },
      }),
      prisma.assetEvento.findMany({ where: { cnpj: { in: cnpjs } } }),
      prisma.analiseQuadroLinha.findMany({
        where: { symbol: { in: S } },
        orderBy: { symbol: 'asc' },
      }),
    ]);

    const assetQuoteDaily = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT q.* FROM "asset_quotes_daily" q
      JOIN (
        SELECT "symbol", MAX("date") AS "date" FROM "asset_quotes_daily"
        WHERE "symbol" IN (${Prisma.join(S)})
        GROUP BY "symbol", date_trunc('month', "date")
      ) m ON m."symbol" = q."symbol" AND m."date" = q."date"
      UNION
      SELECT q.* FROM "asset_quotes_daily" q
      WHERE q."symbol" IN (${Prisma.join(S)}) AND q."date" >= (
        SELECT MAX("date") - INTERVAL '45 days' FROM "asset_quotes_daily"
      )
      ORDER BY 1, 2`;

    const tabelas = {
      scoringParams,
      cvmCompany,
      cvmCompanyTicker: tickersAcao,
      assetSetorB3,
      fiiTickerMap: tickersFii,
      fiiMonthly,
      fiiQuarterly,
      assetFundamentalsPeriod,
      assetShareCount,
      assetQuoteResumo,
      assetQuoteDaily,
      assetProventoAuditado,
      assetCorporateActionCheck,
      assetPerShareYearly,
      assetMultiplesYearly,
      assetMultiplesCurrent,
      assetScore,
      assetEvento,
    };

    mkdirSync(DIR, { recursive: true });
    const corpo = Object.entries(tabelas)
      .map(([k, v]) => `${json(k)}: ${serializarLinhas(v)}`)
      .join(',\n');
    const cabecalho = json({
      geradoEm: new Date().toISOString(),
      fonte: 'banco de dev (Neon), só leitura',
      simbolos: S,
    });
    writeFileSync(
      path.join(DIR, 'fase0-amostra.json'),
      `{"meta": ${cabecalho},\n"tabelas": {\n${corpo}\n}}\n`,
    );
    writeFileSync(
      path.join(DIR, 'quadro-linhas.json'),
      `${serializarLinhas(quadro.map((l) => ({ ...l, assetId: null })))}\n`,
    );
    console.log('=== exportar-fixtures-fase1 ===');
    for (const [k, v] of Object.entries(tabelas)) console.log(`  ${k}: ${v.length}`);
    console.log(`  analiseQuadroLinha: ${quadro.length}`);
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
