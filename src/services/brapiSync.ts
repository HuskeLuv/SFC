import prisma from '@/lib/prisma';
import { fetchDetailedQuotes } from '@/services/brapiQuote';
import { Decimal } from '@prisma/client/runtime/library';

// ================== TYPES ==================

interface BrapiStock {
  stock: string;
  name: string;
  type?: string;
  sector?: string;
}

interface BrapiCrypto {
  symbol: string;
  name: string;
  price: number;
  change_24h: number;
  change_percentage_24h: number;
  market_cap: number;
  volume_24h: number;
  currency: string;
}

/** Formato retornado pela API Brapi v2/crypto (coin, coinName, regularMarketPrice) */
interface BrapiCryptoApiResponse {
  coin?: string;
  coinName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  marketCap?: number;
  regularMarketVolume?: number;
  currency?: string;
}

interface BrapiStocksResponse {
  stocks: BrapiStock[];
}

interface BrapiCryptoResponse {
  coins?: BrapiCryptoApiResponse[];
}

interface SyncResult {
  inserted: number;
  updated: number;
  errors: number;
}

interface SyncPriceResult {
  totalInserted: number;
  totalUpdated: number;
  errors: number;
  duration: number;
}

// ================== API FETCH FUNCTIONS ==================

/**
 * Busca lista de ativos da B3 via API brapi.dev
 */
const fetchStocks = async (): Promise<BrapiStock[]> => {
  console.log('🔍 Buscando dados de ativos da B3...');
  
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const response = await fetch('https://brapi.dev/api/quote/list', {
      headers
    });
    
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status} - ${response.statusText}`);
    }
    
    const data: BrapiStocksResponse = await response.json();
    
    if (!data.stocks || !Array.isArray(data.stocks)) {
      throw new Error('Formato de resposta inesperado da API brapi.dev');
    }
    
    console.log(`✅ ${data.stocks.length} ativos encontrados na API`);
    return data.stocks;
    
  } catch (error) {
    console.error('❌ Erro ao buscar dados da API brapi.dev:', error);
    throw error;
  }
};

/**
 * Busca lista de criptoativos via API brapi.dev
 */
const fetchCrypto = async (): Promise<BrapiCrypto[]> => {
  console.log('🔍 Buscando dados de criptoativos...');
  
  try {
    const apiKey = process.env.BRAPI_API_KEY;
    
    if (!apiKey) {
      console.log('⚠️  Chave de API da Brapi não encontrada, pulando criptoativos');
      return [];
    }
    
    // Lista das principais criptomoedas
    const coins = ['BTC', 'ETH', 'ADA', 'SOL', 'BNB', 'XRP', 'DOT', 'DOGE', 'AVAX', 'MATIC'];
    const coinList = coins.join(',');
    
    const url = `https://brapi.dev/api/v2/crypto?coin=${coinList}&currency=USD&token=${apiKey}`;
    
    console.log(`🔍 Fazendo requisição para: ${url.replace(apiKey, '***')}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status} - ${response.statusText}`);
    }
    
    const data: BrapiCryptoResponse = await response.json();
    
    if (!data.coins || !Array.isArray(data.coins)) {
      throw new Error('Formato de resposta inesperado da API brapi.dev para criptos');
    }
    
    // Normalizar formato da API v2 (coin, coinName, regularMarketPrice) para BrapiCrypto
    const normalized: BrapiCrypto[] = data.coins
      .map((c) => {
        const api = c as BrapiCryptoApiResponse;
        const legacy = c as BrapiCrypto;
        const symbol = api.coin ?? legacy.symbol ?? '';
        return {
          symbol,
          name: api.coinName ?? legacy.name ?? symbol,
          price: api.regularMarketPrice ?? legacy.price ?? 0,
          change_24h: api.regularMarketChange ?? legacy.change_24h ?? 0,
          change_percentage_24h: api.regularMarketChangePercent ?? legacy.change_percentage_24h ?? 0,
          market_cap: api.marketCap ?? legacy.market_cap ?? 0,
          volume_24h: api.regularMarketVolume ?? legacy.volume_24h ?? 0,
          currency: api.currency ?? legacy.currency ?? 'USD',
        };
      })
      .filter((c) => c.symbol.length > 0);
    
    console.log(`✅ ${normalized.length} criptoativos encontrados na API`);
    return normalized;
    
  } catch (error) {
    console.error('❌ Erro ao buscar dados de criptos da API brapi.dev:', error);
    // Retornar lista vazia em caso de erro para não quebrar a sincronização
    return [];
  }
};

// ================== HELPER FUNCTIONS ==================

/**
 * Determina o tipo do ativo baseado no nome e características
 */
const determineAssetType = (stock: BrapiStock): string => {
  const name = stock.name?.toLowerCase() || '';
  const symbol = stock.stock?.toLowerCase() || '';
  
  // FIIs geralmente têm "fundo imobiliário" no nome ou terminam com 11
  if (name.includes('fundo imobiliário') || name.includes('fii') || symbol.endsWith('11')) {
    return 'fii';
  }
  
  // ETFs geralmente terminam com 11 e têm "etf" no nome
  if (name.includes('etf') || (symbol.endsWith('11') && name.includes('índice'))) {
    return 'etf';
  }
  
  // BDRs geralmente terminam com 34
  if (symbol.endsWith('34')) {
    return 'bdr';
  }
  
  // REITs podem ter "reit" no nome
  if (name.includes('reit')) {
    return 'reit';
  }
  
  // Por padrão, considera como ação
  return 'stock';
};

/**
 * Determina a moeda baseada no tipo do ativo
 */
const determineCurrency = (type: string): string => {
  return type === 'crypto' ? 'USD' : 'BRL';
};

// ================== DATABASE SYNC FUNCTIONS ==================

/**
 * Sincroniza ativos da B3 no banco de dados
 */
const syncStocks = async (stocks: BrapiStock[]): Promise<SyncResult> => {
  console.log('💾 Sincronizando ativos da B3 no banco de dados...');
  
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  
  try {
    for (const stock of stocks) {
      if (!stock.stock) {
        console.warn('⚠️  Ativo sem symbol, pulando:', stock);
        errors++;
        continue;
      }
      
      try {
        const type = determineAssetType(stock);
        const currency = determineCurrency(type);
        
        // Verificar se o ativo já existe
        const existingAsset = await prisma.asset.findUnique({
          where: {
            symbol: stock.stock
          }
        });

        if (existingAsset) {
          // Atualizar ativo existente
          await prisma.asset.update({
            where: {
              symbol: stock.stock
            },
            data: {
              name: stock.name || stock.stock,
              type: type,
              currency: currency,
              source: 'brapi',
              updatedAt: new Date()
            }
          });
          updated++;
        } else {
          // Criar novo ativo
          await prisma.asset.create({
            data: {
              symbol: stock.stock,
              name: stock.name || stock.stock,
              type: type,
              currency: currency,
              source: 'brapi'
            }
          });
          inserted++;
        }
        
      } catch (error) {
        console.error(`❌ Erro ao sincronizar ativo ${stock.stock}:`, error);
        errors++;
      }
    }
    
    console.log(`✅ Ativos da B3 sincronizados: ${inserted} inseridos, ${updated} atualizados, ${errors} erros`);
    return { inserted, updated, errors };
    
  } catch (error) {
    console.error('❌ Erro geral ao sincronizar ativos da B3:', error);
    throw error;
  }
};

/**
 * Sincroniza criptoativos no banco de dados
 */
const syncCrypto = async (cryptos: BrapiCrypto[]): Promise<SyncResult> => {
  console.log('💾 Sincronizando criptoativos no banco de dados...');
  
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  
  try {
    for (const crypto of cryptos) {
      if (!crypto.symbol) {
        console.warn('⚠️  Cripto sem symbol, pulando:', crypto);
        errors++;
        continue;
      }
      
      try {
        // Verificar se o criptoativo já existe
        const existingCrypto = await prisma.asset.findUnique({
          where: {
            symbol: crypto.symbol
          }
        });

        if (existingCrypto) {
          // Atualizar criptoativo existente
          await prisma.asset.update({
            where: {
              symbol: crypto.symbol
            },
            data: {
              name: crypto.name || crypto.symbol,
              type: 'crypto',
              currency: crypto.currency || 'USD',
              source: 'brapi',
              updatedAt: new Date()
            }
          });
          updated++;
        } else {
          // Criar novo criptoativo
          await prisma.asset.create({
            data: {
              symbol: crypto.symbol,
              name: crypto.name || crypto.symbol,
              type: 'crypto',
              currency: crypto.currency || 'USD',
              source: 'brapi'
            }
          });
          inserted++;
        }
        
      } catch (error) {
        console.error(`❌ Erro ao sincronizar cripto ${crypto.symbol}:`, error);
        errors++;
      }
    }
    
    console.log(`✅ Criptoativos sincronizados: ${inserted} inseridos, ${updated} atualizados, ${errors} erros`);
    return { inserted, updated, errors };
    
  } catch (error) {
    console.error('❌ Erro geral ao sincronizar criptoativos:', error);
    throw error;
  }
};

// ================== PRICE SYNC ==================

const BATCH_DELAY_MS = 400;

const parseMarketDate = (regularMarketTime: string | undefined): Date => {
  if (!regularMarketTime) return new Date();
  const d = new Date(regularMarketTime);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

/**
 * Sincroniza preços dos ativos no banco (AssetPriceHistory + Asset.currentPrice).
 * Busca cotações na BRAPI em batches e persiste.
 */
export const syncAssetPrices = async (): Promise<SyncPriceResult> => {
  console.log('💰 Sincronizando preços dos ativos...');

  const startTime = Date.now();
  let totalInserted = 0;
  let totalUpdated = 0;
  let errors = 0;

  const excludedTypes = ['emergency', 'opportunity', 'personalizado', 'imovel'];
  const excludedPrefixes = ['RESERVA-EMERG', 'RESERVA-OPORT', 'PERSONALIZADO'];

  const assets = await prisma.asset.findMany({
    where: {
      type: { notIn: excludedTypes },
      symbol: {
        not: {
          startsWith: 'RESERVA-',
        },
      },
    },
    select: { id: true, symbol: true, currency: true },
  });

  const symbols = assets
    .map((a) => a.symbol.trim().toUpperCase())
    .filter((s) => !excludedPrefixes.some((p) => s.startsWith(p)));

  if (symbols.length === 0) {
    console.log('   Nenhum ativo para sincronizar preços');
    return { totalInserted: 0, totalUpdated: 0, errors: 0, duration: (Date.now() - startTime) / 1000 };
  }

  const BATCH_SIZE = 20;
  const assetBySymbol = new Map(assets.map((a) => [a.symbol.toUpperCase(), a]));

  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    try {
      const results = await fetchDetailedQuotes(batch);

      for (const r of results) {
        if (!r.symbol || r.regularMarketPrice == null || r.regularMarketPrice <= 0) continue;

        const symbolUpper = r.symbol.toUpperCase();
        const asset = assetBySymbol.get(symbolUpper);
        if (!asset) continue;

        const marketDate = parseMarketDate(r.regularMarketTime);
        const currency = r.currency || asset.currency;

        try {
          const existing = await prisma.assetPriceHistory.findUnique({
            where: {
              symbol_date: {
                symbol: symbolUpper,
                date: new Date(marketDate.getFullYear(), marketDate.getMonth(), marketDate.getDate()),
              },
            },
          });

          await prisma.$transaction([
            prisma.assetPriceHistory.upsert({
              where: {
                symbol_date: {
                  symbol: symbolUpper,
                  date: new Date(marketDate.getFullYear(), marketDate.getMonth(), marketDate.getDate()),
                },
              },
              update: { price: new Decimal(r.regularMarketPrice) },
              create: {
                assetId: asset.id,
                symbol: symbolUpper,
                price: new Decimal(r.regularMarketPrice),
                currency: currency ?? null,
                source: 'BRAPI',
                date: new Date(marketDate.getFullYear(), marketDate.getMonth(), marketDate.getDate()),
              },
            }),
            prisma.asset.update({
              where: { id: asset.id },
              data: {
                currentPrice: new Decimal(r.regularMarketPrice),
                priceUpdatedAt: marketDate,
              },
            }),
          ]);

          if (existing) totalUpdated++;
          else totalInserted++;
        } catch (persistErr) {
          console.warn(`   Erro ao persistir preço de ${r.symbol}:`, persistErr);
          errors++;
        }
      }

      if (i + BATCH_SIZE < symbols.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    } catch (batchErr) {
      console.error(`   Erro no batch de preços:`, batchErr);
      errors += batch.length;
    }
  }

  const duration = (Date.now() - startTime) / 1000;

  await prisma.syncPriceLog.create({
    data: {
      totalInserted,
      totalUpdated,
      errors,
      duration: Math.round(duration),
    },
  });

  console.log(`   Preços: ${totalInserted} inseridos, ${totalUpdated} atualizados, ${errors} erros (${duration.toFixed(1)}s)`);
  return { totalInserted, totalUpdated, errors, duration };
};

// ================== MAIN SYNC FUNCTION ==================

/**
 * Função principal que executa toda a sincronização de ativos
 */
export const syncAssets = async (): Promise<{
  stocks: SyncResult;
  crypto: SyncResult;
  prices: SyncPriceResult;
  total: SyncResult;
  duration: number;
}> => {
  console.log('🚀 Iniciando sincronização de ativos com Brapi...\n');

  const startTime = Date.now();

  try {
    // Buscar dados das APIs em paralelo
    console.log('📡 Buscando dados das APIs...');
    const [stocks, cryptos] = await Promise.all([fetchStocks(), fetchCrypto()]);

    console.log('\n💾 Sincronizando dados no banco...');

    // Sincronizar metadados no banco em paralelo
    const [stocksResult, cryptoResult] = await Promise.all([
      syncStocks(stocks),
      syncCrypto(cryptos),
    ]);

    // Sincronizar preços (após metadados)
    const pricesResult = await syncAssetPrices();

    // Calcular totais
    const total: SyncResult = {
      inserted: stocksResult.inserted + cryptoResult.inserted,
      updated: stocksResult.updated + cryptoResult.updated,
      errors: stocksResult.errors + cryptoResult.errors,
    };

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // Exibir resumo final
    console.log('\n🎉 Sincronização concluída com sucesso!');
    console.log('📊 RESUMO:');
    console.log(`   • Ativos B3: ${stocksResult.inserted} inseridos, ${stocksResult.updated} atualizados, ${stocksResult.errors} erros`);
    console.log(`   • Criptoativos: ${cryptoResult.inserted} inseridos, ${cryptoResult.updated} atualizados, ${cryptoResult.errors} erros`);
    console.log(`   • Preços: ${pricesResult.totalInserted} inseridos, ${pricesResult.totalUpdated} atualizados, ${pricesResult.errors} erros`);
    console.log(`   • Total: ${total.inserted} inseridos, ${total.updated} atualizados, ${total.errors} erros`);
    console.log(`   • Tempo total: ${duration.toFixed(2)}s`);

    return {
      stocks: stocksResult,
      crypto: cryptoResult,
      prices: pricesResult,
      total,
      duration,
    };
  } catch (error) {
    console.error('\n💥 Erro durante a sincronização:', error);
    throw error;
  }
};

// ================== UTILITY FUNCTIONS ==================

/**
 * Verifica se a sincronização está funcionando
 */
export const testSync = async (): Promise<boolean> => {
  try {
    console.log('🧪 Testando sincronização...');
    
    // Testar busca de ativos
    const stocks = await fetchStocks();
    if (!stocks || stocks.length === 0) {
      throw new Error('Nenhum ativo retornado pela API');
    }
    
    // Testar busca de criptos (opcional)
    const cryptos = await fetchCrypto();
    console.log(`📊 Criptoativos encontrados: ${cryptos.length}`);
    
    console.log('✅ Teste de sincronização passou!');
    return true;
    
  } catch (error) {
    console.error('❌ Teste de sincronização falhou:', error);
    return false;
  }
};

/**
 * Obtém estatísticas dos ativos no banco
 */
export const getAssetStats = async () => {
  try {
    const stats = await prisma.asset.groupBy({
      by: ['type', 'source'],
      _count: {
        id: true
      }
    });
    
    const total = await prisma.asset.count();
    
    return {
      byType: stats,
      total
    };
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    throw error;
  }
};
