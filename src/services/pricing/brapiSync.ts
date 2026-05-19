import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { fetchDetailedQuotes, fetchCryptoQuotes, fetchCurrencyQuotes } from './brapiQuote';
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
  logger.info('🔍 Buscando dados de ativos da B3...');

  try {
    const apiKey = process.env.BRAPI_API_KEY;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch('https://brapi.dev/api/quote/list', {
      headers,
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status} - ${response.statusText}`);
    }

    const data: BrapiStocksResponse = await response.json();

    if (!data.stocks || !Array.isArray(data.stocks)) {
      throw new Error('Formato de resposta inesperado da API brapi.dev');
    }

    logger.info(`✅ ${data.stocks.length} ativos encontrados na API`);
    return data.stocks;
  } catch (error) {
    logger.error('❌ Erro ao buscar dados da API brapi.dev:', error);
    throw error;
  }
};

/**
 * Busca lista de criptoativos via API brapi.dev
 */
const fetchCrypto = async (): Promise<BrapiCrypto[]> => {
  logger.info('🔍 Buscando dados de criptoativos...');

  try {
    const apiKey = process.env.BRAPI_API_KEY;

    if (!apiKey) {
      logger.info('⚠️  Chave de API da Brapi não encontrada, pulando criptoativos');
      return [];
    }

    // Lista das principais criptomoedas
    const coins = ['BTC', 'ETH', 'ADA', 'SOL', 'BNB', 'XRP', 'DOT', 'DOGE', 'AVAX', 'MATIC'];
    const coinList = coins.join(',');

    const url = `https://brapi.dev/api/v2/crypto?coin=${coinList}&currency=USD&token=${apiKey}`;

    logger.info(`🔍 Fazendo requisição para: ${url.replace(apiKey, '***')}`);

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
          change_percentage_24h:
            api.regularMarketChangePercent ?? legacy.change_percentage_24h ?? 0,
          market_cap: api.marketCap ?? legacy.market_cap ?? 0,
          volume_24h: api.regularMarketVolume ?? legacy.volume_24h ?? 0,
          currency: api.currency ?? legacy.currency ?? 'USD',
        };
      })
      .filter((c) => c.symbol.length > 0);

    logger.info(`✅ ${normalized.length} criptoativos encontrados na API`);
    return normalized;
  } catch (error) {
    logger.error('❌ Erro ao buscar dados de criptos da API brapi.dev:', error);
    // Retornar lista vazia em caso de erro para não quebrar a sincronização
    return [];
  }
};

// ================== HELPER FUNCTIONS ==================

/**
 * Determina o tipo do ativo baseado no nome e características.
 *
 * A heurística antiga marcava qualquer symbol terminado em '11' como FII,
 * o que poluía o filtro FII com units (ENGI11, BPAC11, SANB11, ALUP11,
 * SAPR11 — units de empresas, não fundos imobiliários). A classificação
 * agora prioriza o nome quando disponível e cai no symbol só como fallback.
 * O endpoint `/api/quote/list` da BRAPI muitas vezes devolve nome vazio;
 * nesse caso o ativo entra como 'stock' e é reclassificado depois pelo
 * `syncAssetPrices` quando `fetchDetailedQuotes` traz o `longName`.
 */
const determineAssetType = (stock: BrapiStock): string => {
  const name = stock.name?.toLowerCase() || '';
  const symbol = stock.stock?.toLowerCase() || '';

  return classifyByName(name, symbol, 'stock');
};

/**
 * Reclassifica/classifica o tipo de um ativo a partir de um nome real (longName
 * do BRAPI detailed quote ou shortName). Usado tanto no insert inicial quanto
 * no sync de preços para corrigir entries que entraram com nome vazio.
 *
 * Retorna `currentType` se o nome não tem sinal claro — evita downgrade
 * acidental de ativos já bem classificados (ex.: ETF, REIT).
 */
export const classifyByName = (
  name: string,
  symbol: string,
  currentType: string = 'stock',
): string => {
  const lowerName = name.toLowerCase();
  const lowerSymbol = symbol.toLowerCase();

  // Sinais fortes de FII no nome: "fundo de investimento imobiliario",
  // "fundo imobiliário", "fofii" (variação de FII de Fundos), ou "FII"/"FOF"
  // como palavra. "imobil" cobre acentuado e não-acentuado.
  const isFiiByName = lowerName.includes('imobil') || /\bfii\b/.test(lowerName);
  if (isFiiByName) return 'fii';

  // Units (BPAC11, SANB11, ENGI11, ALUP11 etc.) — BRAPI usa "Unit" ou "Units"
  // no longName. Word-bounded pra evitar matching com "United"/"unity".
  if (/\bunits?\b/.test(lowerName)) return 'stock';

  // ETF: "ETF", "iShares", "S&P", "Ibovespa Index" etc.
  if (/\betf\b/.test(lowerName) || lowerName.includes('ishares')) return 'etf';

  // REIT: word-bounded — "direitos creditórios" (FIDCs/infra) NÃO é REIT.
  if (/\breit\b/.test(lowerName)) return 'reit';

  // BDR: ticker termina em 34
  if (lowerSymbol.endsWith('34')) return 'bdr';

  // Sem sinal no nome: usa o symbol. endsWith('11') é fraco — só aplica se
  // não temos nome (criação inicial) e mesmo assim cai em 'stock' por
  // segurança; o sync de preços corrige depois com o longName.
  if (!lowerName || lowerName === lowerSymbol) {
    return currentType;
  }

  return currentType;
};

/**
 * Determina a moeda baseada no tipo do ativo
 */
const determineCurrency = (type: string): string => {
  return type === 'crypto' ? 'USD' : 'BRL';
};

// ================== MOEDAS (Brapi currency) ==================

const MOEDAS_BRAPI = [
  { symbol: 'USD-BRL', name: 'Dólar Americano (USD)', currency: 'BRL' },
  { symbol: 'EUR-BRL', name: 'Euro (EUR)', currency: 'BRL' },
  { symbol: 'GBP-BRL', name: 'Libra Esterlina (GBP)', currency: 'BRL' },
  { symbol: 'CAD-BRL', name: 'Dólar Canadense (CAD)', currency: 'BRL' },
  { symbol: 'AUD-BRL', name: 'Dólar Australiano (AUD)', currency: 'BRL' },
  { symbol: 'JPY-BRL', name: 'Iene Japonês (JPY)', currency: 'BRL' },
  { symbol: 'CHF-BRL', name: 'Franco Suíço (CHF)', currency: 'BRL' },
  { symbol: 'CNY-BRL', name: 'Yuan Chinês (CNY)', currency: 'BRL' },
  { symbol: 'ARS-BRL', name: 'Peso Argentino (ARS)', currency: 'BRL' },
  { symbol: 'CLP-BRL', name: 'Peso Chileno (CLP)', currency: 'BRL' },
];

/**
 * Sincroniza moedas disponíveis na Brapi no banco de dados.
 * As cotações são atualizadas em syncAssetPrices.
 */
const syncMoedas = async (): Promise<SyncResult> => {
  logger.info('💱 Sincronizando moedas disponíveis na Brapi...');

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  try {
    for (const moeda of MOEDAS_BRAPI) {
      try {
        const existing = await prisma.asset.findUnique({
          where: { symbol: moeda.symbol },
        });

        if (existing) {
          await prisma.asset.update({
            where: { symbol: moeda.symbol },
            data: {
              name: moeda.name,
              type: 'currency',
              currency: moeda.currency,
              source: 'brapi',
              updatedAt: new Date(),
            },
          });
          updated++;
        } else {
          await prisma.asset.create({
            data: {
              symbol: moeda.symbol,
              name: moeda.name,
              type: 'currency',
              currency: moeda.currency,
              source: 'brapi',
            },
          });
          inserted++;
        }
      } catch (error) {
        logger.error(`❌ Erro ao sincronizar moeda ${moeda.symbol}:`, error);
        errors++;
      }
    }

    logger.info(
      `✅ Moedas sincronizadas: ${inserted} inseridas, ${updated} atualizadas, ${errors} erros`,
    );
    return { inserted, updated, errors };
  } catch (error) {
    logger.error('❌ Erro geral ao sincronizar moedas:', error);
    throw error;
  }
};

// ================== DATABASE SYNC FUNCTIONS ==================

/**
 * Sincroniza ativos da B3 no banco de dados
 */
const syncStocks = async (stocks: BrapiStock[]): Promise<SyncResult> => {
  logger.info('💾 Sincronizando ativos da B3 no banco de dados...');

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  try {
    for (const stock of stocks) {
      if (!stock.stock) {
        logger.warn('⚠️  Ativo sem symbol, pulando:', stock);
        errors++;
        continue;
      }

      try {
        const type = determineAssetType(stock);
        const currency = determineCurrency(type);

        // Verificar se o ativo já existe
        const existingAsset = await prisma.asset.findUnique({
          where: {
            symbol: stock.stock,
          },
        });

        if (existingAsset) {
          // Atualizar ativo existente
          await prisma.asset.update({
            where: {
              symbol: stock.stock,
            },
            data: {
              name: stock.name || stock.stock,
              type: type,
              currency: currency,
              source: 'brapi',
              updatedAt: new Date(),
            },
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
              source: 'brapi',
            },
          });
          inserted++;
        }
      } catch (error) {
        logger.error(`❌ Erro ao sincronizar ativo ${stock.stock}:`, error);
        errors++;
      }
    }

    logger.info(
      `✅ Ativos da B3 sincronizados: ${inserted} inseridos, ${updated} atualizados, ${errors} erros`,
    );
    return { inserted, updated, errors };
  } catch (error) {
    logger.error('❌ Erro geral ao sincronizar ativos da B3:', error);
    throw error;
  }
};

/**
 * Sincroniza criptoativos no banco de dados
 */
const syncCrypto = async (cryptos: BrapiCrypto[]): Promise<SyncResult> => {
  logger.info('💾 Sincronizando criptoativos no banco de dados...');

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  try {
    for (const crypto of cryptos) {
      if (!crypto.symbol) {
        logger.warn('⚠️  Cripto sem symbol, pulando:', crypto);
        errors++;
        continue;
      }

      try {
        // Verificar se o criptoativo já existe
        const existingCrypto = await prisma.asset.findUnique({
          where: {
            symbol: crypto.symbol,
          },
        });

        if (existingCrypto) {
          // Atualizar criptoativo existente
          await prisma.asset.update({
            where: {
              symbol: crypto.symbol,
            },
            data: {
              name: crypto.name || crypto.symbol,
              type: 'crypto',
              currency: crypto.currency || 'USD',
              source: 'brapi',
              updatedAt: new Date(),
            },
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
              source: 'brapi',
            },
          });
          inserted++;
        }
      } catch (error) {
        logger.error(`❌ Erro ao sincronizar cripto ${crypto.symbol}:`, error);
        errors++;
      }
    }

    logger.info(
      `✅ Criptoativos sincronizados: ${inserted} inseridos, ${updated} atualizados, ${errors} erros`,
    );
    return { inserted, updated, errors };
  } catch (error) {
    logger.error('❌ Erro geral ao sincronizar criptoativos:', error);
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
  logger.info('💰 Sincronizando preços dos ativos...');

  const startTime = Date.now();
  let totalInserted = 0;
  let totalUpdated = 0;
  let errors = 0;

  const excludedTypes = ['emergency', 'opportunity', 'personalizado', 'imovel'];
  const excludedPrefixes = [
    'RESERVA-EMERG',
    'RESERVA-OPORT',
    'PERSONALIZADO',
    'RENDA-FIXA',
    'CONTA-CORRENTE',
  ];

  const assets = await prisma.asset.findMany({
    where: {
      type: { notIn: excludedTypes },
      source: { not: 'manual' },
      AND: [
        { symbol: { not: { startsWith: 'RESERVA-' } } },
        { symbol: { not: { startsWith: 'RENDA-FIXA' } } },
        { symbol: { not: { startsWith: 'CONTA-CORRENTE' } } },
      ],
    },
    select: { id: true, symbol: true, currency: true, type: true },
  });

  const assetBySymbol = new Map(assets.map((a) => [a.symbol.toUpperCase(), a]));
  const cryptoAssets = assets.filter((a) => a.type === 'crypto');
  const currencyAssets = assets.filter((a) => a.type === 'currency');
  const nonCryptoCurrencyAssets = assets.filter(
    (a) => a.type !== 'crypto' && a.type !== 'currency',
  );

  if (assets.length === 0) {
    logger.info('   Nenhum ativo para sincronizar preços');
    return {
      totalInserted: 0,
      totalUpdated: 0,
      errors: 0,
      duration: (Date.now() - startTime) / 1000,
    };
  }

  const processResults = async (
    results: Array<{
      symbol: string;
      regularMarketPrice: number;
      regularMarketTime?: string;
      currency?: string;
      name?: string;
    }>,
  ) => {
    for (const r of results) {
      if (!r.symbol || r.regularMarketPrice == null || r.regularMarketPrice <= 0) continue;
      const symbolUpper = r.symbol.toUpperCase();
      const asset = assetBySymbol.get(symbolUpper);
      if (!asset) continue;
      const marketDate = parseMarketDate(r.regularMarketTime);
      const currency = r.currency || asset.currency;

      const refreshedName =
        r.name && r.name.trim().length > 0 && r.name.toUpperCase() !== symbolUpper
          ? r.name.trim()
          : null;
      const refreshedType = refreshedName
        ? classifyByName(refreshedName, r.symbol, asset.type)
        : null;

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
                date: new Date(
                  marketDate.getFullYear(),
                  marketDate.getMonth(),
                  marketDate.getDate(),
                ),
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
              ...(refreshedName ? { name: refreshedName } : {}),
              ...(refreshedType && refreshedType !== asset.type ? { type: refreshedType } : {}),
            },
          }),
        ]);
        if (existing) totalUpdated++;
        else totalInserted++;
      } catch (persistErr) {
        logger.warn(`   Erro ao persistir preço de ${r.symbol}:`, persistErr);
        errors++;
      }
    }
  };

  const BATCH_SIZE = 20;

  for (let i = 0; i < currencyAssets.length; i += BATCH_SIZE) {
    const batch = currencyAssets.slice(i, i + BATCH_SIZE);
    const symbols = batch.map((a) => a.symbol.toUpperCase());
    try {
      const currencyQuotes = await fetchCurrencyQuotes(symbols);
      const results: Array<{
        symbol: string;
        regularMarketPrice: number;
        regularMarketTime?: string;
        currency?: string;
      }> = [];
      for (const sym of symbols) {
        const price = currencyQuotes.get(sym);
        if (price != null && price > 0) {
          results.push({
            symbol: sym,
            regularMarketPrice: price,
            regularMarketTime: new Date().toISOString(),
            currency: 'BRL',
          });
        }
      }
      await processResults(results);
      if (i + BATCH_SIZE < currencyAssets.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    } catch (batchErr) {
      logger.error('   Erro no batch de moedas:', batchErr);
      errors += batch.length;
    }
  }

  for (let i = 0; i < cryptoAssets.length; i += BATCH_SIZE) {
    const batch = cryptoAssets.slice(i, i + BATCH_SIZE);
    const _symbols = batch.map((a) => a.symbol.toUpperCase());
    try {
      const syms = batch.map((a) => a.symbol);
      const cryptoQuotes = await fetchCryptoQuotes(syms, 'BRL');
      const results: Array<{
        symbol: string;
        regularMarketPrice: number;
        regularMarketTime?: string;
        currency?: string;
      }> = [];
      for (const sym of syms) {
        const price = cryptoQuotes.get(sym.toUpperCase());
        if (price != null && price > 0) {
          results.push({
            symbol: sym.toUpperCase(),
            regularMarketPrice: price,
            regularMarketTime: new Date().toISOString(),
            currency: 'BRL',
          });
        }
      }
      await processResults(results);
      if (i + BATCH_SIZE < cryptoAssets.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    } catch (batchErr) {
      logger.error(`   Erro no batch de cripto:`, batchErr);
      errors += batch.length;
    }
  }

  const nonCryptoSymbols = nonCryptoCurrencyAssets
    .map((a) => a.symbol.trim().toUpperCase())
    .filter(
      (s) =>
        !excludedPrefixes.some((p) => s.startsWith(p)) && !s.startsWith('-') && /^[A-Za-z]/.test(s),
    );

  for (let i = 0; i < nonCryptoSymbols.length; i += BATCH_SIZE) {
    const batch = nonCryptoSymbols.slice(i, i + BATCH_SIZE);
    try {
      const results = await fetchDetailedQuotes(batch);
      await processResults(
        results.map((r) => ({
          symbol: r.symbol,
          regularMarketPrice: r.regularMarketPrice,
          regularMarketTime: r.regularMarketTime,
          currency: r.currency,
          name: r.longName || r.shortName || undefined,
        })),
      );

      if (i + BATCH_SIZE < nonCryptoSymbols.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    } catch (batchErr) {
      logger.error(`   Erro no batch de preços:`, batchErr);
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

  logger.info(
    `   Preços: ${totalInserted} inseridos, ${totalUpdated} atualizados, ${errors} erros (${duration.toFixed(1)}s)`,
  );
  return { totalInserted, totalUpdated, errors, duration };
};

// ================== MAIN SYNC FUNCTION ==================

/**
 * Função principal que executa toda a sincronização de ativos
 */
export const syncAssets = async (): Promise<{
  stocks: SyncResult;
  crypto: SyncResult;
  moedas: SyncResult;
  prices: SyncPriceResult;
  total: SyncResult;
  duration: number;
}> => {
  logger.info('🚀 Iniciando sincronização de ativos com Brapi...\n');

  const startTime = Date.now();

  try {
    // Buscar dados das APIs em paralelo
    logger.info('📡 Buscando dados das APIs...');
    const [stocks, cryptos] = await Promise.all([fetchStocks(), fetchCrypto()]);

    logger.info('\n💾 Sincronizando dados no banco...');

    // Sincronizar moedas (lista fixa Brapi) + metadados em paralelo
    const [stocksResult, cryptoResult, moedasResult] = await Promise.all([
      syncStocks(stocks),
      syncCrypto(cryptos),
      syncMoedas(),
    ]);

    // Sincronizar preços (após metadados - inclui cotações de moedas)
    const pricesResult = await syncAssetPrices();

    // Calcular totais
    const total: SyncResult = {
      inserted: stocksResult.inserted + cryptoResult.inserted + moedasResult.inserted,
      updated: stocksResult.updated + cryptoResult.updated + moedasResult.updated,
      errors: stocksResult.errors + cryptoResult.errors + moedasResult.errors,
    };

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // Exibir resumo final
    logger.info('\n🎉 Sincronização concluída com sucesso!');
    logger.info('📊 RESUMO:');
    logger.info(
      `   • Ativos B3: ${stocksResult.inserted} inseridos, ${stocksResult.updated} atualizados, ${stocksResult.errors} erros`,
    );
    logger.info(
      `   • Criptoativos: ${cryptoResult.inserted} inseridos, ${cryptoResult.updated} atualizados, ${cryptoResult.errors} erros`,
    );
    logger.info(
      `   • Moedas: ${moedasResult.inserted} inseridas, ${moedasResult.updated} atualizadas, ${moedasResult.errors} erros`,
    );
    logger.info(
      `   • Preços: ${pricesResult.totalInserted} inseridos, ${pricesResult.totalUpdated} atualizados, ${pricesResult.errors} erros`,
    );
    logger.info(
      `   • Total: ${total.inserted} inseridos, ${total.updated} atualizados, ${total.errors} erros`,
    );
    logger.info(`   • Tempo total: ${duration.toFixed(2)}s`);

    return {
      stocks: stocksResult,
      crypto: cryptoResult,
      moedas: moedasResult,
      prices: pricesResult,
      total,
      duration,
    };
  } catch (error) {
    logger.error('\n💥 Erro durante a sincronização:', error);
    throw error;
  }
};

// ================== SCOPED SYNC FUNCTIONS ==================

/**
 * Syncs only the asset catalog (metadata) — no price fetching.
 * Fast enough for a single Vercel cron invocation (~10-20s).
 */
export const syncCatalog = async (): Promise<{
  stocks: SyncResult;
  crypto: SyncResult;
  moedas: SyncResult;
  total: SyncResult;
  duration: number;
}> => {
  const startTime = Date.now();
  const [stocks, cryptos] = await Promise.all([fetchStocks(), fetchCrypto()]);
  const [stocksResult, cryptoResult, moedasResult] = await Promise.all([
    syncStocks(stocks),
    syncCrypto(cryptos),
    syncMoedas(),
  ]);
  const total: SyncResult = {
    inserted: stocksResult.inserted + cryptoResult.inserted + moedasResult.inserted,
    updated: stocksResult.updated + cryptoResult.updated + moedasResult.updated,
    errors: stocksResult.errors + cryptoResult.errors + moedasResult.errors,
  };
  return {
    stocks: stocksResult,
    crypto: cryptoResult,
    moedas: moedasResult,
    total,
    duration: (Date.now() - startTime) / 1000,
  };
};

/**
 * Syncs prices for a specific asset scope ('stocks' | 'crypto-currencies').
 * Each scope runs in its own cron invocation to stay within Vercel timeout.
 */
export const syncPricesByScope = async (
  scope: 'stocks' | 'crypto-currencies',
): Promise<SyncPriceResult> => {
  logger.info(`💰 Sincronizando preços (${scope})...`);

  const startTime = Date.now();
  let totalInserted = 0;
  let totalUpdated = 0;
  let errors = 0;

  const excludedTypes = ['emergency', 'opportunity', 'personalizado', 'imovel'];
  const excludedPrefixes = [
    'RESERVA-EMERG',
    'RESERVA-OPORT',
    'PERSONALIZADO',
    'RENDA-FIXA',
    'CONTA-CORRENTE',
  ];

  const typeFilter =
    scope === 'stocks'
      ? { notIn: [...excludedTypes, 'crypto', 'currency'] }
      : { in: ['crypto', 'currency'] };

  // No scope 'stocks' filtramos por source='brapi' explicitamente: CVM funds (source='cvm')
  // e Tesouro Direto bonds (source='tesouro_gov') têm seus próprios sincronizadores
  // (cvmFundSync, tesouroDiretoSync) e seus símbolos não existem no BRAPI — mandar pra cá
  // só gera N batches de 20 retornando 404.
  const sourceFilter = scope === 'stocks' ? { equals: 'brapi' } : { not: 'manual' };

  const assets = await prisma.asset.findMany({
    where: {
      type: typeFilter,
      source: sourceFilter,
      AND: [
        { symbol: { not: { startsWith: 'RESERVA-' } } },
        { symbol: { not: { startsWith: 'RENDA-FIXA' } } },
        { symbol: { not: { startsWith: 'CONTA-CORRENTE' } } },
      ],
    },
    select: { id: true, symbol: true, currency: true, type: true },
  });

  if (assets.length === 0) {
    return {
      totalInserted: 0,
      totalUpdated: 0,
      errors: 0,
      duration: (Date.now() - startTime) / 1000,
    };
  }

  const assetBySymbol = new Map(assets.map((a) => [a.symbol.toUpperCase(), a]));

  const processResults = async (
    results: Array<{
      symbol: string;
      regularMarketPrice: number;
      regularMarketTime?: string;
      currency?: string;
      name?: string;
    }>,
  ) => {
    for (const r of results) {
      if (!r.symbol || r.regularMarketPrice == null || r.regularMarketPrice <= 0) continue;
      const symbolUpper = r.symbol.toUpperCase();
      const asset = assetBySymbol.get(symbolUpper);
      if (!asset) continue;
      const marketDate = parseMarketDate(r.regularMarketTime);
      const currency = r.currency || asset.currency;

      const refreshedName =
        r.name && r.name.trim().length > 0 && r.name.toUpperCase() !== symbolUpper
          ? r.name.trim()
          : null;
      const refreshedType = refreshedName
        ? classifyByName(refreshedName, r.symbol, asset.type)
        : null;

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
                date: new Date(
                  marketDate.getFullYear(),
                  marketDate.getMonth(),
                  marketDate.getDate(),
                ),
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
              ...(refreshedName ? { name: refreshedName } : {}),
              ...(refreshedType && refreshedType !== asset.type ? { type: refreshedType } : {}),
            },
          }),
        ]);
        if (existing) totalUpdated++;
        else totalInserted++;
      } catch (persistErr) {
        logger.warn(`   Erro ao persistir preço de ${r.symbol}:`, persistErr);
        errors++;
      }
    }
  };

  const BATCH_SIZE = 20;

  if (scope === 'crypto-currencies') {
    // Currencies
    const currencyAssets = assets.filter((a) => a.type === 'currency');
    for (let i = 0; i < currencyAssets.length; i += BATCH_SIZE) {
      const batch = currencyAssets.slice(i, i + BATCH_SIZE);
      const symbols = batch.map((a) => a.symbol.toUpperCase());
      try {
        const currencyQuotes = await fetchCurrencyQuotes(symbols);
        const results = symbols
          .filter((sym) => {
            const p = currencyQuotes.get(sym);
            return p != null && p > 0;
          })
          .map((sym) => ({
            symbol: sym,
            regularMarketPrice: currencyQuotes.get(sym)!,
            regularMarketTime: new Date().toISOString(),
            currency: 'BRL',
          }));
        await processResults(results);
        if (i + BATCH_SIZE < currencyAssets.length)
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      } catch (batchErr) {
        logger.error('   Erro no batch de moedas:', batchErr);
        errors += batch.length;
      }
    }
    // Crypto
    const cryptoAssets = assets.filter((a) => a.type === 'crypto');
    for (let i = 0; i < cryptoAssets.length; i += BATCH_SIZE) {
      const batch = cryptoAssets.slice(i, i + BATCH_SIZE);
      const syms = batch.map((a) => a.symbol);
      try {
        const cryptoQuotes = await fetchCryptoQuotes(syms, 'BRL');
        const results = syms
          .filter((sym) => {
            const p = cryptoQuotes.get(sym.toUpperCase());
            return p != null && p > 0;
          })
          .map((sym) => ({
            symbol: sym.toUpperCase(),
            regularMarketPrice: cryptoQuotes.get(sym.toUpperCase())!,
            regularMarketTime: new Date().toISOString(),
            currency: 'BRL',
          }));
        await processResults(results);
        if (i + BATCH_SIZE < cryptoAssets.length)
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      } catch (batchErr) {
        logger.error('   Erro no batch de cripto:', batchErr);
        errors += batch.length;
      }
    }
  } else {
    // Stocks (non-crypto, non-currency)
    const symbols = assets
      .map((a) => a.symbol.trim().toUpperCase())
      .filter(
        (s) =>
          !excludedPrefixes.some((p) => s.startsWith(p)) &&
          !s.startsWith('-') &&
          /^[A-Za-z]/.test(s),
      );
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      try {
        const results = await fetchDetailedQuotes(batch);
        await processResults(
          results.map((r) => ({
            symbol: r.symbol,
            regularMarketPrice: r.regularMarketPrice,
            regularMarketTime: r.regularMarketTime,
            currency: r.currency,
            name: r.longName || r.shortName || undefined,
          })),
        );
        if (i + BATCH_SIZE < symbols.length)
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      } catch (batchErr) {
        logger.error('   Erro no batch de preços:', batchErr);
        errors += batch.length;
      }
    }
  }

  const duration = (Date.now() - startTime) / 1000;

  await prisma.syncPriceLog.create({
    data: { totalInserted, totalUpdated, errors, duration: Math.round(duration) },
  });

  logger.info(
    `   Preços (${scope}): ${totalInserted} ins, ${totalUpdated} upd, ${errors} err (${duration.toFixed(1)}s)`,
  );
  return { totalInserted, totalUpdated, errors, duration };
};

// ================== UTILITY FUNCTIONS ==================

/**
 * Verifica se a sincronização está funcionando
 */
export const testSync = async (): Promise<boolean> => {
  try {
    logger.info('🧪 Testando sincronização...');

    // Testar busca de ativos
    const stocks = await fetchStocks();
    if (!stocks || stocks.length === 0) {
      throw new Error('Nenhum ativo retornado pela API');
    }

    // Testar busca de criptos (opcional)
    const cryptos = await fetchCrypto();
    logger.info(`📊 Criptoativos encontrados: ${cryptos.length}`);

    logger.info('✅ Teste de sincronização passou!');
    return true;
  } catch (error) {
    logger.error('❌ Teste de sincronização falhou:', error);
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
        id: true,
      },
    });

    const total = await prisma.asset.count();

    return {
      byType: stats,
      total,
    };
  } catch (error) {
    logger.error('❌ Erro ao obter estatísticas:', error);
    throw error;
  }
};
