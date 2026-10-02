/**
 * Overlay da Carteira para a Análise de Ativos (fatia D) — GET /api/analise-ativos/carteira.
 *
 * DB-only: só Portfolio e Watchlist do usuário (índices por userId). SEM preço e SEM valor — o
 * overlay alimenta o filtro "Na minha carteira", o selo do Quadro/página e a busca. Os NÚMEROS do
 * bloco "Na sua carteira" vêm dos endpoints da própria Carteira (useNaCarteiraAtivo).
 *
 * A categoria é a aba EFETIVA (categoriaEfetiva de itemValuation): respeita o "mover entre abas"
 * (#275) — WEGE3 movida para Stocks aparece com categoria 'stocks'.
 *
 * Planejado (Watchlist) que já virou posição fica só em `posicoes` (mesma defesa de
 * listarPlanejados: importação/undo criam Portfolio sem passar pela operação).
 */
import prisma from '@/lib/prisma';
import { categoriaEfetiva } from '@/services/portfolio/itemValuation';
import type { OverlayCarteiraResposta } from '@/types/analiseAtivosApi';

interface AssetOverlay {
  id: string;
  symbol: string;
  type: string | null;
  name: string | null;
  currency: string | null;
}

const SELECT_ASSET = {
  id: true,
  symbol: true,
  type: true,
  name: true,
  currency: true,
} as const;

const tickerDe = (asset: AssetOverlay | null): string | null => {
  const s = asset?.symbol?.trim().toUpperCase();
  return s ? s : null;
};

export async function overlayCarteira(userId: string): Promise<OverlayCarteiraResposta> {
  const [posicoes, planejados] = await Promise.all([
    prisma.portfolio.findMany({
      where: { userId, quantity: { gt: 0 }, assetId: { not: null } },
      select: {
        id: true,
        quantity: true,
        categoriaOverride: true,
        asset: { select: SELECT_ASSET },
      },
    }),
    prisma.watchlist.findMany({
      where: { userId, assetId: { not: null } },
      select: {
        id: true,
        objetivo: true,
        categoriaOverride: true,
        asset: { select: SELECT_ASSET },
      },
      orderBy: { addedAt: 'asc' },
    }),
  ]);

  const resposta: OverlayCarteiraResposta = { posicoes: {}, planejados: {} };
  const comPosicao = new Set<string>();

  for (const p of posicoes) {
    const ticker = tickerDe(p.asset);
    if (!ticker || !p.asset) continue;
    comPosicao.add(p.asset.id);
    const atual = resposta.posicoes[ticker];
    // Mesmo ticker em duas linhas (instituições diferentes): soma a quantidade, fica o 1º id.
    if (atual) {
      atual.quantidade += p.quantity;
      continue;
    }
    resposta.posicoes[ticker] = {
      portfolioId: p.id,
      quantidade: p.quantity,
      categoria: categoriaEfetiva(p.asset, p.categoriaOverride),
    };
  }

  for (const w of planejados) {
    const ticker = tickerDe(w.asset);
    if (!ticker || !w.asset) continue;
    if (comPosicao.has(w.asset.id) || resposta.posicoes[ticker]) continue;
    if (resposta.planejados[ticker]) continue;
    resposta.planejados[ticker] = {
      watchlistId: w.id,
      categoria: categoriaEfetiva(w.asset, w.categoriaOverride),
      objetivoPct: Number.isFinite(w.objetivo) ? w.objetivo : null,
    };
  }

  return resposta;
}
