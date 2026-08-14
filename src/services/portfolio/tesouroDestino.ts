/**
 * Destino de um título do Tesouro comprado "para dentro" de uma reserva.
 *
 * O catálogo de Tesouro Direto não distingue reserva de renda fixa — a
 * intenção fica registrada em `transaction.notes.tesouroDestino` na compra
 * (mesma convenção do resumo da carteira e da Saúde Financeira). Este módulo
 * é o ponto único de leitura dessa convenção para quem precisa classificar
 * posições por assetId (wizards de aporte/resgate, abas da carteira).
 */

import { prisma } from '@/lib/prisma';

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

/**
 * Mapa assetId → destino para as compras do usuário (primeira compra marcada
 * vence, como no resumo). `assetIds` restringe a consulta quando o caller já
 * sabe quais ativos são Tesouro.
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
  });
  const result = new Map<string, TesouroDestino>();
  for (const tx of transactions) {
    if (!tx.assetId || result.has(tx.assetId)) continue;
    const destino = parseTesouroDestino(tx.notes);
    if (destino) result.set(tx.assetId, destino);
  }
  return result;
};
