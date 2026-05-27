/**
 * Serviço de proventos/dividendos e ações corporativas (split/inplit/bonificação).
 * Regra: banco primeiro, fallback BRAPI apenas quando necessário, persistir no banco.
 */

import { prisma } from '@/lib/prisma';

const BLOCKED_SYMBOL_PREFIXES = [
  'RESERVA-EMERG',
  'RESERVA-OPORT',
  'PERSONALIZADO',
  'RENDA-FIXA',
  'CONTA-CORRENTE',
];

const isBlockedSymbol = (symbol: string) =>
  BLOCKED_SYMBOL_PREFIXES.some((p) => symbol.toUpperCase().startsWith(p));

const getBrapiSymbolsToTry = (symbol: string): string[] => {
  const s = symbol.trim().toUpperCase();
  const isB3Stock = /^[A-Z0-9]{4,6}(3|4|11|34)$/.test(s) && !s.startsWith('^');
  if (isB3Stock && !s.endsWith('.SA')) {
    return [s, `${s}.SA`];
  }
  return [s];
};

const getDbSymbolVariants = (symbol: string): string[] => {
  const s = symbol.trim().toUpperCase();
  return [...new Set([s, ...getBrapiSymbolsToTry(symbol).map((x) => x.toUpperCase())])];
};

// Bug F1.2: BRAPI ocasionalmente devolve `paymentDate: 0` ou `"0"` em payloads
// de dividendos para ativos com calendário corporativo incompleto. Sem guarda,
// `parseDateValue(0)` retornava `new Date(0)` (epoch UTC = 1970-01-01) — esse
// valor era persistido em `AssetDividend.date` e depois ressurgia como barra
// "Jan 1970" no gráfico de proventos. Threshold conservador alinhado com o
// frontend: tudo antes de 1990-01-01 é descartado como ruído.
const MIN_VALID_DIVIDEND_DATE_MS = Date.UTC(1990, 0, 1);

const parseDateValue = (raw: unknown): Date | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  const numericDate = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(numericDate)) {
    // Rejeita 0/negativo antes do `new Date()` — caso clássico do bug F1.2.
    if (numericDate <= 0) return null;
    const timestamp = numericDate < 1e12 ? numericDate * 1000 : numericDate;
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() >= MIN_VALID_DIVIDEND_DATE_MS) {
      return parsed;
    }
    return null;
  }
  if (typeof raw !== 'string') return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() < MIN_VALID_DIVIDEND_DATE_MS) return null;
  return parsed;
};

const extractPaymentDate = (dividend: Record<string, unknown>): Date | null => {
  return (
    parseDateValue(dividend.paymentDate) ??
    parseDateValue(dividend.payDate) ??
    parseDateValue(dividend.date) ??
    parseDateValue(dividend.exDate) ??
    parseDateValue(dividend.exDividendDate) ??
    parseDateValue(dividend.recordDate)
  );
};

const extractExDate = (dividend: Record<string, unknown>): Date | null => {
  return (
    parseDateValue(dividend.exDate) ??
    parseDateValue(dividend.exDividendDate) ??
    parseDateValue(dividend.recordDate) ??
    parseDateValue(dividend.lastDatePrior)
  );
};

const parseNumericValue = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractDividendAmount = (dividend: Record<string, unknown>): number | null => {
  const amount =
    (dividend.cashAmount as unknown) ??
    (dividend.amount as unknown) ??
    (dividend.value as unknown) ??
    (dividend.dividend as unknown) ??
    (dividend.rate as unknown) ??
    (dividend.dividendValue as unknown);
  return parseNumericValue(amount);
};

const extractDividendType = (dividend: Record<string, unknown>): string => {
  return (
    (dividend.type as string) ??
    (dividend.kind as string) ??
    (dividend.label as string) ??
    (dividend.dividendType as string) ??
    'Dividendo'
  );
};

const normalizeDividendContainer = (container: unknown): Array<Record<string, unknown>> => {
  if (!container || typeof container !== 'object') return [];
  if (Array.isArray(container)) return container as Array<Record<string, unknown>>;
  const obj = container as Record<string, unknown>;
  const possibleArrays = [
    obj.dividends,
    obj.dividendsData,
    obj.dividendsHistory,
    obj.cashDividends,
    obj.events,
  ].filter(Array.isArray) as Array<Record<string, unknown>[]>;
  return possibleArrays.flat();
};

/** BRAPI pode enviar `dividends: []` (truthy) e os dados reais em `dividendsData.cashDividends`. */
const flattenBrapiResultDividends = (
  result: Record<string, unknown>,
): Array<Record<string, unknown>> => {
  const chunks: unknown[] = [
    result.dividends,
    result.dividendsHistory,
    result.cashDividends,
    result.events,
    result.dividendsData,
  ];
  const merged: Array<Record<string, unknown>> = [];
  for (const chunk of chunks) {
    merged.push(...normalizeDividendContainer(chunk));
  }
  return merged;
};

/**
 * Extract stockDividends (splits/inplits/bonuses) from BRAPI result.
 * These live in `result.dividendsData.stockDividends`.
 */
const extractStockDividends = (result: Record<string, unknown>): Array<Record<string, unknown>> => {
  const dividendsData = result.dividendsData as Record<string, unknown> | undefined;
  if (!dividendsData || typeof dividendsData !== 'object') return [];
  const stockDividends = dividendsData.stockDividends;
  if (!Array.isArray(stockDividends)) return [];
  return stockDividends as Array<Record<string, unknown>>;
};

// ================== TYPES ==================

export interface DividendEntry {
  /** Data de pagamento do provento. */
  date: Date;
  /** Data-com (ex-dividend date). Define a elegibilidade do investidor. */
  dataCom: Date | null;
  /** Tipo do provento (label da BRAPI: "Dividendo", "JCP", "JUROS SOBRE CAPITAL PROPRIO", "Rendimento" etc.). */
  tipo: string;
  /** Valor bruto por cota/ação (R$). Como a BRAPI retorna. */
  valorUnitario: number;
  /**
   * Valor líquido por cota/ação após IRRF (R$). Para JCP é `valorUnitario × 0.85`
   * (15% retido na fonte — convenção brasileira). Para dividendos comuns e
   * rendimentos de FII (isentos), iguala `valorUnitario`. Usado pelos KPIs e
   * totais exibidos ao usuário (equivale ao `equity` do Kinvo statement).
   *
   * Opcional para compatibilidade com mocks/seeds legados — consumidores devem
   * usar `valorUnitarioLiquido ?? valorUnitario`. Construtores em produção
   * (DB read + BRAPI fetch) sempre preenchem.
   */
  valorUnitarioLiquido?: number;
}

/**
 * Bug #01 (relatório Maio/2026, 2º passe): identifica entries de JCP a partir
 * do label retornado pela BRAPI. Variações observadas: "JCP", "JURO SOBRE
 * CAPITAL", "JUROS SOBRE CAPITAL PROPRIO" (com/sem acentuação), "JRC", "JSCP".
 * Não considera "rendimentos" (FII) — esses são isentos.
 */
export const isJcpType = (tipo: string | null | undefined): boolean => {
  if (!tipo) return false;
  const upper = tipo.toUpperCase();
  return (
    upper.includes('JCP') ||
    upper.includes('JSCP') ||
    upper.includes('JRC') ||
    upper.includes('JURO SOBRE CAPITAL') ||
    upper.includes('JUROS SOBRE CAPITAL') ||
    upper.includes('JUROS S/ CAPITAL')
  );
};

/**
 * Marco temporal da Lei Complementar 224/2025 (publicada 26/12/2025):
 * a partir de 01/01/2026 a alíquota de IRRF sobre JCP foi elevada de 15% para 17,5%.
 */
const JCP_IRRF_LC224_EFFECTIVE_DATE = Date.UTC(2026, 0, 1);

/**
 * Alíquota de IRRF sobre JCP em função da data de pagamento (fato gerador):
 * - Até 31/12/2025: 15% (Lei 9.249/95, art. 9º §2º)
 * - A partir de 01/01/2026: 17,5% (LC 224/2025)
 */
export const getJcpIrrfRate = (paymentDate: Date): number =>
  paymentDate.getTime() >= JCP_IRRF_LC224_EFFECTIVE_DATE ? 0.175 : 0.15;

const computeValorUnitarioLiquido = (
  tipo: string,
  valorUnitarioBruto: number,
  paymentDate: Date,
): number =>
  isJcpType(tipo) ? valorUnitarioBruto * (1 - getJcpIrrfRate(paymentDate)) : valorUnitarioBruto;

export interface CorporateActionEntry {
  date: Date;
  type: string; // "DESDOBRAMENTO" | "GRUPAMENTO" | "BONIFICACAO"
  factor: number;
  completeFactor: string | null;
  isinCode: string | null;
}

// ================== DIVIDEND FUNCTIONS ==================

/**
 * Busca dividendos do banco para um símbolo.
 */
const getDividendsFromDb = async (symbol: string): Promise<DividendEntry[]> => {
  const variants = getDbSymbolVariants(symbol);
  const rows = await prisma.assetDividendHistory.findMany({
    where: { symbol: { in: variants } },
    orderBy: { date: 'asc' },
    select: { date: true, dataCom: true, tipo: true, valorUnitario: true },
  });
  const byKey = new Map<string, DividendEntry>();
  for (const r of rows) {
    const key = `${r.date.getTime()}\0${r.tipo}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        date: r.date,
        dataCom: r.dataCom ?? null,
        tipo: r.tipo,
        valorUnitario: r.valorUnitario,
        valorUnitarioLiquido: computeValorUnitarioLiquido(r.tipo, r.valorUnitario, r.date),
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
};

/**
 * Busca dividendos na BRAPI e persiste no banco.
 * Also extracts and persists corporate actions (splits/inplits/bonuses) from the same response.
 */
const fetchAndPersistDividendsFromBrapi = async (symbol: string): Promise<DividendEntry[]> => {
  const apiKey = process.env.BRAPI_API_KEY;
  const tokenParam = apiKey ? `&token=${apiKey}` : '';
  const symbolsToTry = getBrapiSymbolsToTry(symbol);

  for (const currentSymbol of symbolsToTry) {
    const url = `https://brapi.dev/api/quote/${encodeURIComponent(currentSymbol)}?dividends=true${tokenParam}`;
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) continue;

    const data = await response.json();
    const results = data?.results;
    if (!Array.isArray(results) || results.length === 0) continue;

    const result = (results[0] || {}) as Record<string, unknown>;
    const normalized = flattenBrapiResultDividends(result);

    const dbSymbol = symbol.trim().toUpperCase();
    const entries: DividendEntry[] = [];

    // UTC-safe: getters locais geram offset diferente entre TZ do servidor
    // (BRT vs UTC), causando entries com timestamps inconsistentes. UTC garante T00:00Z.
    const toUtcMidnight = (d: Date): Date =>
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

    // Dedup BRAPI: a API às vezes retorna múltiplas entries com mesmo
    // (paymentDate, tipo) e rates diferentes (caso BBAS3 JCP 12/06/2025).
    // Política: SOMAR — interpreta como múltiplas distribuições no mesmo dia.
    // Preserva primeira exDate não-nula encontrada (idealmente iguais entre dups).
    type Aggregated = { date: Date; tipo: string; valorUnitario: number; exDate: Date | null };
    const aggregated = new Map<string, Aggregated>();
    for (const d of normalized) {
      const date = extractPaymentDate(d);
      const valorUnitario = extractDividendAmount(d);
      if (!date || !valorUnitario || valorUnitario <= 0) continue;

      const tipo = extractDividendType(d);
      const dateNorm = toUtcMidnight(date);
      const key = `${dateNorm.getTime()}\0${tipo}`;
      const existing = aggregated.get(key);
      if (existing) {
        existing.valorUnitario += valorUnitario;
        existing.exDate = existing.exDate ?? extractExDate(d);
      } else {
        aggregated.set(key, {
          date: dateNorm,
          tipo,
          valorUnitario,
          exDate: extractExDate(d),
        });
      }
    }

    for (const agg of aggregated.values()) {
      entries.push({
        date: agg.date,
        dataCom: agg.exDate,
        tipo: agg.tipo,
        valorUnitario: agg.valorUnitario,
        valorUnitarioLiquido: computeValorUnitarioLiquido(agg.tipo, agg.valorUnitario, agg.date),
      });

      const dataComNorm = agg.exDate ? toUtcMidnight(agg.exDate) : null;
      await prisma.assetDividendHistory.upsert({
        where: {
          symbol_date_tipo: {
            symbol: dbSymbol,
            date: agg.date,
            tipo: agg.tipo,
          },
        },
        update: { valorUnitario: agg.valorUnitario, dataCom: dataComNorm },
        create: {
          symbol: dbSymbol,
          date: agg.date,
          dataCom: dataComNorm,
          tipo: agg.tipo,
          valorUnitario: agg.valorUnitario,
          source: 'BRAPI',
        },
      });
    }

    // Persist corporate actions (splits/inplits/bonuses) from same response
    const stockDividends = extractStockDividends(result);
    for (const sd of stockDividends) {
      const type = (sd.label as string) || '';
      const factor = Number(sd.factor);
      if (!type || !Number.isFinite(factor) || factor <= 0) continue;

      const rawDate = (sd.lastDatePrior as string) || (sd.approvedOn as string);
      if (!rawDate) continue;
      const parsed = new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) continue;

      // Date.UTC garante o mesmo timestamp independente do fuso do servidor.
      // Antes usávamos new Date(year, month, day) que persiste local midnight —
      // no Vercel (UTC) virava T00:00Z, em dev local (BRT) virava T03:00Z, e a
      // unique constraint [symbol, date, type] não pegava as duplicatas porque
      // os timestamps diferiam por 3 horas.
      const dateNorm = new Date(
        Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
      );

      try {
        await prisma.assetCorporateAction.upsert({
          where: {
            symbol_date_type: {
              symbol: dbSymbol,
              date: dateNorm,
              type,
            },
          },
          update: { factor, completeFactor: (sd.completeFactor as string) || null },
          create: {
            symbol: dbSymbol,
            date: dateNorm,
            type,
            factor,
            completeFactor: (sd.completeFactor as string) || null,
            isinCode: (sd.isinCode as string) || null,
            source: 'BRAPI',
          },
        });
      } catch {
        // Silently continue — corporate actions are best-effort
      }
    }

    if (entries.length > 0 || stockDividends.length > 0) return entries;
  }
  return [];
};

/**
 * Busca dividendos: banco primeiro, fallback BRAPI com persistência.
 */
export const getDividends = async (
  symbol: string,
  options?: { useBrapiFallback?: boolean },
): Promise<DividendEntry[]> => {
  if (!symbol?.trim()) return [];
  if (isBlockedSymbol(symbol)) return [];

  const useFallback = options?.useBrapiFallback !== false;

  const fromDb = await getDividendsFromDb(symbol);
  if (fromDb.length > 0) return fromDb;

  if (useFallback) {
    return fetchAndPersistDividendsFromBrapi(symbol);
  }
  return [];
};

// ================== CORPORATE ACTION FUNCTIONS ==================

/**
 * Busca ações corporativas (splits/inplits/bonificações) do banco.
 */
const getCorporateActionsFromDb = async (symbol: string): Promise<CorporateActionEntry[]> => {
  const variants = getDbSymbolVariants(symbol);
  const rows = await prisma.assetCorporateAction.findMany({
    where: { symbol: { in: variants } },
    orderBy: { date: 'asc' },
    select: { date: true, type: true, factor: true, completeFactor: true, isinCode: true },
  });
  return rows.map((r) => ({
    date: r.date,
    type: r.type,
    factor: r.factor,
    completeFactor: r.completeFactor,
    isinCode: r.isinCode,
  }));
};

/**
 * Busca ações corporativas: banco primeiro, fallback BRAPI (via getDividends que persiste ambos).
 */
export const getCorporateActions = async (
  symbol: string,
  options?: { useBrapiFallback?: boolean },
): Promise<CorporateActionEntry[]> => {
  if (!symbol?.trim()) return [];
  if (isBlockedSymbol(symbol)) return [];

  const fromDb = await getCorporateActionsFromDb(symbol);
  if (fromDb.length > 0) return fromDb;

  // Trigger BRAPI fetch (which persists both dividends AND corporate actions)
  if (options?.useBrapiFallback !== false) {
    await fetchAndPersistDividendsFromBrapi(symbol);
    return getCorporateActionsFromDb(symbol);
  }
  return [];
};
