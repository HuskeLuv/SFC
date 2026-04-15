/**
 * Serviço para buscar cotações atuais de ativos via brapi.dev
 * Usa o SDK oficial da brapi: https://brapi.dev/docs/sdks/typescript
 * Documentação: https://brapi.dev/docs
 */

import Brapi from 'brapi';

// ================== SDK CLIENT ==================

// Instância singleton do cliente Brapi (boas práticas: reutilizar a instância)
let brapiClient: Brapi | null = null;

const getBrapiClient = (): Brapi => {
  if (!brapiClient) {
    const apiKey = process.env.BRAPI_API_KEY;

    brapiClient = new Brapi({
      apiKey: apiKey || undefined,
      maxRetries: 2, // SDK já tem retry automático
      timeout: 25000, // 25s — leave headroom for Vercel's 60s function limit
    });
  }

  return brapiClient;
};

// ================== TYPES ==================

// Types exportados do SDK Brapi
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

// Delay entre requisições para evitar rate limiting (reduzido pois SDK já tem retry)
const REQUEST_DELAY = 300; // 300ms entre cada requisição

// ================== CRYPTO API (v2/crypto) ==================

/**
 * Busca cotações de criptomoedas via endpoint v2/crypto da Brapi.
 * O endpoint quote padrão não suporta criptos; este usa a API específica.
 * @param symbols - Símbolos (ex: ['BTC', 'ETH'])
 * @param currency - Moeda desejada (BRL ou USD)
 * @returns Mapa símbolo -> preço
 */
export const fetchCryptoQuotes = async (
  symbols: string[],
  currency: 'BRL' | 'USD' = 'BRL',
): Promise<Map<string, number>> => {
  const result = new Map<string, number>();
  if (!symbols?.length) return result;

  const apiKey = process.env.BRAPI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  BRAPI_API_KEY não configurada, não é possível buscar cotações de cripto');
    return result;
  }

  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return result;

  try {
    const coinList = unique.join(',');
    const url = `https://brapi.dev/api/v2/crypto?coin=${encodeURIComponent(coinList)}&currency=${currency}&token=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`⚠️  Brapi v2/crypto retornou ${response.status} para ${coinList}`);
      return result;
    }

    const data = await response.json();
    const coins = data?.coins;
    if (!Array.isArray(coins)) return result;

    for (const c of coins) {
      const symbol = (c.coin ?? c.symbol ?? '').toString().toUpperCase();
      const price = c.regularMarketPrice ?? c.price;
      if (symbol && typeof price === 'number' && price > 0) {
        result.set(symbol, price);
        console.log(`✅ ${symbol} (crypto): ${currency} ${price.toFixed(2)}`);
      }
    }
  } catch (err) {
    console.error('[fetchCryptoQuotes] Erro ao buscar cotações de cripto:', err);
  }

  return result;
};

// ================== CURRENCY API (v2/currency) ==================

/**
 * Busca cotações de moedas via endpoint v2/currency da Brapi.
 * Símbolos no formato XXX-BRL (ex: USD-BRL, EUR-BRL).
 * @param symbols - Símbolos (ex: ['USD-BRL', 'EUR-BRL'])
 * @returns Mapa símbolo -> preço em BRL
 */
export const fetchCurrencyQuotes = async (symbols: string[]): Promise<Map<string, number>> => {
  const result = new Map<string, number>();
  if (!symbols?.length) return result;

  const apiKey = process.env.BRAPI_API_KEY;
  const tokenParam = apiKey ? `&token=${apiKey}` : '';

  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const currencySymbols = unique.filter((s) => /^[A-Z]{3}-BRL$/.test(s));
  if (currencySymbols.length === 0) return result;

  for (const symbol of currencySymbols) {
    try {
      const url = `https://brapi.dev/api/v2/currency?currency=${encodeURIComponent(symbol)}${tokenParam}`;
      const response = await fetch(url, { cache: 'no-store' });

      if (!response.ok) continue;

      const data = await response.json();
      const items = Array.isArray(data?.currency) ? data.currency : [];
      const item = items[0];
      const bidPrice = item?.bidPrice ?? item?.bid;
      const askPrice = item?.askPrice ?? item?.ask;
      const price = Number.isFinite(bidPrice)
        ? bidPrice
        : Number.isFinite(askPrice)
          ? askPrice
          : null;

      if (price !== null && price > 0) {
        result.set(symbol, price);
        console.log(`✅ ${symbol} (currency): R$ ${price.toFixed(2)}`);
      }
    } catch (err) {
      console.error(`[fetchCurrencyQuotes] Erro ao buscar ${symbol}:`, err);
    }
  }

  return result;
};

// ================== API FUNCTIONS ==================

/**
 * Busca cotação de um único ativo via SDK brapi
 * @param symbol - Símbolo do ativo (ex: 'PETR4')
 * @param forceRefresh - Se true, ignora cache e busca dados frescos
 * @returns Preço do ativo ou null se não encontrado
 */
const fetchSingleQuote = async (
  symbol: string,
  forceRefresh: boolean = false,
): Promise<number | null> => {
  if (!symbol || !symbol.trim()) {
    return null;
  }

  try {
    const client = getBrapiClient();

    // Buscar cotação usando o SDK
    // O SDK permite buscar múltiplas de uma vez, mas aqui buscamos uma por vez
    const response = await client.quote.retrieve(symbol);

    if (!response.results || !Array.isArray(response.results) || response.results.length === 0) {
      console.error(`Formato de resposta inesperado para ${symbol}`);
      return null;
    }

    const result = response.results[0];
    if (
      result.symbol &&
      result.regularMarketPrice !== undefined &&
      result.regularMarketPrice !== null
    ) {
      console.log(
        `✅ ${symbol}: R$ ${result.regularMarketPrice.toFixed(2)} (${forceRefresh ? 'forçado' : 'SDK'})`,
      );
      return result.regularMarketPrice;
    }

    return null;
  } catch (error) {
    // SDK já trata erros tipados (APIError, RateLimitError, etc.)
    if (error instanceof Brapi.APIError) {
      if (error.status === 429) {
        console.warn(`Rate limit atingido para ${symbol}, SDK fará retry automático`);
      } else if (error.status === 404 || error.message.includes('Não encontramos a ação')) {
        console.warn(`⚠️  Ação não encontrada na API para ${symbol}`);
      } else {
        console.error(`Erro ao buscar cotação de ${symbol}: ${error.status} - ${error.message}`);
      }
    } else {
      console.error(`Erro ao buscar cotação de ${symbol}:`, error);
    }
    return null;
  }
};

/**
 * Busca cotações de múltiplos ativos via SDK brapi
 * O SDK permite buscar múltiplas cotações de uma vez, otimizando as requisições
 * @param symbols - Array de símbolos (ex: ['PETR4', 'VALE3', 'ITUB4'])
 * @param forceRefresh - Se true, ignora cache e busca dados frescos da API
 * @returns Mapa de símbolo -> preço
 */
export const fetchQuotes = async (
  symbols: string[],
  forceRefresh: boolean = false,
): Promise<Map<string, number>> => {
  try {
    if (!symbols || symbols.length === 0) {
      return new Map();
    }

    // Filtrar símbolos únicos, remover vazios e excluir símbolos inválidos para brapi
    // (reserva, renda fixa, personalizado, ativos manuais: debênture, fundo, REIT)
    const uniqueSymbols = [
      ...new Set(
        symbols.filter((s) => {
          if (!s?.trim()) return false;
          const upper = s.trim().toUpperCase();
          if (
            upper.startsWith('RESERVA-EMERG') ||
            upper.startsWith('RESERVA-OPORT') ||
            upper.startsWith('RENDA-FIXA') ||
            upper.startsWith('CONTA-CORRENTE') ||
            upper.startsWith('PERSONALIZADO')
          )
            return false;
          if (upper.startsWith('DEBENTURE-') || upper.startsWith('FUNDO-')) return false;
          if (/-\d{13}-/.test(upper)) return false; // ativos manuais com timestamp (ex: PLD-1771516010088-4gvgkb2)
          if (upper.startsWith('-') || /^\d/.test(upper)) return false;
          return /^[A-Za-z]/.test(upper);
        }),
      ),
    ];

    if (uniqueSymbols.length === 0) {
      return new Map();
    }

    const quotes = new Map<string, number>();
    const now = Date.now();

    // Se forceRefresh é true, buscar todos os símbolos
    // Caso contrário, verificar cache primeiro
    const symbolsToFetch: string[] = [];

    if (forceRefresh) {
      // Forçar busca de todos os símbolos
      symbolsToFetch.push(...uniqueSymbols);
      console.log(
        `🔄 Buscando cotações frescas de ${uniqueSymbols.length} ativos usando SDK (forçado)`,
      );
    } else {
      // Verificar cache primeiro
      for (const symbol of uniqueSymbols) {
        const cached = quoteCache[symbol];
        if (cached && now - cached.timestamp < CACHE_DURATION) {
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

      console.log(
        `🔍 Buscando cotações de ${symbolsToFetch.length} ativos usando SDK (${uniqueSymbols.length - symbolsToFetch.length} em cache)`,
      );
    }

    // Usar SDK para buscar múltiplas cotações de uma vez (mais eficiente)
    // A API brapi permite buscar até 20 símbolos por requisição separados por vírgula
    const BATCH_SIZE = 20;

    const invalidSymbols = new Set<string>();

    for (let i = 0; i < symbolsToFetch.length; i += BATCH_SIZE) {
      const batch = symbolsToFetch.slice(i, i + BATCH_SIZE);
      // Normalizar símbolos para maiúsculas e remover espaços
      const normalizedBatch = batch
        .map((s) => s.trim().toUpperCase())
        .filter((symbol) => !invalidSymbols.has(symbol));
      const symbolsString = normalizedBatch.join(',');

      try {
        if (!symbolsString) {
          continue;
        }

        const client = getBrapiClient();
        const response = await client.quote.retrieve(symbolsString);

        if (response.results && Array.isArray(response.results)) {
          for (const result of response.results) {
            if (
              result.symbol &&
              result.regularMarketPrice !== undefined &&
              result.regularMarketPrice !== null
            ) {
              const price = result.regularMarketPrice;
              quotes.set(result.symbol, price);

              // Atualizar cache sempre
              quoteCache[result.symbol] = {
                price: price,
                timestamp: now,
              };

              console.log(`✅ ${result.symbol}: R$ ${price.toFixed(2)}`);
            }
          }
        }

        // Verificar quais símbolos não foram retornados
        const returnedSymbols = new Set(
          response.results?.map((r) => r.symbol?.toUpperCase()) || [],
        );
        const missingSymbols = batch.filter((s) => {
          const symbolUpper = s.toUpperCase();
          return !returnedSymbols.has(symbolUpper);
        });

        for (const symbol of missingSymbols) {
          console.warn(
            `⚠️  Não foi possível obter cotação de ${symbol} - tentando busca individual...`,
          );

          // Tentar buscar individualmente antes de usar cache
          try {
            const price = await fetchSingleQuote(symbol, forceRefresh);
            if (price !== null) {
              quotes.set(symbol, price);
              quoteCache[symbol] = { price, timestamp: now };
              console.log(`✅ ${symbol}: R$ ${price.toFixed(2)} (busca individual)`);
              continue; // Símbolo encontrado, não precisa usar cache
            }
          } catch (singleError) {
            console.warn(`⚠️  Erro ao buscar cotação individual de ${symbol}:`, singleError);
          }

          // Se falhou mas temos cache antigo, usar cache como fallback apenas se não for forceRefresh
          if (!forceRefresh) {
            const cached = quoteCache[symbol];
            if (cached) {
              quotes.set(symbol, cached.price);
              console.log(`📦 Usando cache antigo para ${symbol}: R$ ${cached.price.toFixed(2)}`);
            } else {
              console.warn(`❌ ${symbol} não encontrado na API e não há cache disponível`);
            }
          } else {
            console.warn(`❌ ${symbol} não encontrado na API (forceRefresh=true, sem cache)`);
          }
        }

        // Aguardar antes do próximo batch (exceto no último)
        if (i + BATCH_SIZE < symbolsToFetch.length) {
          await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY));
        }
      } catch (error) {
        // Verificar se é um erro de API (500, 429, etc.)
        let errorStatus: number | null = null;
        let errorMessage = '';
        let invalidSymbolFromMessage: string | null = null;

        // Extrair informações do erro
        if (error && typeof error === 'object') {
          // Verificar se tem propriedade status diretamente
          if ('status' in error) {
            const statusValue = (error as { status?: unknown }).status;
            if (typeof statusValue === 'number') {
              errorStatus = statusValue;
            }
          }

          // Verificar se é uma instância de Error
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if ('message' in error) {
            errorMessage = String((error as { message?: unknown }).message ?? '');
          }
        } else if (typeof error === 'string') {
          errorMessage = error;
        }

        if (errorMessage.includes('Não encontramos a ação')) {
          const match = errorMessage.match(/Não encontramos a ação\s+([A-Z0-9.-]+)/i);
          if (match?.[1]) {
            invalidSymbolFromMessage = match[1].toUpperCase();
            invalidSymbols.add(invalidSymbolFromMessage);
          }
        }
        // 404 "Nenhum resultado encontrado" = batch inteiro inválido; tratar todos como não encontrados
        if (errorStatus === 404 && !invalidSymbolFromMessage) {
          console.warn(
            `⚠️  API brapi retornou 404 para batch. Símbolos podem ser inválidos (reserva, renda fixa, etc).`,
          );
          for (const sym of normalizedBatch) {
            invalidSymbols.add(sym);
          }
          continue;
        }

        if (errorStatus === 404 && invalidSymbolFromMessage) {
          console.warn(
            `⚠️  Símbolo inválido na API: ${invalidSymbolFromMessage}. Reprocessando batch sem ele.`,
          );
          const retryBatch = normalizedBatch.filter(
            (symbol) => symbol !== invalidSymbolFromMessage,
          );
          if (!retryBatch.length) {
            continue;
          }

          try {
            const client = getBrapiClient();
            const retryResponse = await client.quote.retrieve(retryBatch.join(','));

            if (retryResponse.results && Array.isArray(retryResponse.results)) {
              for (const result of retryResponse.results) {
                if (
                  result.symbol &&
                  result.regularMarketPrice !== undefined &&
                  result.regularMarketPrice !== null
                ) {
                  const price = result.regularMarketPrice;
                  quotes.set(result.symbol, price);
                  quoteCache[result.symbol] = { price, timestamp: now };
                  console.log(`✅ ${result.symbol}: R$ ${price.toFixed(2)}`);
                }
              }
            }

            // Após retry, seguir fluxo normal para missingSymbols
            const returnedSymbols = new Set(
              retryResponse.results?.map((r) => r.symbol?.toUpperCase()) || [],
            );
            const missingSymbols = retryBatch.filter((s) => !returnedSymbols.has(s.toUpperCase()));
            for (const symbol of missingSymbols) {
              console.warn(
                `⚠️  Não foi possível obter cotação de ${symbol} - tentando busca individual...`,
              );
              try {
                const price = await fetchSingleQuote(symbol, forceRefresh);
                if (price !== null) {
                  quotes.set(symbol, price);
                  quoteCache[symbol] = { price, timestamp: now };
                  console.log(`✅ ${symbol}: R$ ${price.toFixed(2)} (busca individual)`);
                  continue;
                }
              } catch (singleError) {
                console.warn(`⚠️  Erro ao buscar cotação individual de ${symbol}:`, singleError);
              }

              if (!forceRefresh) {
                const cached = quoteCache[symbol];
                if (cached) {
                  quotes.set(symbol, cached.price);
                  console.log(
                    `📦 Usando cache antigo para ${symbol}: R$ ${cached.price.toFixed(2)}`,
                  );
                } else {
                  console.warn(`❌ ${symbol} não encontrado na API e não há cache disponível`);
                }
              } else {
                console.warn(`❌ ${symbol} não encontrado na API (forceRefresh=true, sem cache)`);
              }
            }

            if (i + BATCH_SIZE < symbolsToFetch.length) {
              await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY));
            }
          } catch (retryError) {
            console.error(
              `❌ Erro ao reprocessar batch sem ${invalidSymbolFromMessage}:`,
              retryError,
            );
          }
          continue;
        }

        // Verificar se é erro 500 (pode estar na mensagem ou no status)
        const is500Error =
          errorStatus === 500 ||
          (errorMessage &&
            (errorMessage.startsWith('500') ||
              errorMessage.includes('500: Internal server error'))) ||
          (error &&
            typeof error === 'object' &&
            'status' in error &&
            (error as { status?: number }).status === 500);

        if (is500Error) {
          console.warn(
            `⚠️  API brapi.dev retornou erro 500 para batch. Usando cache ou preços médios como fallback.`,
          );
        } else {
          console.error(`❌ Erro ao buscar cotações do batch:`, error);
        }

        // Para qualquer erro, tentar usar cache primeiro (não fazer requisições adicionais se for 500)
        for (const symbol of batch) {
          if (!forceRefresh) {
            const cached = quoteCache[symbol];
            if (cached) {
              quotes.set(symbol, cached.price);
              console.log(
                `📦 Usando cache após erro para ${symbol}: R$ ${cached.price.toFixed(2)}`,
              );
            }
          }
        }

        // Se ainda não temos todas as cotações e não é erro 500, tentar buscar individualmente
        // Para erro 500, não tentar buscar individualmente (economiza requisições)
        if (!is500Error) {
          const missingSymbols = batch.filter((s) => !quotes.has(s));
          for (const symbol of missingSymbols) {
            try {
              const price = await fetchSingleQuote(symbol, forceRefresh);
              if (price !== null) {
                quotes.set(symbol, price);
                quoteCache[symbol] = { price, timestamp: now };
              }
            } catch (singleError) {
              console.error(`❌ Erro ao buscar cotação individual de ${symbol}:`, singleError);
              // Já tentamos cache acima, então não há mais o que fazer
            }
          }
        }
      }
    }

    return quotes;
  } catch (error) {
    // Garantir que sempre retornamos um Map, mesmo em caso de erro fatal
    console.error('[fetchQuotes] Erro fatal ao buscar cotações:', error);
    return new Map();
  }
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
  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.price;
  }

  // Buscar da API
  return await fetchSingleQuote(symbol);
};

/**
 * Busca cotações com informações detalhadas usando SDK brapi
 * @param symbols - Array de símbolos
 * @returns Array de resultados detalhados
 */
export const fetchDetailedQuotes = async (symbols: string[]): Promise<BrapiQuoteResult[]> => {
  if (!symbols || symbols.length === 0) {
    return [];
  }

  // Filtrar símbolos únicos, remover vazios e excluir ativos manuais (sem cotações externas)
  const upper = (x: string) => x.trim().toUpperCase();
  const uniqueSymbols = [
    ...new Set(
      symbols.filter((s) => {
        if (!s?.trim()) return false;
        const u = upper(s);
        if (
          u.startsWith('RESERVA-EMERG') ||
          u.startsWith('RESERVA-OPORT') ||
          u.startsWith('PERSONALIZADO')
        )
          return false;
        if (u.startsWith('DEBENTURE-') || u.startsWith('FUNDO-')) return false;
        if (/-\d{13}-/.test(u)) return false; // ativos manuais com timestamp
        return true;
      }),
    ),
  ];

  if (uniqueSymbols.length === 0) {
    return [];
  }

  const results: BrapiQuoteResult[] = [];
  const client = getBrapiClient();

  console.log(`🔍 Buscando cotações detalhadas de ${uniqueSymbols.length} ativos usando SDK`);

  // SDK permite buscar múltiplas de uma vez, processar em batches de 20
  const BATCH_SIZE = 20;

  for (let i = 0; i < uniqueSymbols.length; i += BATCH_SIZE) {
    const batch = uniqueSymbols.slice(i, i + BATCH_SIZE);
    const symbolsString = batch.join(',');

    try {
      const response = await client.quote.retrieve(symbolsString);

      if (response.results && Array.isArray(response.results)) {
        // Converter tipos do SDK para nosso formato
        const convertedResults: BrapiQuoteResult[] = response.results
          .filter(
            (r) => r.symbol && r.regularMarketPrice !== null && r.regularMarketPrice !== undefined,
          )
          .map((r) => ({
            symbol: r.symbol!,
            shortName: r.shortName || '',
            longName: r.longName ?? undefined,
            currency: r.currency || 'BRL',
            regularMarketPrice: r.regularMarketPrice!,
            regularMarketDayHigh: r.regularMarketDayHigh ?? undefined,
            regularMarketDayLow: r.regularMarketDayLow ?? undefined,
            regularMarketChange: r.regularMarketChange ?? undefined,
            regularMarketChangePercent: r.regularMarketChangePercent ?? undefined,
            regularMarketTime: r.regularMarketTime || new Date().toISOString(),
            regularMarketVolume: r.regularMarketVolume ?? undefined,
            marketCap: r.marketCap ?? undefined,
          }));
        results.push(...convertedResults);
      }

      // Aguardar antes do próximo batch (exceto no último)
      if (i + BATCH_SIZE < uniqueSymbols.length) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY));
      }
    } catch (error) {
      if (error instanceof Brapi.APIError) {
        console.error(
          `Erro ao buscar cotações detalhadas do batch: ${error.status} - ${error.message}`,
        );
      } else {
        console.error(`Erro ao buscar cotações detalhadas do batch:`, error);
      }
    }
  }

  return results;
};

/**
 * Limpa o cache de cotações
 */
export const clearQuoteCache = (): void => {
  Object.keys(quoteCache).forEach((key) => delete quoteCache[key]);
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
    oldestEntry: oldestTimestamp ? Math.floor((now - oldestTimestamp) / 1000) : null,
  };
};
