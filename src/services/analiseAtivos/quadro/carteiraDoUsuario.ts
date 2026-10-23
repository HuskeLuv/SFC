import { prisma } from '@/lib/prisma';
import type { CarteiraOrdem } from '@/services/analiseAtivos/quadro/consultaQuadro';
import { normalizarTickerEua } from '@/types/analiseAtivosEua';

/** Símbolo manual de stock/REIT da Carteira: 'AAPL-1731234567890-abc' → 'AAPL'. */
const RE_SIMBOLO_MANUAL = /^([A-Z0-9.]+)-\d{13}-[A-Z0-9]+$/i;

function simbolos(linhas: { asset: { symbol: string } | null }[]): Set<string> {
  const out = new Set<string>();
  for (const p of linhas) {
    const symbol = p.asset?.symbol?.toUpperCase();
    if (!symbol) continue;
    out.add(symbol);
    out.add(normalizarTickerEua(RE_SIMBOLO_MANUAL.exec(symbol)?.[1] ?? symbol));
  }
  return out;
}

/**
 * Tickers com posição (quantidade > 0) e planejados (watchlist) do usuário — o filtro "Na minha
 * carteira" usa `todos`; a ordem "Na carteira" separa posição de planejado. Cada símbolo entra
 * também NORMALIZADO (sem pontuação, sem o sufixo dos ativos manuais), para casar stocks e REITs
 * (BRK.B ↔ BRKB) — tickers da B3 têm dígito e nunca casam com um ticker EUA.
 */
export async function carteiraDoUsuario(
  userId: string,
): Promise<CarteiraOrdem & { todos: Set<string> }> {
  const [posicoes, planejados] = await Promise.all([
    prisma.portfolio.findMany({
      where: { userId, quantity: { gt: 0 }, assetId: { not: null } },
      select: { asset: { select: { symbol: true } } },
    }),
    prisma.watchlist.findMany({
      where: { userId, assetId: { not: null } },
      select: { asset: { select: { symbol: true } } },
    }),
  ]);
  const p = simbolos(posicoes);
  const w = simbolos(planejados);
  return { posicoes: p, planejados: w, todos: new Set([...p, ...w]) };
}
