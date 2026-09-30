/**
 * Salto diário suspeito (regra 30) — função pura.
 *
 * Variação de fechamento CRU entre dois pregões consecutivos da série do ativo acima de
 * `sanidade.b3.saltoDiarioPct` (40%) em módulo, SEM evento corporativo bruto entre os dois pregões
 * (data do evento ∈ [pregão anterior, pregão do salto]), indica escala misturada ou erro de fonte.
 *
 * A janela inclusiva cobre as duas convenções de data dos eventos brutos: a BRAPI grava o último dia
 * "com" (MGLU3 grupamento 10:1 em 24/05/2024) e o Yahoo o primeiro dia "ex" (27/05/2024). Os
 * eventos aqui só servem para NÃO marcar — não são validados (a validação é da fatia D).
 */
import type { ScoringParams } from '@/services/analiseAtivos/tipos';

export interface SaltoDiario {
  date: string;
  dataAnterior: string;
  variacaoPct: number;
}

export function detectarSaltoDiario(
  serie: Array<{ date: string; closeRaw: number }>,
  datasEventos: Array<{ date: string; fator: number }>,
  p: ScoringParams,
): SaltoDiario[] {
  const limite = p.sanidade.b3.saltoDiarioPct;
  const ordenada = serie
    .filter((l) => Number.isFinite(l.closeRaw) && l.closeRaw > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const eventos = datasEventos.map((e) => e.date);
  const out: SaltoDiario[] = [];
  for (let i = 1; i < ordenada.length; i++) {
    const ant = ordenada[i - 1];
    const atual = ordenada[i];
    if (ant.date === atual.date) continue;
    const variacaoPct = (atual.closeRaw / ant.closeRaw - 1) * 100;
    if (Math.abs(variacaoPct) <= limite) continue;
    const temEvento = eventos.some((d) => d >= ant.date && d <= atual.date);
    if (!temEvento) out.push({ date: atual.date, dataAnterior: ant.date, variacaoPct });
  }
  return out;
}
