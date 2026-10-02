/**
 * Tese PRIVADA do usuário sobre um ativo (fatia D, decisão 11): um texto por usuário e ticker,
 * até 10.000 caracteres, sem histórico. Sempre do usuário LOGADO — quem chama passa payload.id,
 * nunca o targetUserId do consultor (a rota responde 403 com consultor agindo).
 *
 * Corpo: trim; vazio = apaga. O limite vale para o texto já sem espaços nas pontas.
 */
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { TESE_MAX_CARACTERES, type TeseResposta } from '@/types/analiseAtivosApi';

export const TesePutSchema = z.object({
  corpo: z
    .string({ error: 'Informe o texto da tese' })
    .transform((s) => s.trim())
    .pipe(
      z.string().max(TESE_MAX_CARACTERES, {
        message: `A tese pode ter até ${TESE_MAX_CARACTERES.toLocaleString('pt-BR')} caracteres`,
      }),
    ),
});

export type TesePutValidado = z.output<typeof TesePutSchema>;

export const TESE_VAZIA: TeseResposta = { corpo: '', atualizadoEm: null, visibilidade: 'privada' };

export async function lerTese(userId: string, symbol: string): Promise<TeseResposta> {
  const tese = await prisma.analiseTese.findUnique({
    where: { userId_symbol: { userId, symbol } },
    select: { corpo: true, updatedAt: true },
  });
  if (!tese) return TESE_VAZIA;
  return { corpo: tese.corpo, atualizadoEm: tese.updatedAt.toISOString(), visibilidade: 'privada' };
}

/** Grava (cria ou atualiza). Corpo vazio apaga e devolve atualizadoEm=null. */
export async function salvarTese(
  userId: string,
  symbol: string,
  corpo: string,
): Promise<{ atualizadoEm: string | null }> {
  const texto = corpo.trim();
  if (texto.length === 0) {
    await apagarTese(userId, symbol);
    return { atualizadoEm: null };
  }
  const tese = await prisma.analiseTese.upsert({
    where: { userId_symbol: { userId, symbol } },
    create: { userId, symbol, corpo: texto, visibilidade: 'privada' },
    update: { corpo: texto },
    select: { updatedAt: true },
  });
  return { atualizadoEm: tese.updatedAt.toISOString() };
}

export async function apagarTese(userId: string, symbol: string): Promise<void> {
  // deleteMany: idempotente (apagar o que não existe não é erro) e preso ao userId.
  await prisma.analiseTese.deleteMany({ where: { userId, symbol } });
}

/** Teses do usuário para a exportação LGPD (Art. 18, V). */
export async function tesesParaExportacao(userId: string) {
  return prisma.analiseTese.findMany({
    where: { userId },
    select: { symbol: true, corpo: true, visibilidade: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
}
