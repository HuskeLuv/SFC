/**
 * Deduplicação de eventos corporativos do MESMO evento vindos de fontes
 * diferentes. A BRAPI (`stockDividends`) e o Yahoo (`events=split`) classificam
 * o mesmo split/bonificação de formas diferentes (ex.: GOAU4 — BRAPI
 * BONIFICACAO 1.333 em 18/12 + Yahoo DESDOBRAMENTO 1.3333 em 19/12) e gravam
 * DUAS linhas (datas/tipos diferentes → a unique [symbol,date,type] não pega).
 * Como DESDOBRAMENTO/BONIFICACAO/GRUPAMENTO TODOS multiplicam a quantidade no
 * replay, o fator era aplicado em DOBRO → quantidade/posição errada.
 *
 * Estratégia (Yahoo é canônico p/ split — a BRAPI free nem tem splitHistory):
 * para cada evento aplicável NÃO-Yahoo, se existe um evento Yahoo aplicável do
 * mesmo símbolo dentro de ±7 dias com fator ~igual (≤5%), o NÃO-Yahoo é a
 * duplicata e é removido. Eventos BRAPI órfãos (sem gêmeo Yahoo — ex.: splits
 * antigos que o Yahoo não tem) são PRESERVADOS.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { APPLICABLE_CORPORATE_ACTION_TYPES } from '@/services/portfolio/corporateActions';

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FACTOR_TOL = 0.05;
const YAHOO = 'YAHOO';

const isApplicable = (type: string, factor: number) =>
  APPLICABLE_CORPORATE_ACTION_TYPES.has(type) && Number.isFinite(factor) && factor > 0;

/**
 * Remove as duplicatas cross-fonte de um símbolo. Retorna quantas foram
 * removidas. `dryRun` só conta. Best-effort: loga e segue em erro.
 */
export const dedupSymbolCorporateActions = async (
  symbol: string,
  opts?: { dryRun?: boolean },
): Promise<number> => {
  try {
    const evs = await prisma.assetCorporateAction.findMany({
      where: { symbol },
      select: { id: true, type: true, factor: true, date: true, source: true },
    });
    const yahoo = evs.filter((e) => e.source === YAHOO && isApplicable(e.type, e.factor));
    if (yahoo.length === 0) return 0;

    const dropIds: string[] = [];
    for (const e of evs) {
      if (e.source === YAHOO || !isApplicable(e.type, e.factor)) continue;
      const twin = yahoo.find(
        (y) =>
          Math.abs(y.date.getTime() - e.date.getTime()) <= WINDOW_MS &&
          Math.abs(y.factor / e.factor - 1) < FACTOR_TOL,
      );
      if (twin) dropIds.push(e.id);
    }
    if (dropIds.length === 0 || opts?.dryRun) return dropIds.length;

    await prisma.assetCorporateAction.deleteMany({ where: { id: { in: dropIds } } });
    return dropIds.length;
  } catch (err) {
    logger.warn(`[ca-dedup] falha em ${symbol} (não-fatal):`, err);
    return 0;
  }
};

/**
 * Roda a dedup em todos os símbolos que têm evento corporativo. Retorna o total
 * removido e a lista de símbolos afetados (p/ recálculo de posições).
 */
export const dedupAllCorporateActions = async (opts?: {
  dryRun?: boolean;
}): Promise<{ removed: number; affectedSymbols: string[] }> => {
  const symbols = (
    await prisma.assetCorporateAction.findMany({ select: { symbol: true }, distinct: ['symbol'] })
  ).map((r) => r.symbol);

  let removed = 0;
  const affectedSymbols: string[] = [];
  for (const symbol of symbols) {
    const n = await dedupSymbolCorporateActions(symbol, opts);
    if (n > 0) {
      removed += n;
      affectedSymbols.push(symbol);
    }
  }
  return { removed, affectedSymbols };
};
