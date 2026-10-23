/**
 * Câmbio USD→BRL da Carteira EUA em US$ (out/2026). Câmbio de MERCADO (BRAPI/Yahoo),
 * não PTAX — a PTAX fica para a fase 2.
 *
 *  - Dia: `getCotacaoDolarHoje()` — MarketIndicatorCache/BRAPI (getIndicator, TTL 15 min);
 *    sem ele, o último ponto da série. Obter UMA vez por requisição e passar aos itens,
 *    para aba e resumo não divergirem.
 *  - Data: `carregarSerieCambio(desde)` — asset_price_history 'USD-BRL', repetindo a última
 *    taxa conhecida nos dias sem ponto. Data anterior ao 1º ponto = null.
 *  - Transação: `fxDaTransacao(notes, data, serie)` — a cotação gravada na operação; sem ela,
 *    a série na data.
 *
 * Sem taxa = null. Quem consome NUNCA soma US$ como R$: o item fica 'semCambio', fora da soma.
 */
import prisma from '@/lib/prisma';
import { lerNotesTransacao } from '@/lib/ativoEmDolar';
import { getIndicator } from '@/services/market/marketIndicatorService';

/** Símbolo do câmbio no MarketIndicatorCache e em asset_price_history. */
export const SIMBOLO_CAMBIO_USD_BRL = 'USD-BRL';

/** Rótulo da fonte para a tela ('US$ 1 = R$ y em dd/mm · câmbio de mercado'). */
export const ROTULO_FONTE_CAMBIO = 'câmbio de mercado';

export interface CotacaoDolar {
  /** R$ por US$ 1. */
  taxa: number;
  /** Dia de referência (UTC 00:00). */
  data: Date;
  /** 'indicador' = MarketIndicatorCache/BRAPI; 'serie' = último ponto de asset_price_history. */
  fonte: 'indicador' | 'serie';
}

/** Taxa R$/US$ numa data (Date ou ms), repetindo a última conhecida; antes da série = null. */
export type SerieCambio = (data: Date | number) => number | null;

const DAY_MS = 24 * 60 * 60 * 1000;

const inicioDoDiaUtc = (data: Date | number): number => {
  const ms = typeof data === 'number' ? data : data.getTime();
  return Math.floor(ms / DAY_MS) * DAY_MS;
};

const taxaValida = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Taxa do dia: getIndicator('USD-BRL') e, sem ele, o último ponto da série.
 * Sem nenhum dos dois = null.
 */
export const getCotacaoDolarHoje = async (): Promise<CotacaoDolar | null> => {
  const indicador = await getIndicator(SIMBOLO_CAMBIO_USD_BRL, { useBrapiFallback: true }).catch(
    () => null,
  );
  const taxaIndicador = taxaValida(indicador?.price);
  if (taxaIndicador !== null) {
    return { taxa: taxaIndicador, data: new Date(inicioDoDiaUtc(Date.now())), fonte: 'indicador' };
  }

  const ultimo = await prisma.assetPriceHistory
    .findFirst({
      where: { symbol: SIMBOLO_CAMBIO_USD_BRL },
      orderBy: { date: 'desc' },
      select: { date: true, price: true },
    })
    .catch(() => null);
  const taxaSerie = taxaValida(ultimo?.price);
  if (ultimo && taxaSerie !== null) {
    return { taxa: taxaSerie, data: new Date(inicioDoDiaUtc(ultimo.date)), fonte: 'serie' };
  }
  return null;
};

/**
 * Monta a série a partir dos pontos (qualquer ordem). Puro: é o que `carregarSerieCambio`
 * usa, exportado para teste e para quem já tem os pontos em mãos.
 */
export const montarSerieCambio = (
  pontos: ReadonlyArray<{ date: Date; price: unknown }>,
): SerieCambio => {
  const porDia = new Map<number, number>();
  for (const p of pontos) {
    const taxa = taxaValida(p.price);
    if (taxa !== null) porDia.set(inicioDoDiaUtc(p.date), taxa);
  }
  const dias = [...porDia.keys()].sort((a, b) => a - b);
  const taxas = dias.map((d) => porDia.get(d)!);

  return (data) => {
    const alvo = inicioDoDiaUtc(data);
    // Último dia <= alvo (busca binária).
    let lo = 0;
    let hi = dias.length - 1;
    let achado = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dias[mid] <= alvo) {
        achado = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return achado >= 0 ? taxas[achado] : null;
  };
};

/**
 * Carrega a série USD-BRL a partir de `desde` (inclusive), mais o último ponto anterior a
 * `desde` para a repetição cobrir o início. Sem `desde`, carrega a série inteira.
 */
export const carregarSerieCambio = async (desde?: Date): Promise<SerieCambio> => {
  const select = { date: true, price: true } as const;
  if (!desde) {
    const pontos = await prisma.assetPriceHistory.findMany({
      where: { symbol: SIMBOLO_CAMBIO_USD_BRL },
      orderBy: { date: 'asc' },
      select,
    });
    return montarSerieCambio(pontos);
  }

  const inicio = new Date(inicioDoDiaUtc(desde));
  const [anterior, pontos] = await Promise.all([
    prisma.assetPriceHistory.findFirst({
      where: { symbol: SIMBOLO_CAMBIO_USD_BRL, date: { lt: inicio } },
      orderBy: { date: 'desc' },
      select,
    }),
    prisma.assetPriceHistory.findMany({
      where: { symbol: SIMBOLO_CAMBIO_USD_BRL, date: { gte: inicio } },
      orderBy: { date: 'asc' },
      select,
    }),
  ]);
  return montarSerieCambio(anterior ? [anterior, ...pontos] : pontos);
};

/**
 * Cotação gravada na operação: `notes.cotacaoMoeda`, senão `notes.operation.cotacaoMoeda`.
 * Notes ilegível ou sem cotação válida (> 0) = null.
 */
export const cotacaoMoedaDasNotes = (notes: unknown): number | null => {
  const parsed = lerNotesTransacao(notes);
  if (!parsed) return null;
  const operation =
    parsed.operation && typeof parsed.operation === 'object'
      ? (parsed.operation as Record<string, unknown>)
      : null;
  return taxaValida(parsed.cotacaoMoeda) ?? taxaValida(operation?.cotacaoMoeda);
};

/**
 * Câmbio de uma transação: a cotação gravada nas notes; sem ela, a série na data
 * (último ponto <= data). Sem nenhum = null.
 */
export const fxDaTransacao = (
  notes: unknown,
  data: Date | number,
  serie: SerieCambio | null | undefined,
): number | null => cotacaoMoedaDasNotes(notes) ?? serie?.(data) ?? null;
