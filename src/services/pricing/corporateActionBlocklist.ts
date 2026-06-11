/**
 * Blocklist MANUAL de eventos corporativos FALSOS dos feeds (BRAPI/Yahoo).
 *
 * Não temos fonte autoritativa de splits (o `splitHistory` da BRAPI não está no
 * plano; o COTAHIST cru só cobre anos antigos), então não dá pra distinguir
 * automaticamente split real de falso nos eventos recentes — inferir pelo preço
 * ajustado dá falso-positivo (removeu HFOF11/TEPP11 REAIS). A política é:
 * **confiar no feed por default** e remover SÓ os eventos aqui listados, cada um
 * comprovadamente falso (com a evidência no `reason`). Zero risco de tirar um
 * split verdadeiro. O pipeline aplica isso após o sync (impede re-adição pelo cron).
 *
 * Para adicionar: confirme que é falso (COTAHIST cru, ou o preço atual incompatível
 * com o fator — ex.: 5:1 alegado mas o preço não caiu ~5×) e registre a evidência.
 */
interface BlockEntry {
  symbol: string;
  factor: number; // fator alegado pelo feed
  after: string; // janela de data (ISO) — tolera divergência BRAPI/Yahoo
  before: string;
  reason: string;
}

export const CORPORATE_ACTION_BLOCKLIST: BlockEntry[] = [
  {
    symbol: 'SBSP3',
    factor: 5,
    after: '2026-04-01',
    before: '2026-05-31',
    reason:
      'COTAHIST: SBSP3 está ~R$27; um 5:1 real teria derrubado pra ~R$5,5. Evento falso do feed.',
  },
  {
    symbol: 'KNRE11',
    factor: 0.1,
    after: '2018-01-01',
    before: '2018-04-30',
    reason: 'COTAHIST cru ~R$10,5 contínuo na data — grupamento 1:10 nunca aconteceu.',
  },
  {
    symbol: 'CARE11',
    factor: 0.2,
    after: '2026-01-15',
    before: '2026-03-15',
    reason:
      'Yahoo+BRAPI: preço contínuo ~R$5,4 na data (jan R$5,6 → fev R$5,36) e 52sem topo R$6,6 — um 1:5 real teria ido a ~R$27. Grupamento nunca aconteceu.',
  },
];

const FACTOR_TOL = 0.1; // 10% de tolerância no fator

export const isBlockedCorporateAction = (symbol: string, date: Date, factor: number): boolean => {
  const sym = symbol.trim().toUpperCase();
  const t = date.getTime();
  return CORPORATE_ACTION_BLOCKLIST.some(
    (e) =>
      e.symbol === sym &&
      e.factor > 0 &&
      Math.abs(factor - e.factor) / e.factor < FACTOR_TOL &&
      t >= new Date(e.after).getTime() &&
      t <= new Date(e.before).getTime(),
  );
};

/** Símbolos que têm ao menos uma entrada na blocklist (p/ pular cedo no pipeline). */
export const BLOCKLISTED_SYMBOLS = new Set(CORPORATE_ACTION_BLOCKLIST.map((e) => e.symbol));

/**
 * Remove do banco os eventos corporativos bloqueados de UM símbolo. Usado no
 * pipeline (impede o cron de re-adicionar) e na limpeza pontual. Best-effort.
 */
export const removeBlockedForSymbol = async (symbol: string): Promise<number> => {
  const sym = symbol.trim().toUpperCase();
  if (!BLOCKLISTED_SYMBOLS.has(sym)) return 0;
  const { prisma } = await import('@/lib/prisma');
  const { logger } = await import('@/lib/logger');
  try {
    const cas = await prisma.assetCorporateAction.findMany({
      where: { symbol: sym },
      select: { id: true, date: true, factor: true },
    });
    const dropIds = cas
      .filter((ca) => isBlockedCorporateAction(sym, ca.date, ca.factor))
      .map((ca) => ca.id);
    if (dropIds.length > 0) {
      await prisma.assetCorporateAction.deleteMany({ where: { id: { in: dropIds } } });
      logger.warn(`[ca-blocklist] ${sym}: ${dropIds.length} evento(s) falso(s) removido(s)`);
    }
    return dropIds.length;
  } catch (err) {
    const { logger } = await import('@/lib/logger');
    logger.warn(`[ca-blocklist] falha em ${sym} (não-fatal):`, err);
    return 0;
  }
};
