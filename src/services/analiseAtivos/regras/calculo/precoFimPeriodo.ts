/**
 * Preço de fim de período para múltiplos históricos (regra 5 do relatório da Fase A; decisão 19).
 *
 * Só preço CRU (COTAHIST), nunca adjustedClose nem os múltiplos históricos da BRAPI (WEGE3 2019:
 * 19,9 × 45,1 correto). Vale o último pregão ≤ dtFim e ≥ dtFim − 5 dias; nada na janela ⇒ sem ponto.
 */
import type { CotacaoDia, ScoringParams } from '@/services/analiseAtivos/tipos';

const DIA_MS = 24 * 60 * 60 * 1000;

function ms(data: string): number {
  return Date.UTC(
    Number(data.slice(0, 4)),
    Number(data.slice(5, 7)) - 1,
    Number(data.slice(8, 10)),
  );
}

export function precoFimDePeriodo(
  cotacoes: CotacaoDia[],
  dtFim: string,
  p: ScoringParams,
): { preco: number; data: string } | null {
  const limite = ms(dtFim) - p.sanidade.acoes.precoFimAnoMaxDias * DIA_MS;
  let melhor: CotacaoDia | null = null;
  for (const c of cotacoes) {
    if (c.date > dtFim || ms(c.date) < limite) continue;
    if (!(c.closeRaw > 0)) continue;
    if (!melhor || c.date > melhor.date) melhor = c;
  }
  return melhor ? { preco: melhor.closeRaw, data: melhor.date } : null;
}
