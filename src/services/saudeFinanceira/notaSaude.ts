/**
 * Nota de saúde financeira 0–100 do Relatório financeiro (decisão 4 do Wellington, 06/11/2026).
 * Puro.
 *
 * Régua PROVISÓRIA: cada indicador disponível vale good 100 / warn 50 / bad 0 e a nota é a média
 * dos disponíveis (indicador '—' fica fora). Faixas: ≥ 70 Saudável, 40–69 Atenção, < 40 Alerta.
 * A régua definitiva do Pedro entra trocando só estas constantes.
 */
import type { StatusSemaforo } from '@/types/relatorioFinanceiro';

export const PONTOS_STATUS: Record<StatusSemaforo, number> = { good: 100, warn: 50, bad: 0 };
/** Nota mínima de cada faixa. */
export const FAIXA_SAUDAVEL = 70;
export const FAIXA_ATENCAO = 40;

export const ROTULO_STATUS_SAUDE: Record<StatusSemaforo, string> = {
  good: 'Saudável',
  warn: 'Atenção',
  bad: 'Alerta',
};

export interface IndicadorParaNota {
  valor: number | null;
  status: StatusSemaforo | null;
}

export function statusDaNota(nota: number): StatusSemaforo {
  if (nota >= FAIXA_SAUDAVEL) return 'good';
  if (nota >= FAIXA_ATENCAO) return 'warn';
  return 'bad';
}

/** Média dos indicadores disponíveis; sem nenhum: nota e status null. */
export function notaSaude(indicadores: IndicadorParaNota[]): {
  nota: number | null;
  status: StatusSemaforo | null;
} {
  const pontos = indicadores
    .filter((i) => i.valor !== null && i.status !== null)
    .map((i) => PONTOS_STATUS[i.status as StatusSemaforo]);
  if (pontos.length === 0) return { nota: null, status: null };
  const nota = Math.round(pontos.reduce((s, p) => s + p, 0) / pontos.length);
  return { nota, status: statusDaNota(nota) };
}
