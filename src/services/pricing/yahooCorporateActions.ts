/**
 * Eventos corporativos (splits/grupamentos) via Yahoo Finance.
 *
 * Motivação: a BRAPI só entrega splits no módulo pago `splitHistory` (fora do
 * nosso plano) — o que usamos (`dividendsData.stockDividends`) traz só
 * bonificações/subscrições. Resultado: desdobramentos de FIIs como HFOF11
 * (10:1 em 2025) nunca chegavam ao banco e a posição do usuário não era
 * ajustada. O Yahoo expõe os mesmos splits de graça via `events=split`.
 *
 * Grava em `AssetCorporateAction` (source = "YAHOO"), com a mesma semântica de
 * `factor` que o resto do app: 10.0 = desdobramento 10:1, 0.5 = grupamento 1:2.
 * O cálculo da carteira (replayPosition) já aplica esse factor.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { APPLICABLE_CORPORATE_ACTION_TYPES } from '@/services/portfolio/corporateActions';

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
// UA minimalista — o anti-bot do Yahoo rejeita UAs completos (ver yahooFinanceSync).
const USER_AGENT = 'Mozilla/5.0';
const REQUEST_TIMEOUT_MS = 30_000;

export const YAHOO_CA_SOURCE = 'YAHOO';

export interface YahooSplit {
  /** Data ex do evento, normalizada para 00:00:00.000 UTC. */
  date: Date;
  /** "DESDOBRAMENTO" (factor > 1) ou "GRUPAMENTO" (factor < 1). */
  type: 'DESDOBRAMENTO' | 'GRUPAMENTO';
  /** Multiplicativo: 10:1 → 10; 1:2 → 0.5. */
  factor: number;
  /** Legível, ex.: "10:1". */
  completeFactor: string;
}

interface YahooSplitRaw {
  date?: number;
  numerator?: number;
  denominator?: number;
  splitRatio?: string;
}

interface YahooChartSplitResponse {
  chart?: {
    result?: Array<{ events?: { splits?: Record<string, YahooSplitRaw> } }> | null;
    error?: { code?: string; description?: string } | null;
  };
}

/** Ticker do Yahoo para um símbolo B3 (ação/FII/ETF/etc.): adiciona `.SA`. */
function toYahooTicker(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  return s.endsWith('.SA') ? s : `${s}.SA`;
}

/** Símbolo como gravamos em Asset/AssetCorporateAction: sem o sufixo `.SA`. */
function toDbSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.SA$/, '');
}

function normalizeUtcDay(tsSeconds: number): Date {
  const d = new Date(tsSeconds * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Busca splits/grupamentos de um símbolo B3 no Yahoo. Não persiste.
 * Retorna [] se não houver eventos (a maioria dos ativos).
 */
export async function fetchYahooSplits(symbol: string, years = 25): Promise<YahooSplit[]> {
  const ticker = toYahooTicker(symbol);
  const nowSec = Math.floor(Date.now() / 1000);
  const period1 = nowSec - Math.ceil(years * 365.25 * 24 * 60 * 60);
  const qs = `?period1=${period1}&period2=${nowSec}&interval=1d&events=split`;

  let data: YahooChartSplitResponse | null = null;
  let lastErr: unknown = null;
  for (const host of YAHOO_HOSTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}${qs}`,
        {
          headers: { 'User-Agent': USER_AGENT },
          signal: controller.signal,
        },
      );
      // 404 = ticker inexistente no Yahoo (não é falha transiente): trata como
      // "sem eventos", igual ao chart.error do JSON. Evita FETCH_FAIL eterno.
      if (res.status === 404) return [];
      if (!res.ok) {
        lastErr = new Error(`Yahoo HTTP ${res.status} via ${host} para ${ticker}`);
        continue;
      }
      data = (await res.json()) as YahooChartSplitResponse;
      break;
    } catch (err) {
      lastErr = err;
      continue;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  if (!data) throw lastErr instanceof Error ? lastErr : new Error(`Yahoo falhou para ${ticker}`);
  if (data.chart?.error) {
    // ticker inexistente no Yahoo não é erro fatal — só não tem evento pra esse símbolo.
    return [];
  }

  const splitsObj = data.chart?.result?.[0]?.events?.splits ?? {};
  const out: YahooSplit[] = [];
  for (const raw of Object.values(splitsObj)) {
    const num = Number(raw.numerator);
    const den = Number(raw.denominator);
    const ts = Number(raw.date);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0 || num <= 0) continue;
    if (!Number.isFinite(ts) || ts <= 0) continue;
    const factor = num / den;
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) continue;
    out.push({
      date: normalizeUtcDay(ts),
      type: factor > 1 ? 'DESDOBRAMENTO' : 'GRUPAMENTO',
      factor,
      completeFactor: raw.splitRatio || `${num}:${den}`,
    });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Persiste splits do Yahoo em AssetCorporateAction (idempotente via
 * unique [symbol, date, type]). Retorna quantos eventos foram gravados.
 */
export async function persistYahooSplits(symbol: string, splits: YahooSplit[]): Promise<number> {
  const dbSymbol = toDbSymbol(symbol);
  let n = 0;
  for (const s of splits) {
    try {
      await prisma.assetCorporateAction.upsert({
        where: { symbol_date_type: { symbol: dbSymbol, date: s.date, type: s.type } },
        update: { factor: s.factor, completeFactor: s.completeFactor },
        create: {
          symbol: dbSymbol,
          date: s.date,
          type: s.type,
          factor: s.factor,
          completeFactor: s.completeFactor,
          source: YAHOO_CA_SOURCE,
        },
      });
      n++;
    } catch (err) {
      logger.warn(`[yahoo-ca] falha ao gravar split de ${dbSymbol}:`, err);
    }
  }
  return n;
}

/**
 * Busca + persiste os splits de um símbolo. Best-effort: nunca lança
 * (eventos corporativos não devem derrubar o fluxo de cadastro/recálculo).
 */
export async function syncYahooSplits(symbol: string): Promise<number> {
  try {
    const splits = await fetchYahooSplits(symbol);
    if (splits.length === 0) return 0;
    return await persistYahooSplits(symbol, splits);
  } catch (err) {
    logger.warn(`[yahoo-ca] sync de ${symbol} falhou (não-fatal):`, err);
    return 0;
  }
}

// ===================== DIVIDENDOS =====================

interface YahooDivRaw {
  date?: number;
  amount?: number;
}

export interface YahooDividend {
  /** Data de pagamento, normalizada para 00:00 UTC. */
  date: Date;
  /** Valor por cota — Yahoo entrega SPLIT-ADJUSTED (escala pós-split). */
  amount: number;
}

/**
 * Busca dividendos de um símbolo B3 no Yahoo (`events=div`). Não persiste.
 * ATENÇÃO: os valores vêm split-ADJUSTED (ex.: HFOF11 0,06/cota mesmo pré-split).
 */
export async function fetchYahooDividends(symbol: string, years = 25): Promise<YahooDividend[]> {
  const ticker = toYahooTicker(symbol);
  const nowSec = Math.floor(Date.now() / 1000);
  const period1 = nowSec - Math.ceil(years * 365.25 * 24 * 60 * 60);
  const qs = `?period1=${period1}&period2=${nowSec}&interval=1d&events=div`;

  let data: {
    chart?: {
      result?: Array<{ events?: { dividends?: Record<string, YahooDivRaw> } }> | null;
      error?: unknown;
    };
  } | null = null;
  let lastErr: unknown = null;
  for (const host of YAHOO_HOSTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}${qs}`,
        {
          headers: { 'User-Agent': USER_AGENT },
          signal: controller.signal,
        },
      );
      // 404 = ticker inexistente no Yahoo: trata como "sem dividendos".
      if (res.status === 404) return [];
      if (!res.ok) {
        lastErr = new Error(`Yahoo HTTP ${res.status} via ${host} para ${ticker}`);
        continue;
      }
      data = await res.json();
      break;
    } catch (err) {
      lastErr = err;
      continue;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  if (!data) throw lastErr instanceof Error ? lastErr : new Error(`Yahoo falhou para ${ticker}`);
  if (data.chart?.error) return [];

  const divsObj = data.chart?.result?.[0]?.events?.dividends ?? {};
  const out: YahooDividend[] = [];
  for (const raw of Object.values(divsObj)) {
    const amount = Number(raw.amount);
    const ts = Number(raw.date);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(ts) || ts <= 0) continue;
    out.push({ date: normalizeUtcDay(ts), amount });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Preenche o GAP de dividendos de um símbolo usando o Yahoo, des-ajustando os
 * valores split-adjusted de volta pra CRU (× fator dos eventos após a data),
 * pra casar com a convenção da BRAPI (valor/cota cru no momento) + cálculo por
 * quantidade real. Só insere datas ANTERIORES ao dividendo mais antigo já no
 * banco (não toca no que a BRAPI tem). Best-effort. Retorna nº de inseridos.
 */
export async function syncYahooDividends(symbol: string): Promise<number> {
  try {
    const divs = await fetchYahooDividends(symbol);
    if (divs.length === 0) return 0;
    const dbSymbol = toDbSymbol(symbol);

    // Idempotente: limpa os próprios registros YAHOO antes de re-preencher
    // (nunca toca em BRAPI/manual). Evita acúmulo em re-execuções.
    await prisma.assetDividendHistory.deleteMany({
      where: { symbol: dbSymbol, source: YAHOO_CA_SOURCE },
    });

    // Cutoff por MÊS (não data exata): Yahoo (ex-date) e BRAPI (pagamento) trazem
    // o MESMO provento em datas levemente diferentes dentro do mês → cutoff por
    // dia deixaria duplicar no mês de borda. Só preenche meses ANTERIORES ao
    // dividendo mais antigo que NÃO é YAHOO (BRAPI/manual).
    const earliest = await prisma.assetDividendHistory.findFirst({
      where: { symbol: dbSymbol },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    const cutoff = earliest
      ? Date.UTC(earliest.date.getUTCFullYear(), earliest.date.getUTCMonth(), 1)
      : Infinity;

    const cas = await prisma.assetCorporateAction.findMany({
      where: { symbol: dbSymbol, type: { in: Array.from(APPLICABLE_CORPORATE_ACTION_TYPES) } },
      select: { date: true, factor: true },
    });
    const cumFactorAfter = (dMs: number): number =>
      cas.reduce(
        (f, c) =>
          c.date.getTime() > dMs && Number.isFinite(c.factor) && c.factor > 0 ? f * c.factor : f,
        1,
      );

    let n = 0;
    for (const div of divs) {
      const dMs = div.date.getTime();
      if (dMs >= cutoff) continue; // só preenche o gap anterior ao que já existe
      const raw = div.amount * cumFactorAfter(dMs); // des-ajusta pra cru
      if (!(raw > 0)) continue;
      try {
        await prisma.assetDividendHistory.upsert({
          where: { symbol_date_tipo: { symbol: dbSymbol, date: div.date, tipo: 'Dividendo' } },
          update: {},
          create: {
            symbol: dbSymbol,
            date: div.date,
            tipo: 'Dividendo',
            valorUnitario: raw,
            source: YAHOO_CA_SOURCE,
          },
        });
        n++;
      } catch (err) {
        logger.warn(`[yahoo-div] falha ao gravar dividendo de ${dbSymbol}:`, err);
      }
    }
    return n;
  } catch (err) {
    logger.warn(`[yahoo-div] sync de ${symbol} falhou (não-fatal):`, err);
    return 0;
  }
}
