/**
 * FonteCvm — a CVM como fonte de fundamentos da v2.5 (desenho final.camada_fontes §5). Modo
 * 'leitura_local': NÃO grava nada; lê as tabelas que os jobs da CVM já ingerem (DFP/ITR das cias,
 * informes mensais e trimestrais dos FIIs, proventos auditados) e devolve PONTOS VIGENTES na unidade
 * do catálogo (BRL em reais, pct em p.p., x em vezes), sempre 'approved' (a CVM é aprovada por
 * definição; a sanidade só a marca com params.fontes.sanidade.aplicaA incluindo 'cvm').
 *
 * As regras de cada série são as de seriesAcao/seriesFii (as mesmas do Essencial e do motor da v2.4):
 *  - ações (FY): revenue, net_income (lucro dos controladores), ebitda, net_margin, net_debt_ebitda,
 *    free_cash_flow (FCO − CAPEX). NÃO oferece net_income_adjusted (a CVM não publica o lucro sem
 *    itens não recorrentes: o critério 'luc' cai na serieFallback net_income) nem net_debt;
 *  - FII (FY): income_per_share (rendimento por cota dos proventos B3, na base de cotas de hoje),
 *    nav_per_share, leverage_pct (obrigações ÷ PL), ffo (Σ dos 4 trimestres), months_with_income
 *    (meses com rendimento no ano, proventos auditados); (Q) vacancy_physical do informe
 *    trimestral — papel (nsa) e ticker↔CNPJ não conferido = null. NÃO oferece default_pct nem
 *    ltv_avg (só fii_property_quality aprovada de um provedor).
 *
 * O job 'criterios' já lê os brutos em lotes (com o emissor e o perfil); por isso as conversões são
 * funções PURAS (pontosCvmAcao/pontosCvmFii) usadas pelo job e por lerLocal — uma leitura só, a mesma
 * regra. O app nunca chama terceiros aqui: só o banco.
 */
import type { PrismaClient } from '@prisma/client';
import { ESCALA_CRITERIO } from '@/services/analiseAtivos/fontes/fundamentos/resolverSeries';
import { SCORING_PARAMS_V1 } from '@/services/analiseAtivos/params/scoringParamsV1';
import { listarEmissores } from '@/services/analiseAtivos/repositorio/universo';
import {
  mesesAteAnoFim,
  type ParamsMeses,
} from '@/services/analiseAtivos/regras/criterios/mesesJanela';
import {
  fysVigentesPorAno,
  lerBrutosAcoes,
  valoresAnoAcao,
  type BrutoAcao,
  type OpcoesSeriesAcao,
} from '@/services/analiseAtivos/regras/criterios/seriesAcao';
import { anosEmConferencia } from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import {
  lerBrutosFii,
  seriesFii,
  vacanciaTrimestralFii,
  type BrutoFii,
} from '@/services/analiseAtivos/regras/criterios/seriesFii';
import {
  CATALOGO_SERIES,
  type AtivoFonte,
  type FonteFundamentos,
  type PontoSerieVigente,
  type SerieFundamento,
} from '@/types/analiseAtivosFontes';

/** Séries de AÇÃO que a CVM oferece. */
export const SERIES_CVM_ACAO = [
  'revenue',
  'net_income',
  'ebitda',
  'net_margin',
  'net_debt_ebitda',
  'free_cash_flow',
] as const satisfies readonly SerieFundamento[];

/** Séries de FII que a CVM oferece. */
export const SERIES_CVM_FII = [
  'income_per_share',
  'nav_per_share',
  'leverage_pct',
  'ffo',
  'months_with_income',
  'vacancy_physical',
] as const satisfies readonly SerieFundamento[];

const finito = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Valor na unidade dos critérios (R$ mi, %, ×) → unidade do catálogo (BRL em reais…). */
export function paraUnidadeCatalogo(serie: SerieFundamento, v: number | null): number | null {
  if (!finito(v)) return v === Number.POSITIVE_INFINITY ? v : null;
  return v / ESCALA_CRITERIO[CATALOGO_SERIES[serie].unidade];
}

function ponto(
  symbol: string,
  serie: SerieFundamento,
  tipoPeriodo: PontoSerieVigente['tipoPeriodo'],
  dtFim: string,
  valor: number | null,
): PontoSerieVigente {
  return {
    symbol,
    serie,
    tipoPeriodo,
    anoFiscal: Number(dtFim.slice(0, 4)),
    dtFim,
    valor,
    fonte: 'cvm',
    versao: 1,
    incompleto: false,
  };
}

/**
 * Pontos FY da CVM de uma empresa, repetidos para cada ticker. Ano em conferência
 * ('fundamentos_escala') = ponto com valor null em todas as séries (como seriesAcao). EBITDA ≤ 0
 * com dívida líquida positiva fica +Infinity em net_debt_ebitda (o motor dá 'EBITDA ≤ 0 em AAAA').
 * Pura.
 */
export function pontosCvmAcao(
  b: BrutoAcao,
  symbols: readonly string[],
  opcoes: OpcoesSeriesAcao = {},
): PontoSerieVigente[] {
  const porAno = fysVigentesPorAno(b.fys, b.escopoPreferido);
  const emConf = anosEmConferencia(b.flagsConf, 'fundamentos_escala');
  const out: PontoSerieVigente[] = [];
  for (const [ano, f] of porAno) {
    const v = valoresAnoAcao(f, opcoes);
    const conf = emConf.has(ano);
    // dtFim do FY vigente; o anoFiscal é o do FY (exercício que não fecha em dezembro)
    for (const symbol of symbols) {
      for (const serie of SERIES_CVM_ACAO) {
        const p = ponto(
          symbol,
          serie,
          'FY',
          f.dtFim,
          conf ? null : paraUnidadeCatalogo(serie, v[serie]),
        );
        out.push({ ...p, anoFiscal: ano });
      }
    }
  }
  return out;
}

export interface OpcoesPontosFii {
  /** âncora dos meses com rendimento (anos depois dela não entram); padrão = ano de hoje − 1 */
  anoFim?: number;
  /** parâmetros de proventos (tipos de FII); padrão = SCORING_PARAMS_V1 */
  scoring?: ParamsMeses;
}

/**
 * Pontos da CVM de um FII: as séries anuais de seriesFii (FY, 31/12), a vacância trimestral (Q) e os
 * meses com rendimento por ano (FY; de inicioBase até anoFim, 0 quando o ano não teve pagamento).
 * Pura.
 */
export function pontosCvmFii(b: BrutoFii, opcoes: OpcoesPontosFii = {}): PontoSerieVigente[] {
  const out: PontoSerieVigente[] = [];
  const s = seriesFii(b);
  for (const serie of ['income_per_share', 'nav_per_share', 'leverage_pct', 'ffo'] as const) {
    for (const [anoTxt, v] of Object.entries(s[serie] ?? {})) {
      out.push(ponto(b.symbol, serie, 'FY', `${anoTxt}-12-31`, paraUnidadeCatalogo(serie, v)));
    }
  }
  for (const t of vacanciaTrimestralFii(b)) {
    out.push(ponto(b.symbol, 'vacancy_physical', 'Q', t.refQuarter, t.valor));
  }
  const anoFim = opcoes.anoFim ?? new Date().getUTCFullYear() - 1;
  const meses = mesesAteAnoFim(b.proventos, anoFim, opcoes.scoring ?? SCORING_PARAMS_V1);
  if (meses.inicioBase !== null) {
    const porAno = new Map<number, number>();
    for (const m of meses.mesesPagos ?? []) {
      const ano = Number(m.slice(0, 4));
      porAno.set(ano, (porAno.get(ano) ?? 0) + 1);
    }
    for (let ano = Number(meses.inicioBase.slice(0, 4)); ano <= anoFim; ano++) {
      out.push(ponto(b.symbol, 'months_with_income', 'FY', `${ano}-12-31`, porAno.get(ano) ?? 0));
    }
  }
  return out;
}

/**
 * Leitura local (uso fora do job: telas/scripts que precisem dos pontos da CVM de poucos ativos).
 * Ações: emissor (financeira, escopo preferido) pelo cadastro; FII: casamento ticker↔CNPJ conferido
 * pelo FiiTickerMap vigente. Só banco.
 */
export async function lerLocalCvm(
  prisma: PrismaClient,
  ativos: readonly AtivoFonte[],
  desdeAno: number,
): Promise<PontoSerieVigente[]> {
  const out: PontoSerieVigente[] = [];
  const acoes = ativos.filter((a) => a.classe === 'acao' && a.emissorId);
  const fiis = ativos.filter((a) => a.classe === 'fii');
  if (acoes.length > 0) {
    const cnpjs = [...new Set(acoes.map((a) => a.emissorId as string))];
    const emissores = await listarEmissores(prisma, cnpjs);
    const porCnpj = new Map(emissores.map((e) => [e.cnpj, e]));
    const empresas = cnpjs.map((cnpj) => ({
      cnpj,
      ehFinanceira: porCnpj.get(cnpj)?.ehFinanceira ?? false,
      escopoPreferido: porCnpj.get(cnpj)?.escopoPreferido ?? ('con' as const),
      symbols: acoes.filter((a) => a.emissorId === cnpj).map((a) => a.symbol),
    }));
    const brutos = await lerBrutosAcoes(prisma, empresas, desdeAno);
    for (const e of empresas) {
      const b = brutos.get(e.cnpj);
      if (b) out.push(...pontosCvmAcao(b, e.symbols));
    }
  }
  if (fiis.length > 0) {
    const mapas = await prisma.fiiTickerMap.findMany({
      where: { ticker: { in: fiis.map((f) => f.symbol) }, validTo: null },
      select: { ticker: true, cnpj: true, conferido: true },
    });
    const brutos = await lerBrutosFii(
      prisma,
      mapas.map((m) => ({ symbol: m.ticker, cnpj: m.cnpj, conferido: m.conferido })),
      desdeAno,
    );
    for (const b of brutos.values()) out.push(...pontosCvmFii(b));
  }
  return out.filter((p) => p.anoFiscal >= desdeAno);
}

/** Rótulo curto da CVM na frase de fonte (textoNotaFonte usa o rótulo da classe). */
export const ROTULO_CVM = 'CVM';

export const FONTE_CVM: FonteFundamentos = {
  id: 'cvm',
  rotulo: ROTULO_CVM,
  mercados: ['br_acoes', 'br_fii'],
  seriesOferecidas: [...SERIES_CVM_ACAO, ...SERIES_CVM_FII],
  modo: 'leitura_local',
  lerLocal: lerLocalCvm,
};
