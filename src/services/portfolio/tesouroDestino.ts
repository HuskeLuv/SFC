/**
 * Destino de um título do Tesouro comprado "para dentro" de uma reserva.
 *
 * O catálogo de Tesouro Direto não distingue reserva de renda fixa — a
 * intenção fica registrada em `transaction.notes.tesouroDestino` na compra
 * (mesma convenção do resumo da carteira e da Saúde Financeira). Este módulo
 * é o ponto único de leitura dessa convenção para quem precisa classificar
 * posições por assetId (wizards de aporte/resgate, abas da carteira).
 *
 * Regra "1ª compra marcada vence" GARANTIDA (mover fase 2, out/2026): as compras
 * são lidas por data, createdAt e id (antes não havia orderBy e a ordem era a do
 * banco). Importa para posições com destinos mistos (1 em prod em 02/10/2026):
 * a aba base do Tesouro precisa ser determinística.
 */

import { prisma } from '@/lib/prisma';
import type { ReservaDestino } from '@/lib/carteiraMover';

export type TesouroDestino = 'reserva-emergencia' | 'reserva-oportunidade';

/** Extrai o destino das notes de uma compra; null quando não marcado. */
export const parseTesouroDestino = (notes: string | null | undefined): TesouroDestino | null => {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (parsed?.tesouroDestino === 'reserva-emergencia') return 'reserva-emergencia';
    if (parsed?.tesouroDestino === 'reserva-oportunidade') return 'reserva-oportunidade';
    return null;
  } catch {
    return null;
  }
};

/** Ordem da regra "1ª compra marcada vence". */
export const ORDEM_COMPRAS_TESOURO_DESTINO = [
  { date: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] as const;

/**
 * Puro: mapa assetId → destino a partir de compras JÁ ordenadas (1ª marcada vence).
 */
export const primeiroDestinoPorAsset = (
  comprasOrdenadas: readonly { assetId: string | null; notes: string | null }[],
): Map<string, TesouroDestino> => {
  const result = new Map<string, TesouroDestino>();
  for (const tx of comprasOrdenadas) {
    if (!tx.assetId || result.has(tx.assetId)) continue;
    const destino = parseTesouroDestino(tx.notes);
    if (destino) result.set(tx.assetId, destino);
  }
  return result;
};

/**
 * Mapa assetId → destino para as compras do usuário (primeira compra marcada
 * por data vence, como no resumo). `assetIds` restringe a consulta quando o
 * caller já sabe quais ativos são Tesouro.
 */
export const getTesouroDestinoByAssetId = async (
  userId: string,
  assetIds?: string[],
): Promise<Map<string, TesouroDestino>> => {
  if (assetIds && assetIds.length === 0) return new Map();
  const transactions = await prisma.stockTransaction.findMany({
    where: {
      userId,
      type: 'compra',
      notes: { not: null },
      ...(assetIds ? { assetId: { in: assetIds } } : {}),
    },
    select: { assetId: true, notes: true },
    orderBy: [...ORDEM_COMPRAS_TESOURO_DESTINO],
  });
  return primeiroDestinoPorAsset(transactions);
};

/**
 * Mesma regra no formato do `BaseCtx.reservaDestino` do mover (carteiraMover.ts):
 * assetId → 'emergencia' | 'oportunidade'. A compra nova de um Tesouro movido
 * não troca a base (a Fatia A grava o marcador da base vigente na compra).
 */
export const reservaDestinoPorAsset = async (
  userId: string,
  assetIds?: string[],
): Promise<Map<string, ReservaDestino>> => {
  const porAsset = await getTesouroDestinoByAssetId(userId, assetIds);
  const out = new Map<string, ReservaDestino>();
  for (const [assetId, destino] of porAsset) {
    out.set(assetId, destino === 'reserva-emergencia' ? 'emergencia' : 'oportunidade');
  }
  return out;
};
