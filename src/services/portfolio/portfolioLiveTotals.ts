import { getAssetPrices } from '@/services/pricing/assetPriceService';
import { getIndicator } from '@/services/market/marketIndicatorService';
import type { FixedIncomePricer } from './fixedIncomePricing';
import type {
  FixedIncomeAssetWithAsset,
  InvestmentCashflowItem,
  PortfolioWithRelations,
} from './patrimonioHistoricoBuilder';

export interface PortfolioLiveTotals {
  /** Valor de mercado consolidado: cotações ao vivo + FI marcado na curva + manuais. */
  saldoBruto: number;
  /** Valor aplicado (cost basis) consolidado, incluindo cashflow de investimentos. */
  valorAplicado: number;
}

const isFixedIncomeBacked = (
  item: PortfolioWithRelations,
  fixedIncomeByAssetId: Map<string, FixedIncomeAssetWithAsset>,
): boolean => Boolean(item.assetId && fixedIncomeByAssetId.has(item.assetId));

const isReservaItem = (item: PortfolioWithRelations): boolean =>
  item.asset?.type === 'emergency' ||
  item.asset?.type === 'opportunity' ||
  item.asset?.symbol?.startsWith('RESERVA-EMERG') === true ||
  item.asset?.symbol?.startsWith('RESERVA-OPORT') === true;

const isImovelOrPersonalizado = (item: PortfolioWithRelations): boolean =>
  item.asset?.type === 'imovel' ||
  item.asset?.type === 'personalizado' ||
  item.asset?.symbol?.startsWith('PERSONALIZADO') === true;

const isQuotableSymbol = (symbol: string | null | undefined): symbol is string => {
  if (!symbol) return false;
  return (
    !symbol.startsWith('RESERVA-EMERG') &&
    !symbol.startsWith('RESERVA-OPORT') &&
    !symbol.startsWith('RENDA-FIXA') &&
    !symbol.startsWith('CONTA-CORRENTE') &&
    !symbol.startsWith('PERSONALIZADO') &&
    !symbol.startsWith('-') &&
    /^[A-Za-z]/.test(symbol)
  );
};

/**
 * Valor de mercado de um item de FI seguindo a mesma prioridade da aba Renda Fixa:
 * curva (CDI/IPCA/Tesouro PU) quando produz rendimento real, depois edição manual,
 * por fim o valor calculado.
 */
const fixedIncomeMarketValue = (
  fi: FixedIncomeAssetWithAsset,
  item: PortfolioWithRelations,
  pricer: FixedIncomePricer,
): number => {
  const valorCurva = pricer.getCurrentValue(fi);
  if (valorCurva > fi.investedAmount) return valorCurva;
  const valorManual = item.avgPrice > 0 && item.quantity > 0 ? item.avgPrice * item.quantity : 0;
  return valorManual > 0 ? valorManual : valorCurva;
};

const manualFallbackValue = (item: PortfolioWithRelations): number => {
  if (item.totalInvested > 0) return item.totalInvested;
  return item.quantity * item.avgPrice;
};

/**
 * Computa o saldo bruto vivo e o valor aplicado para a carteira, espelhando a lógica
 * usada por `buildPatrimonioHistorico` para o último ponto da série modelada. Usado pelas
 * rotas de risco-retorno e sensibilidade para que `patchLastDayWithLiveTotals` não crie
 * um penhasco artificial entre o saldo modelado (a mercado) e um saldoBruto baseado em
 * preço médio (custo).
 *
 * Importante: imóveis/personalizados ENTRAM em `saldoBruto` aqui (com `quantity*avgPrice`,
 * mesmo valor que o builder usa na linha plana do histórico) — diferente do `saldoBruto`
 * exibido em `carteira/resumo`, que segrega esses ativos em `categorias.imoveisBens`. A
 * diferença é proposital: aqui precisamos ser consistentes com a série de patrimônio
 * para que TWR e volatilidade não tenham distorção no último ponto.
 */
export const computePortfolioLiveTotals = async ({
  portfolio,
  fixedIncomeAssets,
  investmentsExclReservas,
  fiPricer,
}: {
  portfolio: PortfolioWithRelations[];
  fixedIncomeAssets: FixedIncomeAssetWithAsset[];
  investmentsExclReservas: InvestmentCashflowItem[];
  fiPricer: FixedIncomePricer;
}): Promise<PortfolioLiveTotals> => {
  const fixedIncomeByAssetId = new Map<string, FixedIncomeAssetWithAsset>();
  fixedIncomeAssets.forEach((fi) => fixedIncomeByAssetId.set(fi.assetId, fi));

  // Coleta símbolos cotáveis (exclui reservas, FI, manual flags, etc).
  const symbolsToQuote = new Set<string>();
  for (const item of portfolio) {
    if (isReservaItem(item)) continue;
    if (isImovelOrPersonalizado(item)) continue;
    if (isFixedIncomeBacked(item, fixedIncomeByAssetId)) continue;
    const symbol = item.asset?.symbol || item.stock?.ticker;
    if (isQuotableSymbol(symbol)) symbolsToQuote.add(symbol);
  }

  const [quotes, dolarIndicator] = await Promise.all([
    symbolsToQuote.size > 0
      ? getAssetPrices(Array.from(symbolsToQuote), { useBrapiFallback: true })
      : Promise.resolve(new Map<string, number>()),
    getIndicator('USD-BRL', { useBrapiFallback: true }).catch(() => null),
  ]);
  const cotacaoDolar = dolarIndicator?.price ?? null;

  // tipos de ativo cuja cotação BRAPI já vem em BRL (não converter)
  const tiposPrecoEmBRL = new Set(['crypto', 'currency', 'metal', 'commodity']);
  const toBRL = (valor: number, currency: string | null | undefined): number => {
    if (currency === 'USD' && cotacaoDolar != null && cotacaoDolar > 0) {
      return valor * cotacaoDolar;
    }
    return valor;
  };

  let saldoBruto = 0;
  let valorAplicado = 0;

  for (const item of portfolio) {
    valorAplicado += manualFallbackValue(item);

    // FI tem prioridade sobre o flag de reserva: uma reserva-emergência cadastrada como
    // CDB também precisa ser marcada na curva (CDI/IPCA), senão o saldo bruto subreporta
    // o rendimento acumulado e o patch live cria um penhasco contra a série modelada.
    const fi = item.assetId ? fixedIncomeByAssetId.get(item.assetId) : undefined;
    if (fi) {
      saldoBruto += fixedIncomeMarketValue(fi, item, fiPricer);
      continue;
    }

    if (isReservaItem(item)) {
      saldoBruto += manualFallbackValue(item);
      continue;
    }

    if (isImovelOrPersonalizado(item)) {
      saldoBruto += manualFallbackValue(item);
      continue;
    }

    const symbol = item.asset?.symbol || item.stock?.ticker;
    if (symbol && isQuotableSymbol(symbol)) {
      const quote = quotes.get(symbol);
      const currency = item.asset?.currency ?? 'BRL';
      if (quote && quote > 0) {
        const valorBruto = item.quantity * quote;
        const jaEmBRL = tiposPrecoEmBRL.has(item.asset?.type || '');
        saldoBruto += jaEmBRL ? valorBruto : toBRL(valorBruto, currency);
        continue;
      }
    }

    // fallback: cotação indisponível → usa cost basis para esse item
    saldoBruto += manualFallbackValue(item);
  }

  // Outros investimentos (cashflow exclReservas): valor aplicado entra no valorAplicado e,
  // sem variação simulada, também no saldoBruto — mesma convenção do resumo da carteira.
  const otherInvestmentsTotalInvested = investmentsExclReservas.reduce((sum, investment) => {
    const totalValues = (investment.values || []).reduce(
      (sumValues, value) => sumValues + value.value,
      0,
    );
    return sum + totalValues;
  }, 0);
  saldoBruto += otherInvestmentsTotalInvested;
  valorAplicado += otherInvestmentsTotalInvested;

  return {
    saldoBruto: Math.round(saldoBruto * 100) / 100,
    valorAplicado: Math.round(valorAplicado * 100) / 100,
  };
};
