/**
 * Regras de sanidade dos dados SEC — Stocks e REITs, fatia A (desenho.json → final.pipeline_dados
 * §3 "VALIDAÇÃO"). Puras: recebem números, devolvem veredito/alertas. Viram flags em
 * AssetFundamentalsPeriod.flags (contrato FLAGS_FUNDAMENTO_SEC) e alertas do job.
 *
 * - |lucro ÷ média diluída − LPA| ≤ 3% (87/88 anos-empresa no spike) — alerta 'lpa_diverge';
 * - |pagos ÷ média − DPA declarado| ≤ 10%, senão Declared é suspeito (PLD = 0,01) — flag
 *   'declared_suspeito' e o DPA passa a ser o derivado (selo 'dpa_derivado');
 * - receita com variação > 50% a/a — alerta 'receita_salto' (O 2022: fusão VEREIT);
 * - troca de conceito na série — flag informativa 'troca_conceito';
 * - PL ≤ 0 — alerta 'pl_nao_positivo' (ROE '—' na leitura);
 * - free float de capa: > 40× o ativo total, ou > US$ 1 tri sem referência = 'escala_suspeita';
 *   float ÷ ações em circulação fora de [US$ 0,5; 100 mil] = 'preco_implicito_absurdo' (ver
 *   sanidadeFloat: o teto de US$ 1 tri sozinho tiraria as 6 maiores empresas de 2026).
 */
import type { SanidadeFloat, UniversoEuaParams } from '@/types/analiseAtivosEua';

export const TOLERANCIA_LPA = 0.03;
export const TOLERANCIA_DPA = 0.1;
export const LIMITE_SALTO_RECEITA = 0.5;

export type CodigoAlertaSanidade =
  | 'lpa_diverge'
  | 'declared_suspeito'
  | 'receita_salto'
  | 'troca_conceito'
  | 'pl_nao_positivo';

export interface AlertaSanidade {
  codigo: CodigoAlertaSanidade;
  anoFiscal: number;
  mensagem: string;
}

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 0.01);

/** LPA reportado bate com lucro ÷ média diluída (±3%)? null = sem dado para conferir. */
export function lpaConfere(
  lucro: number | null,
  mediaDiluida: number | null,
  lpa: number | null,
): boolean | null {
  if (lucro === null || lpa === null || mediaDiluida === null || !(mediaDiluida > 0)) return null;
  return rel(lucro / mediaDiluida, lpa) <= TOLERANCIA_LPA;
}

/**
 * DPA declarado é suspeito? Só quando dá para conferir (pagos e média > 0) e o declarado difere
 * mais de 10% de pagos ÷ média. PLD: declarado 0,01 com ~US$ 3,7/ação pagos → suspeito.
 */
export function declaredSuspeito(
  dpaDeclarado: number,
  dividendosPagos: number | null,
  mediaDiluida: number | null,
): boolean {
  if (dividendosPagos === null || mediaDiluida === null || !(mediaDiluida > 0)) return false;
  if (!(dpaDeclarado > 0)) return dividendosPagos > 0;
  return Math.abs(dividendosPagos / mediaDiluida - dpaDeclarado) / dpaDeclarado > TOLERANCIA_DPA;
}

/** Receita variou mais de 50% em relação ao ano anterior? */
export function saltoReceita(anterior: number | null, atual: number | null): boolean {
  if (anterior === null || atual === null || !(anterior > 0)) return false;
  return Math.abs(atual / anterior - 1) > LIMITE_SALTO_RECEITA;
}

/**
 * Float ÷ ativo total acima disto = erro de escala (medido em 17/10/2026 nos 1.492 CIKs NYSE/Nasdaq
 * com float ≥ US$ 1,6 bi: o maior legítimo é 25,6× (PLTR); os erros de ×1.000 vão de 50× (TRMK,
 * banco com ativo grande) a 1,1 milhão× — HIVE, SKY, ONTO, TTMI, CLSK, MCFT… que o preço implícito
 * de [US$ 0,5; 100 mil] não pega).
 */
export const RAZAO_MAX_FLOAT_ATIVO = 40;

export interface ReferenciasFloat {
  /** dei:EntityCommonStockSharesOutstanding mais recente (frames) */
  acoesEmCirculacao: number | null;
  /** us-gaap:Assets mais recente (frames) */
  ativoTotalUsd: number | null;
}

/**
 * Sanidade do free float de capa (dei:EntityPublicFloat):
 * - float ≤ 0, ou float > 40× o ativo total → 'escala_suspeita';
 * - float > maxUsd (US$ 1 tri) SEM ativo nem ações para confirmar → 'escala_suspeita' (com uma das
 *   duas referências, o teto vira só conferência: AAPL, MSFT, NVDA, AMZN, GOOGL e META passam de
 *   US$ 1 tri de float em 2026 e são legítimos);
 * - float ÷ ações em circulação fora de [US$ 0,5; 100 mil] → 'preco_implicito_absurdo'.
 */
export function sanidadeFloat(
  floatUsd: number,
  ref: ReferenciasFloat,
  regras: UniversoEuaParams['sanidadeFloat'],
): SanidadeFloat {
  if (!(floatUsd > 0)) return 'escala_suspeita';
  const ativo = ref.ativoTotalUsd !== null && ref.ativoTotalUsd > 0 ? ref.ativoTotalUsd : null;
  const acoes =
    ref.acoesEmCirculacao !== null && ref.acoesEmCirculacao > 0 ? ref.acoesEmCirculacao : null;
  if (ativo !== null && floatUsd / ativo > RAZAO_MAX_FLOAT_ATIVO) return 'escala_suspeita';
  if (floatUsd > regras.maxUsd && ativo === null && acoes === null) return 'escala_suspeita';
  if (acoes !== null) {
    const preco = floatUsd / acoes;
    if (preco < regras.precoImplicitoMinUsd || preco > regras.precoImplicitoMaxUsd) {
      return 'preco_implicito_absurdo';
    }
  }
  return 'ok';
}

/** Insumos de um exercício para as conferências entre anos. */
export interface AnoParaSanidade {
  anoFiscal: number;
  receita: number | null;
  lucroControladora: number | null;
  acoesMediaDiluida: number | null;
  lpaDiluido: number | null;
  plControladora: number | null;
}

/** Alertas informativos de uma empresa (anos em ordem crescente). */
export function alertasSanidade(anos: readonly AnoParaSanidade[]): AlertaSanidade[] {
  const out: AlertaSanidade[] = [];
  const ordenados = [...anos].sort((a, b) => a.anoFiscal - b.anoFiscal);
  ordenados.forEach((a, i) => {
    if (lpaConfere(a.lucroControladora, a.acoesMediaDiluida, a.lpaDiluido) === false) {
      out.push({
        codigo: 'lpa_diverge',
        anoFiscal: a.anoFiscal,
        mensagem: `LPA ${a.lpaDiluido} ≠ lucro ÷ média diluída ${(a.lucroControladora! / a.acoesMediaDiluida!).toFixed(2)} (> 3%)`,
      });
    }
    const ant = i > 0 ? ordenados[i - 1] : null;
    if (ant && ant.anoFiscal === a.anoFiscal - 1 && saltoReceita(ant.receita, a.receita)) {
      out.push({
        codigo: 'receita_salto',
        anoFiscal: a.anoFiscal,
        mensagem: `receita variou ${(((a.receita ?? 0) / (ant.receita ?? 1) - 1) * 100).toFixed(0)}% a/a`,
      });
    }
    if (a.plControladora !== null && a.plControladora <= 0) {
      out.push({
        codigo: 'pl_nao_positivo',
        anoFiscal: a.anoFiscal,
        mensagem: `patrimônio líquido ≤ 0 (${a.plControladora})`,
      });
    }
  });
  return out;
}
