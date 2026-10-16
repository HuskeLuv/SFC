/**
 * Exporta (SÓ LEITURA) do banco de DEV a fixture REAL dos Filtros de Fundamentos usada pelo
 * series.test (fatia A): src/services/analiseAtivos/regras/criterios/__tests__/fixtures/
 * dev-<data>.json com os BRUTOS (as mesmas leituras do job 'criterios': lerBrutosAcoes e
 * lerBrutosFii) de 12 ativos — ações não financeiras, financeiras (n de 3) e FIIs de tijolo,
 * papel e FoF. O teste monta as séries com as funções puras e confere os números.
 *
 * Amostra: WEGE3, PETR4, ITUB4, BBAS3, BBSE3, ITSA4, TAEE11, AZUL3 (ações) e HGLG11 (split +
 * Obrigações/PL 20,2% em 2024), XPLG11, KNCR11, MXRF11 (FIIs).
 *
 * Uso: npx tsx --env-file=.env scripts/analise-ativos/exportar-fixtures-criterios.ts [--hoje=AAAA-MM-DD]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { CRITERIA_PARAMS_CODIGO } from '../../src/services/analiseAtivos/params/criteriaParamsCodigo';
import { obterScoringParams } from '../../src/services/analiseAtivos/params/obterScoringParams';
import { anoFimGlobal } from '../../src/services/analiseAtivos/regras/criterios/ancoraJanela';
import { lerBrutosAcoes } from '../../src/services/analiseAtivos/regras/criterios/seriesAcao';
import { lerBrutosFii } from '../../src/services/analiseAtivos/regras/criterios/seriesFii';
import {
  listarEmissores,
  listarFiisListados,
  listarTickersAcoes,
} from '../../src/services/analiseAtivos/repositorio/universo';

export const ACOES_FIXTURE = [
  'WEGE3',
  'PETR4',
  'ITUB4',
  'BBAS3',
  'BBSE3',
  'ITSA4',
  'TAEE11',
  'AZUL3',
] as const;
export const FIIS_FIXTURE = ['HGLG11', 'XPLG11', 'KNCR11', 'MXRF11'] as const;

const DIR = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'services',
  'analiseAtivos',
  'regras',
  'criterios',
  '__tests__',
  'fixtures',
);

async function main() {
  const hoje =
    process.argv.find((a) => a.startsWith('--hoje='))?.split('=', 2)[1] ??
    new Date().toISOString().slice(0, 10);
  const prisma = new PrismaClient();
  try {
    const scoring = await obterScoringParams(prisma);
    const anoFim = anoFimGlobal(hoje, CRITERIA_PARAMS_CODIGO);
    const desdeAno = anoFim - Math.max(...CRITERIA_PARAMS_CODIGO.janelas);

    const tickers = (await listarTickersAcoes(prisma)).filter((t) =>
      (ACOES_FIXTURE as readonly string[]).includes(t.symbol),
    );
    const cnpjs = [...new Set(tickers.map((t) => t.cnpj))];
    const emissores = await listarEmissores(prisma, cnpjs, scoring.params);
    const empresas = emissores.map((e) => ({
      cnpj: e.cnpj,
      ehFinanceira: e.ehFinanceira,
      escopoPreferido: e.escopoPreferido,
      symbols: tickers.filter((t) => t.cnpj === e.cnpj).map((t) => t.symbol),
    }));
    const brutosAcoes = await lerBrutosAcoes(prisma, empresas, desdeAno);

    const fiis = (await listarFiisListados(prisma))
      .filter((f) => (FIIS_FIXTURE as readonly string[]).includes(f.symbol))
      .map((f) => ({ symbol: f.symbol, cnpj: f.cnpj, conferido: f.conferido }));
    const brutosFii = await lerBrutosFii(prisma, fiis, desdeAno);

    const fixture = {
      origem:
        'banco de DEV (Neon), só leitura — scripts/analise-ativos/exportar-fixtures-criterios.ts',
      hoje,
      anoFim,
      desdeAno,
      scoringParamsVersao: scoring.versao,
      /** a parte do ScoringParams que a contagem de meses lê */
      proventosParams: {
        tiposFii: scoring.params.sanidade.proventos.tiposFii,
        mesCorrenteTolerado: scoring.params.sanidade.proventos.mesCorrenteTolerado,
      },
      acoes: empresas
        .sort((a, b) => a.symbols[0].localeCompare(b.symbols[0]))
        .map((e) => {
          const b = brutosAcoes.get(e.cnpj)!;
          return {
            symbols: e.symbols.sort(),
            ...b,
            fys: [...b.fys].sort(
              (x, y) =>
                x.dtFim.localeCompare(y.dtFim) ||
                x.escopo.localeCompare(y.escopo) ||
                x.versao - y.versao,
            ),
          };
        }),
      fiis: fiis
        .map((f) => brutosFii.get(f.symbol)!)
        .sort((a, b) => a.symbol.localeCompare(b.symbol)),
    };
    mkdirSync(DIR, { recursive: true });
    const arquivo = path.join(DIR, `dev-${hoje}.json`);
    writeFileSync(arquivo, `${JSON.stringify(fixture, null, 1)}\n`);
    console.log(
      `fixture: ${arquivo} (${fixture.acoes.length} empresas, ${fixture.fiis.length} FIIs)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
