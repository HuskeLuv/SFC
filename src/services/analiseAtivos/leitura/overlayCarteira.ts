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
 *
 * v2.4 (fatia C1): `posicoes[t]` traz também o Objetivo (% DENTRO da aba, rec. 1), a estratégia
 * (ação) e o tipo de FII da posição — a recompra pelo modal "Registrar operação" manda a MESMA seção
 * sem perguntar; `planejados[t]` traz `id` (PATCH/DELETE de /api/carteira/planejados/[id]) e a
 * `secao` do plano (a 1ª compra de um planejado preserva a seção escolhida ao planejar).
 *
 * 17/10/2026: o "Planejar na carteira" grava o Objetivo da Carteira (% dentro da aba) — o chip
 * 'Planejado' e o 'Ajustar plano' leem posicoes[t].objetivoPct / planejados[t]. O `alvos` de
 * planning_asset_targets (v2.5, % da carteira total) saiu.
 *
 * Stocks e REITs (feature EUA, fatia D): o Asset manual da Carteira ('AAPL-<ts>-<rnd>', type
 * stock|reit, USD, source manual) é casado pelo ticker SEM pontuação ('BRKB-…' → BRKB) e entra na
 * chave da ANÁLISE: o ticker vigente da SEC com esse symbolNorm (BRK-B → 'BRK.B', a URL da página).
 * Sem ticker na SEC, a chave fica sem pontuação ('BRKB'; os componentes procuram nas duas formas,
 * noOverlay). Traz `assetId` e `tipoAsset` — a recompra pela Análise manda esse Asset para não
 * criar outro. Os NÚMEROS continuam vindo da própria aba da Carteira
 * (/api/carteira/stocks|reit, getAssetPrices), não daqui. ETF em USD e ação da B3 não mudam.
 */
import prisma from '@/lib/prisma';
import { categoriaEfetiva } from '@/services/portfolio/itemValuation';
import {
  chaveCarteira,
  ehTipoAssetEua,
  tickerDeAssetEua,
} from '@/services/analiseAtivos/carteira/tickerCarteiraEua';
import { symbolAnaliseDaSec } from '@/types/analiseAtivosEua';
import type { OverlayCarteiraResposta } from '@/types/analiseAtivosApi';

interface AssetOverlay {
  id: string;
  symbol: string;
  type: string | null;
  name: string | null;
  currency: string | null;
  source: string | null;
}

const SELECT_ASSET = {
  id: true,
  symbol: true,
  type: true,
  name: true,
  currency: true,
  source: true,
} as const;

/**
 * Chave do ativo: EUA manual → o ticker da Análise (SEC; sem ele, o ticker sem pontuação); o resto
 * → symbol em maiúsculas.
 */
const tickerDe = (asset: AssetOverlay | null, daSec: Map<string, string>): string | null => {
  const eua = tickerDeAssetEua(asset);
  if (eua) return daSec.get(eua) ?? chaveCarteira(eua);
  const s = asset?.symbol?.trim().toUpperCase();
  return s ? s : null;
};

/**
 * symbolNorm → ticker da Análise ('BRKB' → 'BRK.B') pelo cadastro da SEC (tickers vigentes; o
 * principal do CIK vence). Só consulta quando há Asset manual EUA.
 */
async function tickersDaSec(normalizados: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (normalizados.length === 0) return mapa;
  const rows = await prisma.secCompanyTicker.findMany({
    where: { symbolNorm: { in: normalizados }, validTo: null },
    select: { symbol: true, symbolNorm: true, principal: true },
    orderBy: { principal: 'desc' },
  });
  for (const r of rows) {
    if (!mapa.has(r.symbolNorm)) mapa.set(r.symbolNorm, symbolAnaliseDaSec(r.symbol));
  }
  return mapa;
}

/** assetId/tipoAsset só nas linhas EUA manuais (a recompra pela Análise reaproveita o Asset). */
const camposEua = (asset: AssetOverlay) =>
  tickerDeAssetEua(asset) && ehTipoAssetEua(asset.type)
    ? { assetId: asset.id, tipoAsset: asset.type }
    : {};

/** Portfolio.objetivo: 0 (padrão da coluna) = sem alvo. */
const objetivoOuNull = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

export async function overlayCarteira(userId: string): Promise<OverlayCarteiraResposta> {
  const [posicoes, planejados] = await Promise.all([
    prisma.portfolio.findMany({
      where: { userId, quantity: { gt: 0 }, assetId: { not: null } },
      select: {
        id: true,
        quantity: true,
        categoriaOverride: true,
        objetivo: true,
        estrategia: true,
        tipoFii: true,
        asset: { select: SELECT_ASSET },
      },
    }),
    prisma.watchlist.findMany({
      where: { userId, assetId: { not: null } },
      select: {
        id: true,
        objetivo: true,
        secao: true,
        categoriaOverride: true,
        asset: { select: SELECT_ASSET },
      },
      orderBy: { addedAt: 'asc' },
    }),
  ]);

  const resposta: OverlayCarteiraResposta = { posicoes: {}, planejados: {} };
  const comPosicao = new Set<string>();
  const normalizadosEua = [
    ...new Set(
      [...posicoes, ...planejados]
        .map((x) => tickerDeAssetEua(x.asset))
        .filter((t): t is string => !!t),
    ),
  ];
  const daSec = await tickersDaSec(normalizadosEua);

  for (const p of posicoes) {
    const ticker = tickerDe(p.asset, daSec);
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
      objetivoPct: objetivoOuNull(p.objetivo),
      estrategia: p.estrategia ?? null,
      tipoFii: p.tipoFii ?? null,
      ...camposEua(p.asset),
    };
  }

  for (const w of planejados) {
    const ticker = tickerDe(w.asset, daSec);
    if (!ticker || !w.asset) continue;
    if (comPosicao.has(w.asset.id) || resposta.posicoes[ticker]) continue;
    if (resposta.planejados[ticker]) continue;
    resposta.planejados[ticker] = {
      watchlistId: w.id,
      id: w.id,
      categoria: categoriaEfetiva(w.asset, w.categoriaOverride),
      objetivoPct: Number.isFinite(w.objetivo) ? w.objetivo : null,
      secao: w.secao ?? null,
      ...camposEua(w.asset),
    };
  }

  return resposta;
}
