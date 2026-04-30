/**
 * Cenário de validação rodado em DEV a cada GET /api/carteira/resumo. Não roda em
 * produção. Vive num arquivo separado pra que o cold-start de produção não pague o
 * custo de importar `buildDailyTimeline` / `buildDailyPriceMap` (residentes em
 * patrimonioHistoricoBuilder, ~1k linhas).
 */
import {
  buildDailyTimeline,
  buildDailyPriceMap,
  normalizeDateStart,
} from '@/services/portfolio/patrimonioHistoricoBuilder';

const DAY_MS = 24 * 60 * 60 * 1000;

export const runPatrimonioScenarioTest = (): void => {
  const start = normalizeDateStart(new Date(2025, 0, 29));
  const end = normalizeDateStart(new Date(2025, 1, 5));
  const timeline = buildDailyTimeline(start, end);

  const dayKey = start.getTime();
  const compras = [
    { symbol: 'ITUB4', quantity: 10, price: 30, day: dayKey },
    { symbol: 'VALE3', quantity: 5, price: 60, day: dayKey },
  ];

  const cashDeltasByDay = new Map<number, number>();
  const appliedDeltasByDay = new Map<number, number>();
  const aportesByDay = new Map<number, number>();
  const rendimentosByDay = new Map<number, number>();
  const txDeltasBySymbol = new Map<string, Map<number, number>>();
  const priceHistoryBySymbol = new Map<string, Array<{ date: number; value: number }>>();

  const totalCompras = compras.reduce((sum, compra) => sum + compra.quantity * compra.price, 0);
  cashDeltasByDay.set(dayKey, -totalCompras);
  appliedDeltasByDay.set(dayKey, totalCompras);
  aportesByDay.set(dayKey, totalCompras);
  rendimentosByDay.set(dayKey + DAY_MS * 2, 50);

  compras.forEach((compra) => {
    if (!txDeltasBySymbol.has(compra.symbol)) {
      txDeltasBySymbol.set(compra.symbol, new Map());
    }
    const deltas = txDeltasBySymbol.get(compra.symbol)!;
    deltas.set(compra.day, (deltas.get(compra.day) || 0) + compra.quantity);

    if (!priceHistoryBySymbol.has(compra.symbol)) {
      priceHistoryBySymbol.set(compra.symbol, []);
    }
    priceHistoryBySymbol
      .get(compra.symbol)!
      .push(
        { date: compra.day, value: compra.price },
        { date: compra.day + DAY_MS, value: compra.price + 1 },
      );
  });

  const priceMapBySymbol = new Map<string, Map<number, number>>();
  for (const [symbol, history] of priceHistoryBySymbol.entries()) {
    priceMapBySymbol.set(symbol, buildDailyPriceMap(history, timeline));
  }

  const quantitiesBySymbol = new Map<string, number>();
  txDeltasBySymbol.forEach((_value, symbol) => {
    quantitiesBySymbol.set(symbol, 0);
  });

  let cashBalance = 0;
  let valorAplicado = 0;
  let rendimentosAcumulados = 0;
  const patrimonioSeries: Array<{ data: number; valorAplicado: number; saldoBruto: number }> = [];

  for (const day of timeline) {
    cashBalance += aportesByDay.get(day) || 0;
    cashBalance += cashDeltasByDay.get(day) || 0;
    valorAplicado += appliedDeltasByDay.get(day) || 0;
    if (rendimentosByDay.has(day)) {
      const rendimento = rendimentosByDay.get(day) || 0;
      cashBalance += rendimento;
      rendimentosAcumulados += rendimento;
    }

    txDeltasBySymbol.forEach((deltas, symbol) => {
      const delta = deltas.get(day) || 0;
      quantitiesBySymbol.set(symbol, (quantitiesBySymbol.get(symbol) || 0) + delta);
    });

    let patrimonio = cashBalance + rendimentosAcumulados;
    quantitiesBySymbol.forEach((quantity, symbol) => {
      const price = priceMapBySymbol.get(symbol)?.get(day);
      if (!price || price <= 0) return;
      patrimonio += quantity * price;
    });

    patrimonioSeries.push({ data: day, valorAplicado, saldoBruto: patrimonio });
  }

  const minPatrimonio = Math.min(...patrimonioSeries.map((ponto) => ponto.saldoBruto));
  const aplicadoFinal = patrimonioSeries[patrimonioSeries.length - 1]?.valorAplicado ?? 0;
  const appliedNeverDecreases = patrimonioSeries.every((ponto, index, arr) => {
    if (index === 0) return true;
    return ponto.valorAplicado >= arr[index - 1].valorAplicado;
  });
  const valid =
    Number.isFinite(minPatrimonio) &&
    minPatrimonio >= 0 &&
    aplicadoFinal === totalCompras &&
    appliedNeverDecreases;
  if (!valid) {
    console.warn('[Patrimonio] cenário de teste inválido', {
      minPatrimonio,
      aplicadoFinal,
      totalCompras,
      appliedNeverDecreases,
    });
  } else {
    console.info('[Patrimonio] cenário OK', { minPatrimonio, aplicadoFinal });
  }
};
