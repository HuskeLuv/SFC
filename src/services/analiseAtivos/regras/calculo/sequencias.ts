/**
 * Sequências do C_lucro e do semáforo: anos consecutivos de lucro (ações) e meses consecutivos com
 * rendimento (FIIs). Funções puras.
 */
import { ausente, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type { ProventoAuditado, ScoringParams, Valor } from '@/services/analiseAtivos/tipos';

/**
 * Do último exercício anual (FY) para trás até o 1º ano com lucro ≤ 0 ou faltando na série.
 * "Lucro" = lucro líquido atribuível aos controladores. Último FY ausente ⇒ ausente.
 * Ano AUSENTE no meio da série (ex.: controladora_zero sem individual) para a contagem mas NÃO é
 * prejuízo: `lacuna` = esse ano, para o chamador marcar o Índice como incompleto (três estados).
 */
export function anosLucroConsecutivosDetalhado(
  serie: Array<{ anoFiscal: number; lucro: Valor<number> }>,
): { valor: Valor<number>; lacuna: number | null } {
  if (serie.length === 0) return { valor: ausente('sem_dado_fonte', 'sem_fy'), lacuna: null };
  const porAno = new Map(serie.map((s) => [s.anoFiscal, s.lucro]));
  const ultimo = Math.max(...serie.map((s) => s.anoFiscal));
  const lucroUltimo = porAno.get(ultimo)!;
  if (lucroUltimo.estado !== 'ok') {
    const valor =
      lucroUltimo.estado === 'ausente'
        ? ausente(lucroUltimo.motivo, 'ultimo_fy')
        : ausente('sem_dado_fonte', 'ultimo_fy_nao_se_aplica');
    return { valor, lacuna: null };
  }
  let n = 0;
  let lacuna: number | null = null;
  for (let a = ultimo; ; a--) {
    const l = porAno.get(a);
    if (!l) break;
    if (l.estado !== 'ok') {
      if (l.estado === 'ausente') lacuna = a;
      break;
    }
    if (!(l.valor > 0)) break;
    n++;
  }
  return { valor: ok(n), lacuna };
}

export function anosLucroConsecutivos(
  serie: Array<{ anoFiscal: number; lucro: Valor<number> }>,
): Valor<number> {
  return anosLucroConsecutivosDetalhado(serie).valor;
}

/** Diferença relativa máxima entre os módulos para o sinal oposto ser lido como erro de ingestão. */
const SINAL_DIVERGENTE_TOLERANCIA = 0.1;

/**
 * Lucro atribuível com o sinal OPOSTO ao do lucro líquido e quase o mesmo módulo (QA 13/10: AZUL3
 * 2023/2024, AMBP3, PCAR3…): sinal de erro na ingestão da DFP, não de participação de não
 * controladores. Pura.
 */
export function lucroSinalDivergente(
  lucroLiquido: number | null | undefined,
  lucroAtribuivel: number | null | undefined,
): boolean {
  if (typeof lucroLiquido !== 'number' || typeof lucroAtribuivel !== 'number') return false;
  if (!Number.isFinite(lucroLiquido) || !Number.isFinite(lucroAtribuivel)) return false;
  if (lucroLiquido === 0 || lucroAtribuivel === 0) return false;
  if (Math.sign(lucroLiquido) === Math.sign(lucroAtribuivel)) return false;
  const a = Math.abs(lucroLiquido);
  const b = Math.abs(lucroAtribuivel);
  return Math.abs(a - b) < SINAL_DIVERGENTE_TOLERANCIA * Math.max(a, b);
}

/**
 * Lucro do ano para a sequência: atribuível; consolidado com controladora_zero ⇒ o do individual
 * quando houver; senão ausente (nunca zero). Atribuível com o sinal oposto ao do lucro líquido
 * (lucroSinalDivergente) ⇒ ausente 'em_conferencia' (sem dado até a curadoria).
 */
export function lucroParaSequencia(f: {
  lucroAtribuivel: number | null;
  lucroLiquido?: number | null;
  lucroAtribuivelIndividual?: number | null;
  flags: string[];
}): Valor<number> {
  if (lucroSinalDivergente(f.lucroLiquido, f.lucroAtribuivel)) {
    return ausente('em_conferencia', 'lucro_sinal_divergente');
  }
  if (f.lucroAtribuivel !== null) return ok(f.lucroAtribuivel);
  const controladoraZero = f.flags.includes('controladora_zero');
  if (controladoraZero && f.lucroAtribuivelIndividual != null) {
    return ok(f.lucroAtribuivelIndividual);
  }
  return ausente(controladoraZero ? 'controladora_zero' : 'sem_dado_fonte');
}

function mesDe(data: string): string {
  return data.slice(0, 7);
}

function somarMeses(mes: string, n: number): string {
  const a = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7)) - 1 + n;
  const aa = a + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${aa}-${String(mm + 1).padStart(2, '0')}`;
}

/**
 * Meses consecutivos com rendimento por MÊS DE PAGAMENTO (regra 26: janela de calendário, nunca "os
 * últimos 12 registros"). Sem pagamento (YAHOO) usa o mês seguinte ao da data-com (estimado). Conta
 * do mês corrente para trás; mês corrente sem pagamento é tolerado (params.mesCorrenteTolerado).
 * Pagamentos futuros (depois do mês corrente) não contam.
 */
export function mesesComRendimentoConsecutivos(
  proventos: Array<
    Pick<ProventoAuditado, 'status' | 'tipoNormalizado' | 'dataPagamento' | 'dataComReal'>
  >,
  hoje: string,
  p: ScoringParams,
): number {
  return mesesComRendimentoDetalhado(proventos, hoje, p).meses;
}

/** Igual a mesesComRendimentoConsecutivos, dizendo se algum mês contado foi estimado (YAHOO). */
export function mesesComRendimentoDetalhado(
  proventos: Array<
    Pick<ProventoAuditado, 'status' | 'tipoNormalizado' | 'dataPagamento' | 'dataComReal'>
  >,
  hoje: string,
  p: ScoringParams,
): { meses: number; mesEstimado: boolean } {
  const cfg = p.sanidade.proventos;
  const pagos = new Map<string, boolean>(); // mês → estimado?
  for (const pr of proventos) {
    if (pr.status !== 'valido' || !cfg.tiposFii.includes(pr.tipoNormalizado)) continue;
    let mes: string | null = null;
    let estimado = false;
    if (pr.dataPagamento) mes = mesDe(pr.dataPagamento);
    else if (pr.dataComReal) {
      mes = somarMeses(mesDe(pr.dataComReal), 1);
      estimado = true;
    }
    if (!mes) continue;
    const atual = pagos.get(mes);
    pagos.set(mes, atual === undefined ? estimado : atual && estimado);
  }
  const corrente = mesDe(hoje);
  let mes = corrente;
  if (!pagos.has(mes) && cfg.mesCorrenteTolerado) mes = somarMeses(mes, -1);
  let n = 0;
  let mesEstimado = false;
  while (pagos.has(mes)) {
    if (pagos.get(mes)) mesEstimado = true;
    n++;
    mes = somarMeses(mes, -1);
  }
  return { meses: n, mesEstimado };
}
