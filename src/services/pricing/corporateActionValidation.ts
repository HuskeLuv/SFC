/**
 * Validação de eventos corporativos contra o PREÇO real (anti-evento-espúrio).
 *
 * Os feeds (BRAPI `stockDividends` + Yahoo `events=split`) contêm splits/grupamentos
 * FALSOS pra FIIs (ex.: HFOF11/ZAVI11/CARE11 alegam 10:1 ou 1:5 que nunca
 * aconteceram). Aplicar o fator inflava/deflacionava a posição do usuário em até
 * 10× — bug grave. Um split/grupamento REAL provoca um salto de ~fator no preço
 * CRU na data ex; um evento falso deixa o preço contínuo.
 *
 * Esta validação compara a mediana do preço (AssetPriceHistory — COTAHIST cru +
 * BRAPI, que sem split real fica cru/contínuo) ANTES vs DEPOIS do evento:
 *   - ratio ≈ 1/fator → REAL (o preço saltou como esperado)
 *   - ratio ≈ 1       → ESPÚRIO (preço contínuo apesar de fator grande)
 *   - sem dado / ambíguo → UNKNOWN (preserva — conservador)
 *
 * Só classifica fatores GRANDES o bastante pra separar real de falso sem
 * ambiguidade (fora de [0.85, 1.18]); bonificações pequenas (1–18%) ficam
 * UNKNOWN — impacto baixo e indistinguíveis do ruído de preço.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { APPLICABLE_CORPORATE_ACTION_TYPES } from '@/services/portfolio/corporateActions';

const DAY = 86_400_000;
const WINDOW_DAYS = 25;
const GAP_DAYS = 3; // ignora os dias colados na data ex (alinhamento impreciso)
const REAL_TOL = 0.3; // ratio dentro de 30% de 1/fator → real
const FLAT_TOL = 0.2; // ratio dentro de 20% de 1 → espúrio

export type CaVerdict = 'real' | 'spurious' | 'unknown';

const median = (a: number[]): number | null => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

/** Fatores pequenos (próximos de 1) não dão pra validar pelo preço. */
const isDetectableFactor = (factor: number): boolean => factor <= 0.85 || factor >= 1.18;

/**
 * Classifica um evento corporativo confrontando o salto de preço esperado com o
 * preço real observado. Best-effort: erro → 'unknown'.
 */
export const classifyCorporateActionViaPrice = async (
  symbol: string,
  eventDate: Date,
  factor: number,
): Promise<CaVerdict> => {
  if (!Number.isFinite(factor) || factor <= 0 || !isDetectableFactor(factor)) return 'unknown';
  try {
    const ev = eventDate.getTime();
    const rows = await prisma.assetPriceHistory.findMany({
      where: {
        symbol,
        date: { gte: new Date(ev - WINDOW_DAYS * DAY), lte: new Date(ev + WINDOW_DAYS * DAY) },
      },
      select: { date: true, price: true },
      orderBy: { date: 'asc' },
    });
    const pre = median(
      rows.filter((r) => r.date.getTime() < ev - GAP_DAYS * DAY).map((r) => Number(r.price)),
    );
    const post = median(
      rows.filter((r) => r.date.getTime() > ev + GAP_DAYS * DAY).map((r) => Number(r.price)),
    );
    if (pre == null || post == null || pre <= 0) return 'unknown';

    const ratio = post / pre;
    const expected = 1 / factor;
    if (Math.abs(ratio - expected) / expected < REAL_TOL) return 'real';
    if (Math.abs(ratio - 1) < FLAT_TOL) return 'spurious';
    return 'unknown';
  } catch (err) {
    logger.warn(`[ca-validate] falha em ${symbol} ${eventDate.toISOString()} (não-fatal):`, err);
    return 'unknown';
  }
};

export interface SpuriousCa {
  id: string;
  symbol: string;
  date: Date;
  type: string;
  factor: number;
}

/**
 * Valida os eventos de UM símbolo e remove os espúrios. Usado no pipeline de
 * backfill/refresh (depois do sync + dedup) pra impedir que o feed re-adicione
 * splits falsos. Retorna quantos foram removidos. Best-effort.
 */
export const removeSpuriousForSymbol = async (symbol: string): Promise<number> => {
  try {
    const cas = await prisma.assetCorporateAction.findMany({
      where: { symbol, type: { in: Array.from(APPLICABLE_CORPORATE_ACTION_TYPES) } },
      select: { id: true, date: true, factor: true },
    });
    const dropIds: string[] = [];
    for (const ca of cas) {
      if (!isDetectableFactor(ca.factor)) continue;
      if ((await classifyCorporateActionViaPrice(symbol, ca.date, ca.factor)) === 'spurious') {
        dropIds.push(ca.id);
      }
    }
    if (dropIds.length > 0) {
      await prisma.assetCorporateAction.deleteMany({ where: { id: { in: dropIds } } });
      logger.warn(`[ca-validate] ${symbol}: ${dropIds.length} evento(s) espúrio(s) removido(s)`);
    }
    return dropIds.length;
  } catch (err) {
    logger.warn(`[ca-validate] falha em ${symbol} (não-fatal):`, err);
    return 0;
  }
};

/**
 * Varre os eventos aplicáveis, classifica via preço e retorna os ESPÚRIOS.
 * Remove-os se `apply`. Retorna os símbolos afetados (p/ recálculo de posições).
 */
export const findSpuriousCorporateActions = async (opts?: {
  apply?: boolean;
}): Promise<{ spurious: SpuriousCa[]; checked: number; affectedSymbols: string[] }> => {
  const cas = await prisma.assetCorporateAction.findMany({
    where: { type: { in: Array.from(APPLICABLE_CORPORATE_ACTION_TYPES) } },
    select: { id: true, symbol: true, date: true, factor: true, type: true },
  });

  const spurious: SpuriousCa[] = [];
  let checked = 0;
  for (const ca of cas) {
    if (!isDetectableFactor(ca.factor)) continue;
    checked++;
    const verdict = await classifyCorporateActionViaPrice(ca.symbol, ca.date, ca.factor);
    if (verdict === 'spurious') spurious.push(ca);
  }

  const affectedSymbols = [...new Set(spurious.map((s) => s.symbol))];
  if (opts?.apply && spurious.length > 0) {
    await prisma.assetCorporateAction.deleteMany({
      where: { id: { in: spurious.map((s) => s.id) } },
    });
  }
  return { spurious, checked, affectedSymbols };
};
