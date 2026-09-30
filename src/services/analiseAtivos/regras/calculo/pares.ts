/**
 * Pares do setor e referência (decisão 16; spec §4.5 "Referência"). Funções puras.
 *
 * Pares = mesmo SEGMENTO B3 (só 17 segmentos têm 5+ empresas), completando com o SUBSETOR até n, por
 * valor de mercado decrescente. Referência = mediana dos pares; com menos de 3 pares ⇒ ausente.
 */
import { ausente, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type { Valor } from '@/services/analiseAtivos/tipos';

export interface ItemPar {
  symbol: string;
  segmento: string | null;
  subsetor: string | null;
  valorMercado: number | null;
}

function porValorMercado(a: ItemPar, b: ItemPar): number {
  const va = a.valorMercado ?? -Infinity;
  const vb = b.valorMercado ?? -Infinity;
  return vb - va || a.symbol.localeCompare(b.symbol);
}

export function selecionarPares(
  alvo: { symbol: string; segmento: string | null; subsetor: string | null },
  universo: ItemPar[],
  n: number,
): string[] {
  const outros = universo.filter((u) => u.symbol !== alvo.symbol);
  const mesmoSegmento = alvo.segmento
    ? outros.filter((u) => u.segmento === alvo.segmento).sort(porValorMercado)
    : [];
  const escolhidos = mesmoSegmento.slice(0, n).map((u) => u.symbol);
  if (escolhidos.length < n && alvo.subsetor) {
    const ja = new Set(escolhidos);
    const complemento = outros
      .filter((u) => u.subsetor === alvo.subsetor && !ja.has(u.symbol))
      .sort(porValorMercado)
      .slice(0, n - escolhidos.length)
      .map((u) => u.symbol);
    escolhidos.push(...complemento);
  }
  return escolhidos;
}

/** Mediana dos valores 'ok'; menos de `minimo` ⇒ ausente. */
export function medianaReferencia(valores: Array<Valor<number>>, minimo: number): Valor<number> {
  const xs = valores
    .filter(
      (v): v is { estado: 'ok'; valor: number } => v.estado === 'ok' && Number.isFinite(v.valor),
    )
    .map((v) => v.valor)
    .sort((a, b) => a - b);
  if (xs.length < minimo) return ausente('historico_curto', `${xs.length} pares`);
  const meio = Math.floor(xs.length / 2);
  return ok(xs.length % 2 === 1 ? xs[meio] : (xs[meio - 1] + xs[meio]) / 2);
}
