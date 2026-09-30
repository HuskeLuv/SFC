/**
 * De-para curado ticker → CNPJ de FIIs (regra 20): casos em que a lista da B3 e o Informe Mensal
 * não bastam (ISIN com código antigo, colisão de ISIN, troca de sigla). Cada item tem motivo.
 * Manual vence qualquer casamento automático e já nasce conferido. `validTo` = ticker que saiu da
 * B3 (histórico, entra fechado no mapa).
 */
import type { TickerHistorico } from '@/services/analiseAtivos/regras/fii/tickerCnpj';

export interface TickerManual {
  ticker: string;
  cnpj: string;
  motivo: string;
  validFrom?: string;
  validTo?: string;
}

export const TICKERS_MANUAIS: readonly TickerManual[] = [
  {
    ticker: 'BTCI11',
    cnpj: '09552812000114',
    motivo:
      'ISIN com código antigo BRFEXCCTF007 (prefixo FEXC ≠ BTCI); razão social da B3 difere da CVM',
  },
  {
    ticker: 'IRIM11',
    cnpj: '41076564000195',
    motivo: 'Iridium: sucessor de IRDM11 na lista B3 (CNPJ diferente do antigo IRDM11)',
  },
  {
    ticker: 'IRDM11',
    cnpj: '28830325000110',
    motivo:
      'Iridium Recebíveis: sem informe desde out/2025; sigla saiu da B3 (sucedido por IRIM11)',
    validTo: '2025-10-31',
  },
  {
    ticker: 'TRXF11',
    cnpj: '28548288000152',
    motivo:
      'colisão: o ISIN completo BRTRXFCTF003 aparece em 2 CNPJs (TRX Real Estate e 63.134.454/0001-75 Liquidez Projetos GD)',
  },
  {
    ticker: 'HUSC11',
    cnpj: '28851767000143',
    motivo:
      'colisão de ISIN BRHUSCCTF009 com 08.696.175/0001-97 (RB Capital Renda I); HUSC = Hospital Unimed Sul Capixaba',
  },
];

/** ticker → CNPJ dos manuais VIGENTES (sem validTo). */
export function mapaManuaisVigentes(lista: readonly TickerManual[] = TICKERS_MANUAIS) {
  return new Map(lista.filter((t) => !t.validTo).map((t) => [t.ticker, t.cnpj]));
}

export function historicosManuais(
  lista: readonly TickerManual[] = TICKERS_MANUAIS,
): TickerHistorico[] {
  return lista
    .filter((t): t is TickerManual & { validTo: string } => Boolean(t.validTo))
    .map((t) => ({
      ticker: t.ticker,
      cnpj: t.cnpj,
      validFrom: t.validFrom ?? null,
      validTo: t.validTo,
      motivo: t.motivo,
    }));
}
