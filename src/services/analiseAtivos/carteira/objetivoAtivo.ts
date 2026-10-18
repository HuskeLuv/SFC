/**
 * "Planejar na carteira" da Análise de Ativos = o MESMO Objetivo da Carteira (decisão do Wellington,
 * 17/10/2026, ticket do Pedro de 16/10). Antes (v2.5) o alvo ia para planning_asset_targets (% da
 * carteira TOTAL), que nada fora da Análise lia: o toast dizia "planejado", mas o ativo não aparecia
 * na aba e o Objetivo da Carteira ficava como estava.
 *
 * Agora o objetivo é % DENTRO da aba, como na tabela da Carteira:
 * - com posição → Portfolio.objetivo (mesmo efeito do POST /api/carteira/<aba>/objetivo; histórico
 *   'objetivo-classe.definir', com desfazer);
 * - sem posição → linha PLANEJADA (Watchlist: objetivo + secao), a mesma do "+ planejar" da aba
 *   (POST/PATCH/DELETE /api/carteira/planejados; histórico 'planejado.*', com desfazer). Criada na
 *   1ª gravação, na seção escolhida (secaoOperacao no front; sem seção válida, o padrão da aba).
 * - "Remover do plano": posição → objetivo 0; planejado → apaga a linha (o × da Carteira).
 *
 * userId = targetUserId (consultor agindo grava no cliente; a rota loga o acesso e o histórico
 * registra o consultor). Toda gravação chama invalidarContextoUsuario (contexto do assistente).
 * planning_asset_targets não é mais lido nem gravado aqui (só LGPD em alvosAtivo.ts e o script de
 * migração scripts/analise-ativos/migrar-alvos-para-objetivo.ts).
 *
 * Stocks e REITs (feature EUA, fatia D): a Carteira não tem catálogo EUA, então o "Asset do
 * ticker" é o Asset MANUAL do usuário (tickerCarteiraEua: 'BRKB-…' para BRK.B) — com posição, o
 * Objetivo vai no Portfolio da aba Stocks/REIT's; sem posição, na linha planejada. Sem nenhum dos
 * dois, o 1º PUT cria o Asset manual planejado (criarAssetPlanejadoManual, o mesmo do "+ planejar"
 * da aba; o REIT leva o TICKER como nome, que é como a Carteira casa o REIT planejado na compra).
 * A classe (stock | reit) vem do cadastro da SEC (classeEuaDoTicker).
 */
import type { NextRequest } from 'next/server';
import type { Asset, Portfolio, Watchlist } from '@prisma/client';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ApiError } from '@/utils/apiErrorHandler';
import type { AuthWithActingResult } from '@/utils/auth';
import { rotuloCategoria } from '@/lib/carteiraMover';
import { categoriaEfetiva } from '@/services/portfolio/itemValuation';
import {
  SECOES_POR_ABA,
  abaDoAssetPlanejado,
  criarAssetPlanejadoManual,
  type AbaPlanejavel,
} from '@/services/portfolio/ativosPlanejados';
import {
  TIPOS_ASSET_EUA,
  encontrarAssetManualEmPosicao,
  encontrarAssetManualPlanejado,
  normalizarTicker,
} from '@/services/analiseAtivos/carteira/tickerCarteiraEua';
import { ehClasseEua, type ClasseEua } from '@/types/analiseAtivosApi';
import { invalidarContextoUsuario } from '@/services/assistente/contexto';
import {
  assetEntityLabel,
  recordObjetivoClasseDefinido,
  recordPlanejadoAdicionado,
  recordPlanejadoEditado,
  recordPlanejadoRemovido,
} from '@/services/changeHistory';
import type { ObjetivoAtivoApi } from '@/types/analiseAtivosApi';

/**
 * PUT {objetivoPct, secao?}: objetivo em % DENTRO da aba (0,01 ≤ x ≤ 100, gravado com 2 casas);
 * secao só vale na criação do planejado (estratégia da ação / tipo do FII). Campo extra = 400.
 * O piso é 0,01 (e não 0): objetivo 0 é o "Remover do plano" (DELETE).
 */
export const ObjetivoPutSchema = z
  .object({
    objetivoPct: z
      .number({ error: 'Informe o objetivo em %' })
      .finite({ message: 'Informe o objetivo em %' })
      .min(0.01, { message: 'O objetivo precisa ser maior que 0%' })
      .max(100, { message: 'O objetivo pode ser no máximo 100%' }),
    secao: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

export type ObjetivoPutValidado = z.output<typeof ObjetivoPutSchema>;

/** 2 casas, como o campo Objetivo da tabela da Carteira. */
const duasCasas = (v: number): number => Math.round(v * 100) / 100;

/** Seção padrão do planejado quando o front não manda uma válida (ação → Value; FII → Papel). */
const SECAO_PADRAO_ABA: Partial<Record<AbaPlanejavel, string>> = {
  acoes: 'value',
  stocks: 'value',
  reits: 'value',
  fii: 'tvm',
};

/** Rótulo da classe no histórico, igual ao das rotas /api/carteira/<aba>/objetivo. */
const CLASSE_HISTORICO: Record<string, string> = {
  acoes: 'Ações',
  fiis: 'FIIs',
  etfs: 'ETFs',
  stocks: 'Stocks',
  reits: 'REITs',
  fimFia: 'FIM/FIA',
};

export type AssetAlvo = Pick<
  Asset,
  'id' | 'symbol' | 'name' | 'type' | 'currency' | 'source' | 'categoria' | 'subcategoria'
>;

const SELECT_ASSET = {
  id: true,
  symbol: true,
  name: true,
  type: true,
  currency: true,
  source: true,
  categoria: true,
  subcategoria: true,
} as const;

/** Asset do ticker (symbol é único). null = fora do catálogo. */
export async function assetDoTicker(symbol: string): Promise<AssetAlvo | null> {
  return prisma.asset.findUnique({ where: { symbol }, select: SELECT_ASSET });
}

/**
 * EUA: classe do ticker pelo cadastro da SEC (ticker vigente → CIK → SecCompany.classe). null =
 * ticker fora do cadastro ou CIK sem classe (a rota responde 404).
 */
export async function classeEuaDoTicker(symbol: string): Promise<ClasseEua | null> {
  const symbolNorm = normalizarTicker(symbol);
  if (!symbolNorm) return null;
  const ticker = await prisma.secCompanyTicker.findFirst({
    where: { symbolNorm, validTo: null },
    orderBy: { principal: 'desc' },
    select: { cik: true },
  });
  if (!ticker) return null;
  const empresa = await prisma.secCompany.findUnique({
    where: { cik: ticker.cik },
    select: { classe: true },
  });
  const classe = empresa?.classe;
  return ehClasseEua(classe) ? classe : null;
}

/**
 * EUA: o Asset manual do usuário para o ticker — o da posição (quantidade > 0) ou, sem posição, o
 * da linha planejada. Procura nos dois tipos (stock e reit): um REIT lançado como stock pelo wizard
 * continua sendo o mesmo ativo. null = o usuário ainda não tem nem planejou o ticker.
 */
export async function assetEuaDoUsuario(userId: string, symbol: string): Promise<AssetAlvo | null> {
  const posicao = await encontrarAssetManualEmPosicao(prisma, userId, TIPOS_ASSET_EUA, symbol);
  if (posicao) return posicao.asset;
  const planejado = await encontrarAssetManualPlanejado(prisma, userId, TIPOS_ASSET_EUA, symbol);
  return planejado?.asset ?? null;
}

/**
 * EUA, 1º "Planejar" sem posição nem plano: cria o Asset manual planejado (symbol 'BRKB-<ts>-<rnd>',
 * nome = ticker da Análise), igual ao "+ planejar" da aba Stocks/REIT's.
 */
export async function criarAssetEuaPlanejado(
  classe: ClasseEua,
  symbol: string,
): Promise<AssetAlvo> {
  const criado = await criarAssetPlanejadoManual(classe, symbol);
  return {
    id: criado.id,
    symbol: criado.symbol,
    name: criado.name,
    type: criado.type,
    currency: criado.currency,
    source: criado.source,
    categoria: criado.categoria,
    subcategoria: criado.subcategoria,
  };
}

/** Seção da posição na coluna da aba (estratégia / tipo do FII / região do ETF / fundo). */
const secaoDaPosicao = (p: Portfolio): string | null =>
  p.estrategia ?? p.tipoFii ?? p.regiaoEtf ?? p.tipoFundo ?? null;

function apiDaPosicao(p: Portfolio, asset: AssetAlvo): ObjetivoAtivoApi {
  const categoria = categoriaEfetiva(asset, p.categoriaOverride);
  return {
    origem: 'posicao',
    id: p.id,
    objetivoPct: Number.isFinite(p.objetivo) ? p.objetivo : 0,
    categoria,
    abaNome: rotuloCategoria(categoria),
    secao: secaoDaPosicao(p),
  };
}

function apiDoPlanejado(w: Watchlist, asset: AssetAlvo): ObjetivoAtivoApi {
  const categoria = categoriaEfetiva(asset, w.categoriaOverride);
  return {
    origem: 'planejado',
    id: w.id,
    objetivoPct: Number.isFinite(w.objetivo) ? w.objetivo : 0,
    categoria,
    abaNome: rotuloCategoria(categoria),
    secao: w.secao ?? null,
  };
}

/** Posição (Portfolio, única por userId+assetId) e linha planejada do ativo. */
async function localizar(userId: string, assetId: string) {
  const [posicao, planejado] = await Promise.all([
    prisma.portfolio.findFirst({ where: { userId, assetId } }),
    prisma.watchlist.findFirst({ where: { userId, assetId } }),
  ]);
  return { posicao, planejado };
}

/** Objetivo atual do ativo na Carteira; null = sem posição e sem linha planejada. */
export async function lerObjetivoAtivo(
  userId: string,
  asset: AssetAlvo,
): Promise<ObjetivoAtivoApi | null> {
  const { posicao, planejado } = await localizar(userId, asset.id);
  if (posicao) return apiDaPosicao(posicao, asset);
  if (planejado) return apiDoPlanejado(planejado, asset);
  return null;
}

export interface ResultadoSalvarObjetivo {
  objetivo: ObjetivoAtivoApi;
  /** true = a linha planejada foi criada agora */
  criado: boolean;
}

/**
 * Grava o objetivo (% dentro da aba): posição → Portfolio.objetivo; planejado → Watchlist.objetivo;
 * nada → cria a linha planejada na aba do ativo, na seção pedida (ou no padrão da aba).
 */
export async function salvarObjetivoAtivo(
  request: NextRequest,
  auth: AuthWithActingResult,
  asset: AssetAlvo,
  entrada: ObjetivoPutValidado,
): Promise<ResultadoSalvarObjetivo> {
  const userId = auth.targetUserId;
  const objetivo = duasCasas(entrada.objetivoPct);
  const { posicao, planejado } = await localizar(userId, asset.id);

  if (posicao) {
    const atualizado = await prisma.portfolio.update({
      where: { id: posicao.id },
      data: { objetivo },
    });
    invalidarContextoUsuario(userId);
    const categoria = categoriaEfetiva(asset, posicao.categoriaOverride);
    await recordObjetivoClasseDefinido(request, auth, {
      classe: CLASSE_HISTORICO[categoria] ?? rotuloCategoria(categoria),
      ativoId: posicao.id,
      ticker: assetEntityLabel(asset),
      objetivoAnterior: posicao.objetivo,
      objetivo,
    });
    return { objetivo: apiDaPosicao(atualizado, asset), criado: false };
  }

  if (planejado) {
    const atualizado = await prisma.watchlist.update({
      where: { id: planejado.id },
      data: { objetivo },
    });
    invalidarContextoUsuario(userId);
    await recordPlanejadoEditado(request, auth, planejado, atualizado, asset);
    return { objetivo: apiDoPlanejado(atualizado, asset), criado: false };
  }

  // Sem posição nem plano: nasce a linha planejada (mesmas regras do POST /api/carteira/planejados).
  const aba = abaDoAssetPlanejado(asset);
  if (!aba) {
    throw new ApiError(400, 'Este tipo de ativo ainda não pode ser planejado sem posição');
  }
  const secoes = SECOES_POR_ABA[aba];
  let secao: string | null = null;
  if (secoes.length > 0) {
    if (entrada.secao !== undefined && !secoes.includes(entrada.secao)) {
      throw new ApiError(400, 'Seção inválida para esta aba', { secao: [entrada.secao] });
    }
    secao = entrada.secao ?? SECAO_PADRAO_ABA[aba] ?? secoes[0];
  }
  const criado = await prisma.watchlist.create({
    data: { userId, assetId: asset.id, objetivo, secao, notes: null },
  });
  invalidarContextoUsuario(userId);
  await recordPlanejadoAdicionado(request, auth, criado, asset);
  return { objetivo: apiDoPlanejado(criado, asset), criado: true };
}

export interface ResultadoRemoverObjetivo {
  removido: boolean;
  origem: 'posicao' | 'planejado' | null;
}

/**
 * "Remover do plano": posição → objetivo 0 (removido=false quando já era 0); planejado → apaga a
 * linha da aba (como o × da Carteira). Sem nenhum dos dois: removido=false.
 */
export async function removerObjetivoAtivo(
  request: NextRequest,
  auth: AuthWithActingResult,
  asset: AssetAlvo,
): Promise<ResultadoRemoverObjetivo> {
  const userId = auth.targetUserId;
  const { posicao, planejado } = await localizar(userId, asset.id);

  if (posicao) {
    if (!(posicao.objetivo > 0)) return { removido: false, origem: 'posicao' };
    await prisma.portfolio.update({ where: { id: posicao.id }, data: { objetivo: 0 } });
    invalidarContextoUsuario(userId);
    const categoria = categoriaEfetiva(asset, posicao.categoriaOverride);
    await recordObjetivoClasseDefinido(request, auth, {
      classe: CLASSE_HISTORICO[categoria] ?? rotuloCategoria(categoria),
      ativoId: posicao.id,
      ticker: assetEntityLabel(asset),
      objetivoAnterior: posicao.objetivo,
      objetivo: 0,
    });
    return { removido: true, origem: 'posicao' };
  }

  if (planejado) {
    await prisma.watchlist.delete({ where: { id: planejado.id } });
    invalidarContextoUsuario(userId);
    await recordPlanejadoRemovido(request, auth, planejado, asset);
    return { removido: true, origem: 'planejado' };
  }

  return { removido: false, origem: null };
}
