import { useAssetData } from './useAssetData';
import { CarteiraStockData, CarteiraStockAtivo, CarteiraStockSecao } from '@/types/carteiraStocks';

// Hook original para compatibilidade com componentes existentes
export const useStocks = () => {
  return {
    stocks: [
      { id: '1', ticker: 'AAPL', companyName: 'Apple Inc.', sector: 'Technology' },
      { id: '2', ticker: 'MSFT', companyName: 'Microsoft Corporation', sector: 'Technology' },
      { id: '3', ticker: 'GOOGL', companyName: 'Alphabet Inc.', sector: 'Technology' },
      { id: '4', ticker: 'TSLA', companyName: 'Tesla, Inc.', sector: 'Consumer' },
      { id: '5', ticker: 'AMZN', companyName: 'Amazon.com, Inc.', sector: 'Consumer' },
      { id: '6', ticker: 'META', companyName: 'Meta Platforms, Inc.', sector: 'Technology' },
      { id: '7', ticker: 'NVDA', companyName: 'NVIDIA Corporation', sector: 'Technology' },
      { id: '8', ticker: 'JNJ', companyName: 'Johnson & Johnson', sector: 'Healthcare' },
      { id: '9', ticker: 'JPM', companyName: 'JPMorgan Chase & Co.', sector: 'Financials' },
      { id: '10', ticker: 'V', companyName: 'Visa Inc.', sector: 'Financials' },
    ],
    portfolio: [
      {
        stockId: '1',
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        quantity: 10,
        averagePrice: 150.0,
        currentPrice: 175.5,
        totalValue: 1755.0,
        totalGain: 255.0,
        totalGainPercentage: 17.0,
      },
    ],
    transactions: [
      {
        id: '1',
        stock: { ticker: 'AAPL', companyName: 'Apple Inc.' },
        type: 'buy',
        quantity: 10,
        price: 150.0,
        date: new Date(),
        total: 1500.0,
      },
    ],
    watchlist: [
      {
        id: '1',
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        sector: 'Technology',
        notes: 'Tech stock',
        addedAt: new Date(),
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
          priceData: {
            current: 175.5,
            currentPrice: 175.5,
            change: 5.5,
            changePercent: 3.23,
          },
        },
      },
    ],
    loading: false,
    error: null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    addTransaction: async (transaction: any) => true,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    addToWatchlist: async (ticker: string, notes: string) => true,
    getPortfolioStats: () => ({
      totalValue: 0,
      totalGain: 0,
      totalGainPercentage: 0,
      totalInvested: 0,
      currentValue: 0,
      totalReturn: 0,
      totalReturnPercentage: 0,
      returnPercent: 0,
      totalQuantity: 0,
    }),
  };
};

export const useCarteiraStocks = () => {
  const assetData = useAssetData<CarteiraStockData>({
    apiPath: '/api/carteira/stocks',
    objetivoPath: '/api/carteira/stocks/objetivo',
    label: 'Stocks',
    currency: 'USD',
  });

  const calculateAtivoValues = (
    ativo: Partial<CarteiraStockAtivo>,
    totalCarteiraStocks: number,
    _totalCarteiraGeral: number,
  ): CarteiraStockAtivo => {
    const quantidade = ativo.quantidade || 0;
    const precoAquisicao = ativo.precoAquisicao || 0;
    const cotacaoAtual = ativo.cotacaoAtual || 0;

    const valorTotal = quantidade * precoAquisicao;
    const valorAtualizado = quantidade * cotacaoAtual;
    const riscoPorAtivo =
      totalCarteiraStocks > 0 ? Math.min(100, (valorAtualizado / totalCarteiraStocks) * 100) : 0;
    const percentualCarteira =
      totalCarteiraStocks > 0 ? (valorAtualizado / totalCarteiraStocks) * 100 : 0;
    const objetivo = ativo.objetivo || 0;
    const quantoFalta = objetivo - percentualCarteira;
    const necessidadeAporte =
      totalCarteiraStocks > 0 && quantoFalta > 0 ? (quantoFalta / 100) * totalCarteiraStocks : 0;
    const rentabilidade =
      precoAquisicao > 0 ? ((cotacaoAtual - precoAquisicao) / precoAquisicao) * 100 : 0;

    return {
      id: ativo.id || '',
      ticker: ativo.ticker || '',
      nome: ativo.nome || '',
      sector: ativo.sector || 'other',
      industryCategory: ativo.industryCategory || '',
      quantidade,
      precoAquisicao,
      valorTotal,
      cotacaoAtual,
      valorAtualizado,
      riscoPorAtivo,
      percentualCarteira,
      objetivo,
      quantoFalta,
      necessidadeAporte,
      rentabilidade,
      estrategia: ativo.estrategia || 'value',
      observacoes: ativo.observacoes,
      dataUltimaAtualizacao: ativo.dataUltimaAtualizacao,
    };
  };

  const calculateSecaoValues = (
    secao: CarteiraStockSecao,
    totalCarteiraStocks: number,
    totalCarteiraGeral: number,
  ): CarteiraStockSecao => {
    const totalQuantidade = secao.ativos.reduce((sum, ativo) => sum + ativo.quantidade, 0);
    const totalValorAplicado = secao.ativos.reduce((sum, ativo) => sum + ativo.valorTotal, 0);
    const totalValorAtualizado = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.valorAtualizado,
      0,
    );
    const totalPercentualCarteira =
      totalCarteiraGeral > 0 ? (totalValorAtualizado / totalCarteiraGeral) * 100 : 0;
    const totalRisco = secao.ativos.reduce((sum, ativo) => sum + ativo.riscoPorAtivo, 0);
    const totalObjetivo = secao.ativos.reduce((sum, ativo) => sum + ativo.objetivo, 0);
    const totalQuantoFalta = secao.ativos.reduce((sum, ativo) => sum + ativo.quantoFalta, 0);
    const totalNecessidadeAporte = secao.ativos.reduce(
      (sum, ativo) => sum + ativo.necessidadeAporte,
      0,
    );
    const rentabilidadeMedia =
      secao.ativos.length > 0
        ? secao.ativos.reduce((sum, ativo) => sum + ativo.rentabilidade, 0) / secao.ativos.length
        : 0;

    return {
      ...secao,
      totalQuantidade,
      totalValorAplicado,
      totalValorAtualizado,
      totalPercentualCarteira,
      totalRisco,
      totalObjetivo,
      totalQuantoFalta,
      totalNecessidadeAporte,
      rentabilidadeMedia,
    };
  };

  return {
    ...assetData,
    updateObjetivo: assetData.updateObjetivo as (
      ativoId: string,
      novoObjetivo: number,
    ) => Promise<boolean>,
    calculateAtivoValues,
    calculateSecaoValues,
  };
};
