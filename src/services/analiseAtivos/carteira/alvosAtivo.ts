/**
 * Alvo por ativo do "Planejar na carteira" (v2.5, spec §3.2/§5, caso 33) — planning_asset_targets.
 *
 * - O alvo é % da carteira TOTAL (0 < x ≤ 100), definido pelo usuário. A Análise mostra só o
 *   desvio entre a posição e ele (desvioAlvo); nunca lê nem grava o Objetivo da Carteira
 *   (Portfolio.objetivo / Watchlist.objetivo, % dentro da aba), que fica intocado.
 * - Uma linha por (userId, assetId): o PUT é idempotente (upsert); o DELETE é deleteMany preso ao
 *   userId (apagar o que não existe não é erro).
 * - Consultor agindo pelo cliente: grava no cliente (userId = targetUserId) e registra quem gravou em
 *   atualizadoPorUserId (a rota também loga o acesso).
 * - LGPD: alvosParaExportacao (Art. 18, V) e apagarAlvosDoUsuario na exclusão de conta — o User é
 *   ANONIMIZADO, não apagado, então o onDelete Cascade da FK nunca roda (achado da revisão).
 */
import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { AlvoAtivoApi } from '@/types/analiseAtivosApi';

export const ALVO_MAX_PCT = 100;

/**
 * PUT {targetPct}: número finito, 0,001 ≤ x ≤ 100, até 3 casas (Decimal(6,3)); campo extra = 400.
 * O piso é 0,001 (e não > 0) para o arredondamento a 3 casas nunca gravar um alvo de 0%.
 */
export const AlvoPutSchema = z
  .object({
    targetPct: z
      .number({ error: 'Informe o peso-alvo em %' })
      .min(0.001, { message: 'O peso-alvo precisa ser maior que 0%' })
      .max(ALVO_MAX_PCT, { message: 'O peso-alvo pode ser no máximo 100%' }),
  })
  .strict();

export type AlvoPutValidado = z.output<typeof AlvoPutSchema>;

/** 3 casas, como a coluna Decimal(6,3). */
const tresCasas = (v: number): number => Math.round(v * 1000) / 1000;

interface LinhaAlvo {
  targetPct: unknown;
  updatedAt: Date;
}

/** Decimal do Prisma (ou número) → AlvoAtivoApi. */
export function alvoApi(linha: LinhaAlvo): AlvoAtivoApi {
  return { targetPct: Number(linha.targetPct), atualizadoEm: linha.updatedAt.toISOString() };
}

/** Asset do ticker (symbol é único). null = fora do catálogo. */
export async function assetDoTicker(symbol: string): Promise<{ id: string } | null> {
  return prisma.asset.findUnique({ where: { symbol }, select: { id: true } });
}

export async function lerAlvo(userId: string, assetId: string): Promise<AlvoAtivoApi | null> {
  const linha = await prisma.planningAssetTarget.findUnique({
    where: { userId_assetId: { userId, assetId } },
    select: { targetPct: true, updatedAt: true },
  });
  return linha ? alvoApi(linha) : null;
}

export async function salvarAlvo(
  userId: string,
  assetId: string,
  targetPct: number,
  atualizadoPorUserId: string | null,
): Promise<AlvoAtivoApi> {
  const pct = tresCasas(targetPct);
  const linha = await prisma.planningAssetTarget.upsert({
    where: { userId_assetId: { userId, assetId } },
    create: { userId, assetId, targetPct: pct, atualizadoPorUserId },
    update: { targetPct: pct, atualizadoPorUserId },
    select: { targetPct: true, updatedAt: true },
  });
  return alvoApi(linha);
}

/** true = havia alvo e foi apagado. */
export async function apagarAlvo(userId: string, assetId: string): Promise<boolean> {
  const { count } = await prisma.planningAssetTarget.deleteMany({ where: { userId, assetId } });
  return count > 0;
}

/** Alvos do usuário por ticker (overlay da Carteira na Análise). */
export async function alvosPorTicker(userId: string): Promise<Record<string, AlvoAtivoApi>> {
  const linhas = await prisma.planningAssetTarget.findMany({
    where: { userId },
    select: { targetPct: true, updatedAt: true, asset: { select: { symbol: true } } },
  });
  const porTicker: Record<string, AlvoAtivoApi> = {};
  for (const l of linhas) {
    const ticker = l.asset?.symbol?.trim().toUpperCase();
    if (ticker) porTicker[ticker] = alvoApi(l);
  }
  return porTicker;
}

/** Alvos do usuário para a exportação LGPD (Art. 18, V). */
export async function alvosParaExportacao(userId: string) {
  const linhas = await prisma.planningAssetTarget.findMany({
    where: { userId },
    select: {
      targetPct: true,
      atualizadoPorUserId: true,
      createdAt: true,
      updatedAt: true,
      asset: { select: { symbol: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return linhas.map((l) => ({
    ticker: l.asset?.symbol ?? null,
    targetPct: Number(l.targetPct),
    atualizadoPorUserId: l.atualizadoPorUserId,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  }));
}

/** Exclusão de conta (Art. 18, VI): apaga todos os alvos do usuário. */
export async function apagarAlvosDoUsuario(userId: string): Promise<number> {
  const { count } = await prisma.planningAssetTarget.deleteMany({ where: { userId } });
  return count;
}
