/**
 * Seed das fixtures EUA (Stocks e REITs) do banco efêmero do CI/e2e — SEM rede: nada de SEC ao vivo
 * em teste. Fonte: prisma/fixtures/analise-ativos/eua-fundamentos.json (15 empresas da amostra do
 * desenho — 9 stocks, inclusive a financeira JPM, e 6 REITs — com os 10-K já extraídos do
 * companyfacts da SEC em 17/10/2026).
 *
 * DONO: fatia C (e2e/analise-ativos-eua.spec.ts); a fatia D usa as MESMAS linhas no e2e de escrita
 * sem editar este arquivo. Chamado por seedAnaliseAtivos depois das fixtures BR (só no banco efêmero:
 * asset_scores vazio). Também roda sozinho no banco de DEV local (amostra de tela):
 *   DATABASE_URL=… npx tsx prisma/seedAnaliseAtivosEua.ts
 *
 * Grava, idempotente:
 *  1. SecCompany + SecCompanyTicker (upsert) e AssetFundamentalsPeriod source 'SEC' (upsert pela
 *     chave única, versao 1);
 *  2. criteria_eval das classes stock/reit (gravarCriteriaEval com CLASSES_EUA — nunca toca acao/fii),
 *     avaliadas pelo MESMO motor puro (avaliarAtivo) com a criteria_params vigente do código (v3);
 *  3. analise_quadro_linhas stock/reit (gravarLinhasQuadro com CLASSES_EUA), no contrato que a
 *     fatia B grava (analiseAtivosEua.ts → "Quadro EUA").
 * As séries e a linha do Quadro aqui são uma montagem MÍNIMA para fixture (o job 'criterios-eua' /
 * 'quadro-eua' da fatia B é a fonte em produção). Âncora das janelas = último FY das fixtures (2025),
 * para o e2e não mudar com a data do CI.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { Prisma, type PrismaClient } from '@prisma/client';
import { CRITERIA_PARAMS_CODIGO } from '../src/services/analiseAtivos/params/criteriaParamsCodigo';
import type { CriteriaParams } from '../src/services/analiseAtivos/params/criteriaParamsSchema';
import { avaliarAtivo } from '../src/services/analiseAtivos/regras/criterios/avaliarAtivo';
import { valoresAnoAcao } from '../src/services/analiseAtivos/regras/criterios/seriesAcao';
import { setorDoSic, TEXTOS_EUA } from '../src/services/analiseAtivos/textosEua';
import { CLASSES_EUA, type ClasseEua } from '../src/types/analiseAtivosApi';
import {
  emissorIdSec,
  normalizarTickerEua,
  symbolAnaliseDaSec,
  type SegmentoReit,
} from '../src/types/analiseAtivosEua';
import type {
  AvaliacaoAtivo,
  PerfilCriterioEua,
  SerieCriterio,
} from '../src/types/analiseAtivosCriterios';

const ARQUIVO = path.join(__dirname, 'fixtures', 'analise-ativos', 'eua-fundamentos.json');

export interface AnoFixtureEua {
  ano: number;
  dtFim: string;
  receita: number | null;
  ebit: number | null;
  depreciacaoAmortizacao: number | null;
  lucroLiquido: number | null;
  pl: number | null;
  caixa: number | null;
  aplicacoesFinanceiras: number | null;
  dividaBruta: number | null;
  fco: number | null;
  capex: number | null;
  dividendosPagos: number | null;
  acoesMediaDiluida: number | null;
  lpa: number | null;
  dpa: number | null;
  dpaOrigem: 'cash_paid' | 'declared' | 'derivado' | null;
  recompras: number | null;
  flags: string[];
}

export interface EmpresaFixtureEua {
  /** forma da SEC (BRK-B) */
  ticker: string;
  cik: string;
  nome: string;
  classe: ClasseEua;
  sic: number;
  bolsa: 'NYSE' | 'Nasdaq';
  segmento?: SegmentoReit;
  ehFinanceira?: boolean;
  exercicioFimMmdd: string | null;
  publicFloatUsd: number | null;
  publicFloatData: string | null;
  anos: AnoFixtureEua[];
}

export interface ArquivoFixturesEua {
  fonte: string;
  empresas: EmpresaFixtureEua[];
}

export function lerFixturesEua(arquivo = ARQUIVO): ArquivoFixturesEua {
  return JSON.parse(readFileSync(arquivo, 'utf8')) as ArquivoFixturesEua;
}

type Serie = Record<number, number | null>;
const finito = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const div = (a: number | null, b: number | null): number | null =>
  finito(a) && finito(b) && b !== 0 ? a / b : null;

/** Perfil EUA (regra do desenho: financeira por SIC/override; REIT = 'reit'). */
export function perfilFixtureEua(e: Pick<EmpresaFixtureEua, 'classe' | 'ehFinanceira'>) {
  if (e.classe === 'reit') return 'reit' satisfies PerfilCriterioEua;
  return e.ehFinanceira ? 'stock_financeira' : 'stock';
}

/** Valores de um FY no formato das ações (US$ mi, %, ×), pela mesma função pura do Brasil. */
function valoresAno(a: AnoFixtureEua) {
  return valoresAnoAcao({
    emissorId: '',
    dtFim: a.dtFim,
    escopo: 'con',
    versao: 1,
    anoFiscal: a.ano,
    receita: a.receita,
    ebit: a.ebit,
    depreciacaoAmortizacao: a.depreciacaoAmortizacao,
    lucroLiquido: a.lucroLiquido,
    lucroAtribuivel: a.lucroLiquido,
    lucroAtribuivelIndividual: null,
    caixa: a.caixa,
    aplicacoesFinanceiras: a.aplicacoesFinanceiras,
    dividaBrutaCp: null,
    dividaBrutaLp: a.dividaBruta,
    fco: a.fco,
    capex: a.capex,
    naoSeAplica: [],
    flags: [],
  });
}

/** Séries anuais (SeriesCriterios) de uma empresa da fixture. Pura. */
export function seriesFixtureEua(e: EmpresaFixtureEua): Partial<Record<SerieCriterio, Serie>> {
  const s: Partial<Record<SerieCriterio, Serie>> = {};
  const por = (k: SerieCriterio, ano: number, v: number | null) => {
    (s[k] ??= {})[ano] = v;
  };
  for (const a of e.anos) {
    const v = valoresAno(a);
    por('revenue', a.ano, v.revenue);
    por('net_debt_ebitda', a.ano, v.net_debt_ebitda);
    if (e.classe === 'stock') {
      por('net_income', a.ano, v.net_income);
      por('ebitda', a.ano, v.ebitda);
      por('net_margin', a.ano, v.net_margin);
      por('free_cash_flow', a.ano, v.free_cash_flow);
    } else {
      por('dividend_per_share', a.ano, finito(a.dpa) ? a.dpa : null);
      por('ocf_per_share', a.ano, div(a.fco, a.acoesMediaDiluida));
      // FCO ≤ 0 conta como fora do limite (como o EBITDA ≤ 0 do 'dl')
      por(
        'cash_payout_pct',
        a.ano,
        !finito(a.fco) || !finito(a.dividendosPagos)
          ? null
          : a.fco > 0
            ? (a.dividendosPagos / a.fco) * 100
            : Number.POSITIVE_INFINITY,
      );
    }
  }
  return s;
}

/** Último FY fechado da empresa (≤ anoFim). */
function ultimoAno(e: EmpresaFixtureEua, anoFim: number): AnoFixtureEua | null {
  const anos = e.anos.filter((a) => a.ano <= anoFim).sort((x, y) => x.ano - y.ano);
  return anos[anos.length - 1] ?? null;
}

/** Anos seguidos (a partir do último) em que `ok(a, anterior)` vale. */
function seguidos(
  anos: readonly AnoFixtureEua[],
  ok: (a: AnoFixtureEua, ant: AnoFixtureEua | undefined) => boolean,
): number {
  const ord = [...anos].sort((x, y) => x.ano - y.ano);
  let n = 0;
  for (let i = ord.length - 1; i >= 0; i--) {
    if (!ok(ord[i], ord[i - 1])) break;
    n++;
  }
  return n;
}

const arred = (v: number | null, casas = 4): number | null =>
  finito(v) ? Number(v.toFixed(casas)) : null;

/** Linha stock/reit de analise_quadro_linhas (contrato "Quadro EUA" de analiseAtivosEua.ts). */
export function linhaQuadroFixtureEua(
  e: EmpresaFixtureEua,
  avaliacao: AvaliacaoAtivo,
  compactos: Prisma.InputJsonValue,
  anoFim: number,
  agora: Date,
  paramsVersion: number,
): Prisma.AnaliseQuadroLinhaCreateManyInput {
  const u = ultimoAno(e, anoFim);
  const anos = e.anos.filter((a) => a.ano <= anoFim);
  const v = u ? valoresAno(u) : null;
  const roe = u && finito(u.pl) && u.pl > 0 ? div(u.lucroLiquido, u.pl) : null;
  const payout =
    u && finito(u.lucroLiquido) && u.lucroLiquido > 0
      ? div(u.dividendosPagos, u.lucroLiquido)
      : null;
  const flags = [...new Set(anos.flatMap((a) => a.flags))];
  return {
    symbol: symbolAnaliseDaSec(e.ticker),
    classe: e.classe,
    cnpj: emissorIdSec(e.cik),
    dataRef: new Date(`${agora.toISOString().slice(0, 10)}T00:00:00Z`),
    noQuadro: true,
    foraDoQuadroMotivo: null,
    temScore: false,
    estadoIndice: 'sem_score',
    nome: e.nome,
    setor: setorDoSic(e.sic),
    segmento: e.segmento ? TEXTOS_EUA.segmentosReit[e.segmento] : null,
    regua: avaliacao.perfil,
    preco: null,
    precoData: null,
    variacaoDiaPct: null,
    statusCriterios: [],
    motivosIncompleto: [],
    componentesZeroRegra: [],
    anosLucroConsecutivos: seguidos(anos, (a) => finito(a.lucroLiquido) && a.lucroLiquido > 0),
    anosDividendo: seguidos(
      anos,
      (a, ant) => !!ant && finito(a.dpa) && finito(ant.dpa) && a.dpa > ant.dpa,
    ),
    roePct: roe === null ? null : arred(roe * 100, 2),
    margemLiquidaPct: v ? arred(v.net_margin, 2) : null,
    divLiqEbitda: v && finito(v.net_debt_ebitda) ? arred(v.net_debt_ebitda, 2) : null,
    payoutPct: payout === null ? null : arred(payout * 100, 2),
    naoSeAplica: [],
    serie10a: anos
      .filter((a) => a.ano > anoFim - 10)
      .map((a) => ({
        ano: a.ano,
        valor: finito(a.lucroLiquido) ? arred(a.lucroLiquido / 1e6, 1) : null,
      })),
    pares: [],
    assetId: null,
    flags,
    paramsVersion,
    geradoEm: agora,
    criterios: compactos,
    perfilCriterios: avaliacao.perfil,
    moeda: 'USD',
    bolsa: e.bolsa,
    dpa: u && finito(u.dpa) ? arred(u.dpa, 4) : null,
    fcoPorAcao: u ? arred(div(u.fco, u.acoesMediaDiluida), 4) : null,
    dividendosFcoPct:
      u && finito(u.fco) && u.fco > 0 ? arred(div(u.dividendosPagos, u.fco)! * 100, 2) : null,
  };
}

export interface FixturesEuaMontadas {
  avaliacoes: Array<{ symbol: string; cnpj: string; avaliacao: AvaliacaoAtivo }>;
  linhas: Prisma.AnaliseQuadroLinhaCreateManyInput[];
}

/** Monta avaliações e linhas do Quadro (puro: o teste confere sem banco). */
export async function montarFixturesEua(
  arquivo: ArquivoFixturesEua,
  params: CriteriaParams = CRITERIA_PARAMS_CODIGO,
  agora: Date = new Date(),
): Promise<FixturesEuaMontadas> {
  const { compactarAvaliacao } =
    await import('../src/services/analiseAtivos/repositorio/criterios');
  const anoFim = Math.max(...arquivo.empresas.flatMap((e) => e.anos.map((a) => a.ano)));
  const avaliacoes: FixturesEuaMontadas['avaliacoes'] = [];
  const linhas: FixturesEuaMontadas['linhas'] = [];
  for (const e of arquivo.empresas) {
    const symbol = symbolAnaliseDaSec(e.ticker);
    const avaliacao = avaliarAtivo(
      {
        symbol,
        classe: e.classe,
        perfil: perfilFixtureEua(e),
        anoFim,
        series: seriesFixtureEua(e),
        meses: null,
      },
      params,
      params.versao,
    );
    avaliacoes.push({ symbol, cnpj: emissorIdSec(e.cik), avaliacao });
    linhas.push(
      linhaQuadroFixtureEua(
        e,
        avaliacao,
        compactarAvaliacao(avaliacao) as unknown as Prisma.InputJsonValue,
        anoFim,
        agora,
        params.versao,
      ),
    );
  }
  return { avaliacoes, linhas };
}

const dia = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const dec = (v: number | null) => (finito(v) ? new Prisma.Decimal(v) : null);

/** Cadastro + fundamentos SEC da fixture (upserts idempotentes). */
async function gravarCadastroEFundamentos(
  prisma: PrismaClient,
  arquivo: ArquivoFixturesEua,
  agora: Date,
): Promise<void> {
  for (const e of arquivo.empresas) {
    const ultimo = e.anos[e.anos.length - 1];
    const cadastro = {
      nome: e.nome,
      sic: e.sic,
      sicDescricao: null,
      exercicioFimMmdd: e.exercicioFimMmdd,
      bolsa: e.bolsa,
      publicFloatUsd: dec(e.publicFloatUsd),
      publicFloatData: e.publicFloatData ? dia(e.publicFloatData) : null,
      floatSanidade: 'ok',
      classe: e.classe,
      ehReit: e.classe === 'reit',
      reitTipo: e.classe === 'reit' ? 'equity' : null,
      segmento: e.segmento ?? null,
      ehFinanceira: e.ehFinanceira === true,
      noUniverso: true,
      foraMotivo: null,
      origem: 'regra',
      ultimo10k: null,
      ultimo10kEm: ultimo ? dia(ultimo.dtFim) : null,
      fetchedAt: agora,
    };
    await prisma.secCompany.upsert({
      where: { cik: e.cik },
      update: cadastro,
      create: { cik: e.cik, ...cadastro },
    });
    const validFrom = dia('2026-10-17');
    await prisma.secCompanyTicker.upsert({
      where: { symbol_validFrom: { symbol: e.ticker, validFrom } },
      update: { cik: e.cik, principal: true, symbolNorm: normalizarTickerEua(e.ticker) },
      create: {
        symbol: e.ticker,
        symbolNorm: normalizarTickerEua(e.ticker),
        cik: e.cik,
        principal: true,
        validFrom,
        fetchedAt: agora,
      },
    });
    const emissorId = emissorIdSec(e.cik);
    for (const a of e.anos) {
      const fim = dia(a.dtFim);
      const ini = new Date(fim.getTime() - 364 * 86_400_000);
      const dados = {
        source: 'SEC',
        docTipo: '10-K',
        sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${e.cik}.json`,
        padraoContabil: 'USGAAP',
        dtIni: ini,
        anoFiscal: a.ano,
        dtEntrega: fim,
        dtEntregaOriginal: fim,
        moeda: 'USD',
        escalaOriginal: 'UNIDADE',
        receita: dec(a.receita),
        ebit: dec(a.ebit),
        depreciacaoAmortizacao: dec(a.depreciacaoAmortizacao),
        lucroLiquido: dec(a.lucroLiquido),
        lucroAtribuivel: dec(a.lucroLiquido),
        caixa: dec(a.caixa),
        aplicacoesFinanceiras: dec(a.aplicacoesFinanceiras),
        dividaBrutaLp: dec(a.dividaBruta),
        pl: dec(a.pl),
        plControladora: dec(a.pl),
        fco: dec(a.fco),
        capex: dec(a.capex),
        dividendosJcpPagos: dec(a.dividendosPagos),
        lpaOn: finito(a.lpa) ? a.lpa : null,
        acoesMediaDiluida: finito(a.acoesMediaDiluida)
          ? new Prisma.Decimal(Math.round(a.acoesMediaDiluida))
          : null,
        dpa: finito(a.dpa) ? a.dpa : null,
        dpaOrigem: a.dpaOrigem,
        recompras: dec(a.recompras),
        naoSeAplica: [],
        flags: a.flags,
        fetchedAt: agora,
      };
      await prisma.assetFundamentalsPeriod.upsert({
        where: {
          emissorId_dtFim_tipoPeriodo_escopo_versao: {
            emissorId,
            dtFim: fim,
            tipoPeriodo: 'FY',
            escopo: 'con',
            versao: 1,
          },
        },
        update: dados,
        create: { emissorId, dtFim: fim, tipoPeriodo: 'FY', escopo: 'con', versao: 1, ...dados },
      });
    }
  }
}

/**
 * Grava as fixtures EUA. Devolve quantas linhas stock/reit ficaram no Quadro. Os gravadores levam
 * CLASSES_EUA: as linhas acao/fii da amostra BR ficam intactas.
 */
export async function semearFixturesEua(
  prisma: PrismaClient,
  arquivo: ArquivoFixturesEua = lerFixturesEua(),
  agora: Date = new Date(),
): Promise<number> {
  const [{ gravarCriteriaEval, linhasCriteriaEval }, { gravarLinhasQuadro }] = await Promise.all([
    import('../src/services/analiseAtivos/repositorio/criterios'),
    import('../src/services/analiseAtivos/quadro/gerarQuadro'),
  ]);
  await gravarCadastroEFundamentos(prisma, arquivo, agora);
  const { avaliacoes, linhas } = await montarFixturesEua(arquivo, CRITERIA_PARAMS_CODIGO, agora);
  await gravarCriteriaEval(
    prisma,
    avaliacoes.flatMap((a) => linhasCriteriaEval(a, agora)),
    CLASSES_EUA,
  );
  return gravarLinhasQuadro(prisma, linhas, CLASSES_EUA);
}

if (require.main === module) {
  void (async () => {
    const { PrismaClient: Cliente } = await import('@prisma/client');
    const prisma = new Cliente();
    try {
      const n = await semearFixturesEua(prisma);
      console.log(`📈 Stocks e REITs (fixtures): ${n} linhas no Quadro`);
    } catch (e: unknown) {
      console.error(e);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  })();
}
