/**
 * Serviço para buscar cotações atuais de ativos via brapi.dev
 * Documentação: https://brapi.dev/docs
 */

// ================== TYPES ==================

interface BrapiQuoteResult {
  symbol: string;
  shortName: string;
  longName?: string;
  currency: string;
  regularMarketPrice: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketTime: string;
  regularMarketVolume?: number;
  marketCap?: number;
}

interface BrapiQuoteResponse {
  results: BrapiQuoteResult[];
  requestedAt: string;
  took: string;
}

interface QuoteCache {
  [symbol: string]: {
    price: number;
    timestamp: number;
  };
}

// ================== CACHE ==================

// Cache de cotações (válido por 15 minutos para reduzir requisições)
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos
const quoteCache: QuoteCache = {};

// Delay entre requisições para evitar rate limiting
const REQUEST_DELAY = 500; // 500ms entre cada requisição

// ================== HELPER FUNCTIONS ==================

/**
 * Aguarda um tempo determinado
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// ================== API FUNCTIONS ==================

/**
 * Busca cotação de um único ativo via brapi.dev
 * @param symbol - Símbolo do ativo (ex: 'PETR4')
 * @returns Preço do ativo ou null se não encontrado
 */
const fetchSingleQuote = async (symbol: string): Promise<number | null> => {
  if (!symbol || !symbol.trim()) {
    return null;
  }

  try {
    const apiKey = process.env.BRAPI_API_KEY;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const url = `https://brapi.dev/api/quote/${symbol}`;
    
    const response = await fetch(url, {
      headers,
      next: { revalidate: 900 } // Cache do Next.js por 15 minutos
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`Rate limit atingido para ${symbol}, aguardando...`);
        await sleep(2000); // Aguardar 2 segundos se bater rate limit
        return null;
      }
      console.error(`Erro ao buscar cotação de ${symbol}: ${response.status} - ${response.statusText}`);
      return null;
    }

    const data: BrapiQuoteResponse = await response.json();

    if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
      console.error(`Formato de resposta inesperado para ${symbol}`);
      return null;
    }

    const result = data.results[0];
    if (result.symbol && result.regularMarketPrice) {
      return result.regularMarketPrice;
    }

    return null;

  } catch (error) {
    console.error(`Erro ao buscar cotação de ${symbol}:`, error);
    return null;
  }
};

/**
 * Busca cotações de múltiplos ativos via brapi.dev (um por vez)
 * @param symbols - Array de símbolos (ex: ['PETR4', 'VALE3', 'ITUB4'])
 * @returns Mapa de símbolo -> preço
 */
export const fetchQuotes = async (symbols: string[]): Promise<Map<string, number>> => {
  if (!symbols || symbols.length === 0) {
    return new Map();
  }

  // Filtrar símbolos únicos e remover vazios
  const uniqueSymbols = [...new Set(symbols.filter(s => s && s.trim()))];
  
  if (uniqueSymbols.length === 0) {
    return new Map();
  }

  const quotes = new Map<string, number>();
  const now = Date.now();

  // Verificar cache primeiro
  const symbolsToFetch: string[] = [];
  
  for (const symbol of uniqueSymbols) {
    const cached = quoteCache[symbol];
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      quotes.set(symbol, cached.price);
    } else {
      symbolsToFetch.push(symbol);
    }
  }

  // Se todos estão em cache, retornar
  if (symbolsToFetch.length === 0) {
    console.log(`✅ Todas as ${uniqueSymbols.length} cotações vieram do cache`);
    return quotes;
  }

  console.log(`🔍 Buscando cotações de ${symbolsToFetch.length} ativos (${uniqueSymbols.length - symbolsToFetch.length} em cache)`);

  // Buscar cotações uma por vez com delay
  for (let i = 0; i < symbolsToFetch.length; i++) {
    const symbol = symbolsToFetch[i];
    
    try {
      const price = await fetchSingleQuote(symbol);
      
      if (price !== null) {
        quotes.set(symbol, price);
        
        // Atualizar cache
        quoteCache[symbol] = {
          price: price,
          timestamp: now
        };
        
        console.log(`✅ ${symbol}: R$ ${price.toFixed(2)}`);
      } else {
        console.warn(`⚠️  Não foi possível obter cotação de ${symbol}`);
      }
      
      // Aguardar antes da próxima requisição (exceto na última)
      if (i < symbolsToFetch.length - 1) {
        await sleep(REQUEST_DELAY);
      }
      
    } catch (error) {
      console.error(`❌ Erro ao buscar cotação de ${symbol}:`, error);
    }
  }

  return quotes;
};

/**
 * Busca cotação de um único ativo
 * @param symbol - Símbolo do ativo (ex: 'PETR4')
 * @returns Preço do ativo ou null se não encontrado
 */
export const fetchQuote = async (symbol: string): Promise<number | null> => {
  if (!symbol || !symbol.trim()) {
    return null;
  }

  // Verificar cache primeiro
  const now = Date.now();
  const cached = quoteCache[symbol];
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    return cached.price;
  }

  // Buscar da API
  return await fetchSingleQuote(symbol);
};

/**
 * Busca cotações com informações detalhadas (um por vez para evitar rate limit)
 * @param symbols - Array de símbolos
 * @returns Array de resultados detalhados
 */
export const fetchDetailedQuotes = async (symbols: string[]): Promise<BrapiQuoteResult[]> => {
  if (!symbols || symbols.length === 0) {
    return [];
  }

  const uniqueSymbols = [...new Set(symbols.filter(s => s && s.trim()))];
  
  if (uniqueSymbols.length === 0) {
    return [];
  }

  const results: BrapiQuoteResult[] = [];

  console.log(`🔍 Buscando cotações detalhadas de ${uniqueSymbols.length} ativos`);

  // Buscar uma por vez para evitar rate limit
  for (let i = 0; i < uniqueSymbols.length; i++) {
    const symbol = uniqueSymbols[i];
    
    try {
      const apiKey = process.env.BRAPI_API_KEY;
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const url = `https://brapi.dev/api/quote/${symbol}`;
      
      const response = await fetch(url, {
        headers,
        next: { revalidate: 900 }
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.warn(`Rate limit atingido para ${symbol}, aguardando...`);
          await sleep(2000);
          continue;
        }
        console.error(`Erro ao buscar cotação de ${symbol}: ${response.status}`);
        continue;
      }

      const data: BrapiQuoteResponse = await response.json();

      if (data.results && Array.isArray(data.results) && data.results.length > 0) {
        results.push(data.results[0]);
      }

      // Aguardar antes da próxima requisição
      if (i < uniqueSymbols.length - 1) {
        await sleep(REQUEST_DELAY);
      }

    } catch (error) {
      console.error(`Erro ao buscar cotação detalhada de ${symbol}:`, error);
    }
  }

  return results;
};

/**
 * Limpa o cache de cotações
 */
export const clearQuoteCache = (): void => {
  Object.keys(quoteCache).forEach(key => delete quoteCache[key]);
};

/**
 * Obtém estatísticas do cache
 */
export const getCacheStats = (): { size: number; oldestEntry: number | null } => {
  const keys = Object.keys(quoteCache);
  const now = Date.now();
  
  let oldestTimestamp: number | null = null;
  
  for (const key of keys) {
    const entry = quoteCache[key];
    if (!oldestTimestamp || entry.timestamp < oldestTimestamp) {
      oldestTimestamp = entry.timestamp;
    }
  }
  
  return {
    size: keys.length,
    oldestEntry: oldestTimestamp ? Math.floor((now - oldestTimestamp) / 1000) : null
  };
};

