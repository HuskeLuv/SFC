/**
 * Controle de uso do assistente por usuário: limite MENSAL de mensagens
 * (decisão de 08/09/2026: mensal, não diário; "modo econômico" perto da cota)
 * e registro de cada chamada ao modelo com custo (spec v1.1 §7).
 */
import prisma from '@/lib/prisma';
import type { LlmResponse } from './llm';
import type { Intencao } from './intencao';

export const LIMITE_MENSAL_PADRAO = 300;
/** A partir desta fração da cota o cliente avisa que está perto do limite. */
export const FRACAO_MODO_ECONOMICO = 0.8;

export function limiteMensal(): number {
  const n = Number(process.env.ASSISTENTE_LIMITE_MENSAL);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : LIMITE_MENSAL_PADRAO;
}

export function assistenteHabilitado(): boolean {
  return process.env.ASSISTENTE_HABILITADO === 'true' && Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface UsoMensal {
  usadas: number;
  limite: number;
  restantes: number;
  economico: boolean;
}

export function inicioDoMes(agora = new Date()): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

export async function usoMensal(userId: string, agora = new Date()): Promise<UsoMensal> {
  const limite = limiteMensal();
  const usadas = await prisma.assistenteMensagem.count({
    where: { userId, ok: true, createdAt: { gte: inicioDoMes(agora) } },
  });
  return {
    usadas,
    limite,
    restantes: Math.max(0, limite - usadas),
    economico: usadas >= Math.floor(limite * FRACAO_MODO_ECONOMICO),
  };
}

export interface RegistroMensagem {
  userId: string;
  actorId: string;
  viaConsultant: boolean;
  intencao: Intencao;
  motor: 'ia' | 'ia+t';
  textoUsuario: string | null;
  propostaGerada: boolean;
  resposta: LlmResponse | null;
  erro?: string;
}

/** Grava a linha de métrica/custo. Nunca lança: falhar aqui não pode derrubar a resposta. */
export async function registrarMensagem(r: RegistroMensagem): Promise<string | null> {
  try {
    const u = r.resposta?.usage;
    const row = await prisma.assistenteMensagem.create({
      data: {
        userId: r.userId,
        actorId: r.actorId,
        viaConsultant: r.viaConsultant,
        intencao: r.intencao,
        motor: r.motor,
        modelo: r.resposta?.model ?? 'n/a',
        inputTokens: u?.inputTokens ?? 0,
        cachedInputTokens: u?.cachedInputTokens ?? 0,
        cacheWriteTokens: u?.cacheWriteTokens ?? 0,
        outputTokens: u?.outputTokens ?? 0,
        custoBrl: r.resposta?.costBrl ?? 0,
        latencyMs: r.resposta?.latencyMs ?? 0,
        stopReason: r.resposta?.stopReason ?? (r.erro ? 'erro' : 'n/a'),
        ok: !r.erro,
        propostaGerada: r.propostaGerada,
        textoUsuario: r.textoUsuario ? r.textoUsuario.slice(0, 300) : null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error: unknown) {
    console.error(
      '[assistente] falha ao registrar mensagem:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function marcarPropostaConfirmada(mensagemId: string): Promise<void> {
  try {
    await prisma.assistenteMensagem.update({
      where: { id: mensagemId },
      data: { propostaConfirmada: true },
    });
  } catch {
    // best-effort
  }
}
