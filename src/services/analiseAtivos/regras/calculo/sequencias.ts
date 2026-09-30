/**
 * Sequências do C_lucro e do semáforo: anos consecutivos de lucro (ações) e meses consecutivos com
 * rendimento (FIIs). Funções puras.
 */
import { ausente, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type { ProventoAuditado, ScoringParams, Valor } from '@/services/analiseAtivos/tipos';

/**
 * Do último exercício anual (FY) para trás até o 1º ano com lucro ≤ 0, ausente ou faltando na série.
 * "Lucro" = lucro líquido atribuível aos controladores. Último FY ausente ⇒ ausente.
 */
export function anosLucroConsecutivos(
  serie: Array<{ anoFiscal: number; lucro: Valor<number> }>,
): Valor<number> {
  if (serie.length === 0) return ausente('sem_dado_fonte', 'sem_fy');
  const porAno = new Map(serie.map((s) => [s.anoFiscal, s.lucro]));
  const ultimo = Math.max(...serie.map((s) => s.anoFiscal));
  const lucroUltimo = porAno.get(ultimo)!;
  if (lucroUltimo.estado !== 'ok') {
    return lucroUltimo.estado === 'ausente'
      ? ausente(lucroUltimo.motivo, 'ultimo_fy')
      : ausente('sem_dado_fonte', 'ultimo_fy_nao_se_aplica');
  }
  let n = 0;
  for (let a = ultimo; ; a--) {
    const l = porAno.get(a);
    if (!l || l.estado !== 'ok' || !(l.valor > 0)) break;
    n++;
  }
  return ok(n);
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
