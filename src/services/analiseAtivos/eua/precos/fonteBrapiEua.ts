/**
 * FontePrecoEua pela BRAPI (plano pago já contratado; a Carteira já consulta a BRAPI para os
 * tickers EUA — getAssetPrices). Mesma chamada (fetchDetailedQuotes), lotes de 20 já feitos lá.
 * Só cotação em USD é aceita (proteção contra colisão com símbolo da B3). Ticker com classe vai no
 * formato da SEC (BRK-B) e volta na forma da Análise (BRK.B).
 *
 * Usada SÓ pelo job cotacoes-eua com ANALISE_ATIVOS_EUA_PRECO_HABILITADO; sem a chave nada chama.
 */
import { fetchDetailedQuotes } from '@/services/pricing/brapiQuote';
import {
  dataHoraNovaYork,
  type CotacaoEua,
  type FontePrecoEua,
} from '@/services/analiseAtivos/eua/precos/fontePrecoEua';
import { symbolAnaliseDaSec, symbolSecDaAnalise } from '@/types/analiseAtivosEua';

type CotacaoBrapi = Awaited<ReturnType<typeof fetchDetailedQuotes>>[number];

/** Converte o retorno da BRAPI (só USD, preço > 0, horário válido). */
export function cotacaoDaBrapi(q: CotacaoBrapi): CotacaoEua | null {
  if ((q.currency ?? '').toUpperCase() !== 'USD') return null;
  if (!(q.regularMarketPrice > 0)) return null;
  const momento = new Date(q.regularMarketTime);
  if (Number.isNaN(momento.getTime())) return null;
  return {
    symbol: symbolAnaliseDaSec(q.symbol),
    data: dataHoraNovaYork(momento).data,
    fechamento: q.regularMarketPrice,
    ajustado: null,
    volume: q.regularMarketVolume ?? null,
    momento: momento.toISOString(),
  };
}

export function criarFonteBrapiEua(
  buscar: (symbols: string[]) => Promise<CotacaoBrapi[]> = fetchDetailedQuotes,
): FontePrecoEua {
  return {
    id: 'brapi',
    async cotacoes(symbols) {
      if (symbols.length === 0) return [];
      const r = await buscar(symbols.map(symbolSecDaAnalise));
      const out: CotacaoEua[] = [];
      for (const q of r) {
        const c = cotacaoDaBrapi(q);
        if (c) out.push(c);
      }
      return out;
    },
  };
}
