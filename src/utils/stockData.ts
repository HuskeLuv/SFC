export interface B3StockData {
  ticker: string;
  companyName: string;
  sector?: string;
  subsector?: string;
  segment?: string;
}

export interface StockPriceData {
  ticker: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
}

/**
 * Busca dados de ativos da API da B3
 * @returns Promise com array de dados dos ativos
 */
export async function fetchB3Stocks(): Promise<B3StockData[]> {
  try {
    const response = await fetch('https://arquivos.b3.com.br/apinegocios/ticker');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Processar os dados da API da B3
    // A estrutura pode variar, então vamos adaptar conforme necessário
    if (Array.isArray(data)) {
      return data.map((item: { ticker?: string; symbol?: string; code?: string; companyName?: string; name?: string; company?: string; sector?: string; industry?: string; subsector?: string; subIndustry?: string; segment?: string; market?: string }) => ({
        ticker: item.ticker || item.symbol || item.code || '',
        companyName: item.companyName || item.name || item.company || '',
        sector: item.sector || item.industry || '',
        subsector: item.subsector || item.subIndustry || '',
        segment: item.segment || item.market || '',
      })).filter((stock: B3StockData) => 
        stock.ticker && stock.companyName && 
        stock.ticker.length > 0 && stock.companyName.length > 0
      );
    }
    
    // Se não for um array, tentar extrair de outra estrutura
    if (data.data && Array.isArray(data.data)) {
      return data.data.map((item: { ticker?: string; symbol?: string; code?: string; companyName?: string; name?: string; company?: string; sector?: string; industry?: string; subsector?: string; subIndustry?: string; segment?: string; market?: string }) => ({
        ticker: item.ticker || item.symbol || item.code || '',
        companyName: item.companyName || item.name || item.company || '',
        sector: item.sector || item.industry || '',
        subsector: item.subsector || item.subIndustry || '',
        segment: item.segment || item.market || '',
      })).filter((stock: B3StockData) => 
        stock.ticker && stock.companyName && 
        stock.ticker.length > 0 && stock.companyName.length > 0
      );
    }
    
    console.warn('Estrutura de dados inesperada da API da B3:', data);
    return [];
    
  } catch (error) {
    console.error('Erro ao buscar dados da B3:', error);
    
    // Dados de fallback para desenvolvimento
    return getFallbackStocks();
  }
}

/**
 * Dados de fallback para desenvolvimento quando a API não estiver disponível
 */
function getFallbackStocks(): B3StockData[] {
  return [
    {
      ticker: 'PETR4',
      companyName: 'Petrobras',
      sector: 'Petróleo e Gás',
      subsector: 'Exploração e Produção',
      segment: 'Petróleo, Gás e Biocombustíveis'
    },
    {
      ticker: 'VALE3',
      companyName: 'Vale',
      sector: 'Mineração',
      subsector: 'Mineração',
      segment: 'Mineração'
    },
    {
      ticker: 'ITUB4',
      companyName: 'Itaú Unibanco',
      sector: 'Financeiro',
      subsector: 'Bancos',
      segment: 'Bancos'
    },
    {
      ticker: 'BBDC4',
      companyName: 'Bradesco',
      sector: 'Financeiro',
      subsector: 'Bancos',
      segment: 'Bancos'
    },
    {
      ticker: 'ABEV3',
      companyName: 'Ambev',
      sector: 'Consumo',
      subsector: 'Bebidas',
      segment: 'Bebidas'
    },
    {
      ticker: 'WEGE3',
      companyName: 'WEG',
      sector: 'Bens Industriais',
      subsector: 'Máquinas e Equipamentos',
      segment: 'Máquinas e Equipamentos'
    },
    {
      ticker: 'RENT3',
      companyName: 'Localiza',
      sector: 'Consumo',
      subsector: 'Serviços',
      segment: 'Aluguel de Carros'
    },
    {
      ticker: 'LREN3',
      companyName: 'Lojas Renner',
      sector: 'Consumo',
      subsector: 'Varejo',
      segment: 'Varejo'
    },
    {
      ticker: 'MGLU3',
      companyName: 'Magazine Luiza',
      sector: 'Consumo',
      subsector: 'Varejo',
      segment: 'Varejo'
    },
    {
      ticker: 'SUZB3',
      companyName: 'Suzano',
      sector: 'Materiais Básicos',
      subsector: 'Papel e Celulose',
      segment: 'Papel e Celulose'
    }
  ];
}

/**
 * Simula dados de preço para desenvolvimento
 */
export function getMockPriceData(ticker: string): StockPriceData {
  const basePrice = Math.random() * 100 + 10; // Preço entre 10 e 110
  const change = (Math.random() - 0.5) * 10; // Variação entre -5 e +5
  const changePercent = (change / basePrice) * 100;
  
  return {
    ticker,
    currentPrice: parseFloat(basePrice.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    volume: Math.floor(Math.random() * 1000000) + 100000,
    marketCap: Math.floor(Math.random() * 10000000000) + 1000000000
  };
}

/**
 * Busca dados de preço para múltiplos ativos
 */
export async function fetchStockPrices(tickers: string[]): Promise<StockPriceData[]> {
  try {
    // Em produção, aqui você faria uma chamada para uma API de preços
    // Por enquanto, vamos usar dados simulados
    return tickers.map(ticker => getMockPriceData(ticker));
  } catch (error) {
    console.error('Erro ao buscar preços:', error);
    return tickers.map(ticker => getMockPriceData(ticker));
  }
} 