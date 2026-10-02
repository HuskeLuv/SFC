/**
 * Trava de plausibilidade do DY 12m (diagnóstico 02/10/2026,
 * docs/analise-ativos/fase1/diagnostico-dy-absurdo.md). Funções puras.
 *
 * Mesmo depois da auditoria de proventos (duplicatas, cópias de restituição), a base da BRAPI ainda
 * traz DY 12m implausível: valor em escala errada (HBTS5 929/ação com cota a R$ 30), desdobramento
 * de cotas sem evento (CACR11), preço de negócio esporádico (ICNE11/PEMA11) e extraordinários reais
 * de dez/2025 (antecipação à tributação de dividendos) que não se repetem. O DY 12m fica
 * "em conferência" quando:
 *  - dy_acima_teto: DY 12m > params.sanidade.proventos.plausibilidade.dyMaxPct[classe]
 *    (ações 25%, FIIs 20%: no dev, p95 das ações do Quadro = 20,5% e p98 = 30,9%; FII de tijolo/papel
 *    paga 8–16% com Selic de 15%; acima disso, todos os casos conferidos eram erro de base ou evento
 *    não recorrente), ou
 *  - salto_recente: salto de provento (detectarSaltoProvento: DPA > saltoFator × o do ano anterior,
 *    filtrado pelo payout > saltoPayoutMaxPct quando há payout) num dos `anosSaltoRecente` últimos
 *    anos FECHADOS, ou DPA dos últimos 12 meses > saltoFator × DPA do último ano fechado (mesmo filtro,
 *    com o payout do TTM).
 *
 * Fórmula pública (consistente no Índice MF, semáforo, Quadro e página do ativo):
 *   C_div = ausente('em_conferencia') ⇒ nota 0 + selo "dados incompletos" com o motivo
 *   'div:em_conferencia' ("proventos em conferência"); o DY continua gravado em
 *   AssetMultiplesCurrent.dy12mPct e aparece como "em conferência" (flag
 *   'proventos_em_conferencia_<motivo>').
 */
import { anosFechados, detectarSaltoProvento } from '@/services/analiseAtivos/leitura/ativo/series';
import { ausente, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type { ScoringParams, Valor } from '@/services/analiseAtivos/tipos';

export type MotivoProventosEmConferencia = 'dy_acima_teto' | 'salto_recente';

export const PREFIXO_FLAG_EM_CONFERENCIA = 'proventos_em_conferencia_';
export const MOTIVO_INDICE_EM_CONFERENCIA = 'div:em_conferencia';

export function flagEmConferencia(m: MotivoProventosEmConferencia): string {
  return `${PREFIXO_FLAG_EM_CONFERENCIA}${m}`;
}

/** Flag de linha que põe os proventos (DY, payout, rendimento) "em conferência" na tela. */
export function ehFlagProventosEmConferencia(f: string): boolean {
  return (
    f === 'provento_suspeito' ||
    f.startsWith('proventos_defasados') ||
    f.startsWith(PREFIXO_FLAG_EM_CONFERENCIA)
  );
}

/** Linha (flags + motivos do Índice) com proventos em conferência. */
export function proventosEmConferencia(
  flags: readonly string[],
  motivosIncompleto: readonly string[] = [],
): boolean {
  return (
    flags.some(ehFlagProventosEmConferencia) ||
    motivosIncompleto.includes('div:fonte_defasada') ||
    motivosIncompleto.includes(MOTIVO_INDICE_EM_CONFERENCIA)
  );
}

export interface DpaAnual {
  anoFiscal: number;
  /** ações: DPA na base de hoje; FIIs: rendimento por cota na base de hoje */
  dpaAjHoje: number | null;
  payoutDmplPct?: number | null;
}

export interface EntradaSaltoRecente {
  classe: 'acao' | 'fii';
  porAno: readonly DpaAnual[];
  /** AAAA-MM-DD: define os anos fechados */
  hoje: string;
  /** FII: meses com informe por ano (ano com < 12 sai, como no Quadro) */
  mesesPorAno?: Record<number, number>;
  /** DPA/rendimento dos últimos 12 meses (base de hoje) */
  dpa12m?: number | null;
  /** payout do TTM em % (ações) */
  payoutTtmPct?: number | null;
}

function payoutConfirmaSalto(payout: number | null | undefined, max: number): boolean {
  // sem payout (FII, financeira, ano sem lucro) ou payout ≤ 0 (prejuízo): vale só o salto
  return typeof payout === 'number' && Number.isFinite(payout) && payout > 0 ? payout > max : true;
}

/** Salto de provento recente (anos fechados ou 12m contra o último ano fechado). */
export function saltoProventoRecente(e: EntradaSaltoRecente, p: ScoringParams): boolean {
  const cfg = p.sanidade.proventos.plausibilidade;
  const pontos = e.porAno.map((x) => ({ ...x, ano: x.anoFiscal }));
  const fechados = anosFechados(
    pontos,
    e.hoje,
    e.classe === 'fii' ? { mesesPorAno: e.mesesPorAno ?? {} } : {},
  );
  const serie = fechados.map((x) => ({ ano: x.ano, valor: x.dpaAjHoje }));
  const salto = detectarSaltoProvento(serie, {
    fator: cfg.saltoFator,
    payoutMax: cfg.saltoPayoutMaxPct,
    payoutPorAno:
      e.classe === 'acao'
        ? Object.fromEntries(fechados.map((x) => [x.ano, x.payoutDmplPct ?? null]))
        : undefined,
  });
  const anoAtual = Number(e.hoje.slice(0, 4));
  if (cfg.anosSaltoRecente > 0) {
    if (salto.anosSuspeitos.some((a) => a >= anoAtual - cfg.anosSaltoRecente)) return true;
  }
  const ultimo = [...fechados].reverse().find((x) => typeof x.dpaAjHoje === 'number');
  const base = ultimo?.dpaAjHoje;
  if (typeof e.dpa12m !== 'number' || typeof base !== 'number' || !(base > 0)) return false;
  return (
    e.dpa12m > cfg.saltoFator * base &&
    payoutConfirmaSalto(e.classe === 'acao' ? e.payoutTtmPct : null, cfg.saltoPayoutMaxPct)
  );
}

/** Motivo de "proventos em conferência" do DY 12m, ou null. O teto vence o salto. */
export function motivoProventosEmConferencia(
  e: { classe: 'acao' | 'fii'; dyPct: Valor<number> | undefined; saltoRecente: boolean },
  p: ScoringParams,
): MotivoProventosEmConferencia | null {
  if (!e.dyPct || e.dyPct.estado !== 'ok') return null;
  const teto = p.sanidade.proventos.plausibilidade.dyMaxPct[e.classe];
  if (e.dyPct.valor > teto) return 'dy_acima_teto';
  // salto sem provento nenhum nos 12m não contamina o DY (zero é zero)
  if (e.saltoRecente && e.dyPct.valor > 0) return 'salto_recente';
  return null;
}

/** DY para o Índice/semáforo: em conferência ⇒ ausente('em_conferencia'); senão o próprio DY. */
export function dyParaIndice(
  dyPct: Valor<number> | undefined,
  motivo: MotivoProventosEmConferencia | null,
): Valor<number> {
  if (!dyPct) return ausente('sem_dado_fonte');
  if (motivo && dyPct.estado === 'ok') return ausente('em_conferencia', motivo);
  return dyPct.estado === 'ok' ? ok(dyPct.valor) : dyPct;
}
