/**
 * Deduplicação de eventos corporativos do MESMO evento vindos de fontes
 * diferentes. A BRAPI (`stockDividends`) e o Yahoo (`events=split`) classificam
 * o mesmo split/bonificação de formas diferentes (ex.: GOAU4 — BRAPI
 * BONIFICACAO 1.333 em 18/12 + Yahoo DESDOBRAMENTO 1.3333 em 19/12) e gravam
 * DUAS linhas (datas/tipos diferentes → a unique [symbol,date,type] não pega).
 * Como DESDOBRAMENTO/BONIFICACAO/GRUPAMENTO TODOS multiplicam a quantidade no
 * replay, o fator era aplicado em DOBRO → quantidade/posição errada.
 *
 * Também o próprio Yahoo às vezes grava o mesmo split em duas ex-dates próximas
 * (ex.: B3SA3 DESDOBRAMENTO 3:1 em 06/05 E 17/05, ambos YAHOO).
 *
 * Estratégia: agrupa eventos aplicáveis do símbolo em CLUSTERS (≤15 dias entre
 * vizinhos E fator ~IDÊNTICO, ≤1% — o mesmo evento de fontes/datas diferentes) e
 * mantém UM por cluster (Yahoo é canônico p/ split; senão o mais antigo). A
 * tolerância apertada de 1% evita fundir eventos pequenos DISTINTOS (ex.: SBSP3
 * 1.028 vs 1.0016 em dias consecutivos NÃO são fundidos). Eventos isolados são
 * preservados (inclui órfãos BRAPI de splits antigos que o Yahoo não tem).
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { APPLICABLE_CORPORATE_ACTION_TYPES } from '@/services/portfolio/corporateActions';

const WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
const FACTOR_TOL = 0.01;
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
    const applicable = evs
      .filter((e) => isApplicable(e.type, e.factor))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Agrupa em clusters (próximos no tempo + fator ~idêntico = mesmo evento) e
    // mantém UM por cluster (Yahoo canônico, senão o mais antigo).
    const dropIds: string[] = [];
    let i = 0;
    while (i < applicable.length) {
      const cluster = [applicable[i]];
      let j = i + 1;
      while (
        j < applicable.length &&
        applicable[j].date.getTime() - cluster[cluster.length - 1].date.getTime() <= WINDOW_MS &&
        Math.abs(applicable[j].factor / cluster[0].factor - 1) < FACTOR_TOL
      ) {
        cluster.push(applicable[j]);
        j++;
      }
      if (cluster.length > 1) {
        const keep = cluster.find((e) => e.source === YAHOO) ?? cluster[0];
        for (const e of cluster) if (e.id !== keep.id) dropIds.push(e.id);
      }
      i = j;
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
