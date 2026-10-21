/**
 * FonteSec — a SEC como fonte de fundamentos de Stocks e REITs (fatia B da feature EUA; desenho
 * final.pipeline_dados §5). Modo 'leitura_local', como a FonteCvm: NÃO grava nada; lê as linhas FY
 * que o job 'sec-fundamentos' (fatia A) grava em asset_fundamentals_period (source 'SEC',
 * emissorId 'CIK:##########') e devolve PONTOS VIGENTES na unidade do catálogo (USD em dólares,
 * pct em p.p., x em vezes, USD_por_acao em dólares por ação), sempre 'approved' (dado regulatório,
 * camada 'cvm' da sanidade; a sanidade própria é a sanidadeSec da fatia A, na ingestão).
 *
 * Séries (as regras são as de seriesStock/seriesReit — uma regra só, usada pelo job e pela tela):
 *  - stock: revenue, net_income, ebitda, net_margin, net_debt_ebitda, free_cash_flow (não oferece
 *    net_income_adjusted: 'luc' cai na serieFallback net_income);
 *  - reit: revenue, dividend_per_share, ocf_per_share, net_debt_ebitda, cash_payout_pct (não
 *    oferece occupancy nem ffo/affo: fase 2, fonte 'sec_10k').
 * params.fontes.prioridade.porMercado (v3) põe us_stocks/us_reits → ['sec'].
 *
 * fundamentei-regras (F1): com `incluirSeriesV5` (o job criterios-eua, quando a versão pede), os
 * stocks levam também a série 'ebit' (critério 'ebitda' da v5: a base do EBITDA pelo degrau, sem a
 * D&A) e os REITs as séries ajustadas pela remuneração em ações (ocf_adjusted_per_share,
 * cash_payout_adjusted_pct). Sem a opção, os pontos de hoje (telas e v3/v4 iguais).
 */
import type { PrismaClient } from '@prisma/client';
import { paraUnidadeCatalogo } from '@/services/analiseAtivos/fontes/fundamentos/fonteCvm';
import {
  fysSecPorAno,
  lerBrutosSec,
  SERIES_STOCK,
  SERIES_STOCK_COM_EBIT,
  valoresAnoStockComEbit,
  type BrutoSec,
  type OpcoesSeriesStock,
} from '@/services/analiseAtivos/regras/criterios/seriesStock';
import {
  SERIES_REIT,
  SERIES_REIT_COM_AJUSTADAS,
  valoresAnoReitComAjustadas,
} from '@/services/analiseAtivos/regras/criterios/seriesReit';
import { cikDoEmissorId, type ClasseEua } from '@/types/analiseAtivosEua';
import type {
  AtivoFonte,
  FonteFundamentos,
  PontoSerieVigente,
  SerieFundamento,
} from '@/types/analiseAtivosFontes';

export const ID_FONTE_SEC = 'sec';
/** Rótulo curto da SEC (a frase de fonte das classes EUA usa textosCriterios.fonte.sec). */
export const ROTULO_SEC = '10-K (SEC)';

/** Séries que a SEC oferece por classe. */
export const SERIES_SEC_POR_CLASSE: Record<ClasseEua, readonly SerieFundamento[]> = {
  stock: SERIES_STOCK,
  reit: SERIES_REIT,
};

/** Séries da SEC por classe com as da v5 (fundamentei-regras F1: 'ebit' e as ajustadas do REIT). */
export const SERIES_SEC_V5_POR_CLASSE: Record<ClasseEua, readonly SerieFundamento[]> = {
  stock: SERIES_STOCK_COM_EBIT,
  reit: SERIES_REIT_COM_AJUSTADAS,
};

/** Opções dos pontos da SEC: as das séries de stock + as séries da v5 (padrão false = hoje). */
export interface OpcoesPontosSec extends OpcoesSeriesStock {
  incluirSeriesV5?: boolean;
}

/**
 * Pontos FY da SEC de uma empresa, repetidos para cada ticker do CIK (GOOGL/GOOG, BRK.A/BRK.B).
 * EBITDA ≤ 0 com dívida líquida positiva e FCO ≤ 0 no pagamento ficam +Infinity. Pura.
 */
export function pontosSec(
  b: BrutoSec,
  symbols: readonly string[],
  classe: ClasseEua,
  opcoes: OpcoesPontosSec = {},
): PontoSerieVigente[] {
  const out: PontoSerieVigente[] = [];
  const series = (opcoes.incluirSeriesV5 ? SERIES_SEC_V5_POR_CLASSE : SERIES_SEC_POR_CLASSE)[
    classe
  ];
  for (const [ano, f] of fysSecPorAno(b.fys)) {
    const valores: Partial<Record<SerieFundamento, number | null>> =
      classe === 'reit' ? valoresAnoReitComAjustadas(f) : valoresAnoStockComEbit(f, opcoes);
    for (const symbol of symbols) {
      for (const serie of series) {
        out.push({
          symbol,
          serie,
          tipoPeriodo: 'FY',
          anoFiscal: ano,
          dtFim: f.dtFim,
          valor: paraUnidadeCatalogo(serie, valores[serie] ?? null),
          fonte: ID_FONTE_SEC,
          versao: f.versao,
          incompleto: false,
        });
      }
    }
  }
  return out;
}

/** Leitura local (telas/scripts com poucos ativos): ativos stock/reit com emissorId 'CIK:…'. */
export async function lerLocalSec(
  prisma: PrismaClient,
  ativos: readonly AtivoFonte[],
  desdeAno: number,
): Promise<PontoSerieVigente[]> {
  const eua = ativos.filter(
    (a) =>
      (a.classe === 'stock' || a.classe === 'reit') && a.emissorId && cikDoEmissorId(a.emissorId),
  );
  if (eua.length === 0) return [];
  const ciks = [...new Set(eua.map((a) => cikDoEmissorId(a.emissorId as string) as string))];
  const brutos = await lerBrutosSec(prisma, ciks, desdeAno);
  const out: PontoSerieVigente[] = [];
  for (const a of eua) {
    const b = brutos.get(cikDoEmissorId(a.emissorId as string) as string);
    if (b) out.push(...pontosSec(b, [a.symbol], a.classe as ClasseEua));
  }
  return out.filter((p) => p.anoFiscal >= desdeAno);
}

export const FONTE_SEC: FonteFundamentos = {
  id: ID_FONTE_SEC,
  rotulo: ROTULO_SEC,
  mercados: ['us_stocks', 'us_reits'],
  seriesOferecidas: [...new Set([...SERIES_STOCK, ...SERIES_REIT])],
  modo: 'leitura_local',
  lerLocal: lerLocalSec,
};
