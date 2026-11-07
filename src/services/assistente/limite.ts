/**
 * Controle de uso do assistente por usuário: limite MENSAL de mensagens
 * (decisão de 08/09/2026: mensal, não diário; "modo econômico" perto da cota)
 * e registro de cada chamada ao modelo com custo (spec v1.1 §7).
 */
import prisma from '@/lib/prisma';
import { assinaturasHabilitadas, limiteDoPlano } from '@/lib/assinaturasConfig';
import type { Plano } from '@/lib/planos';
import { planoDoUsuario } from '@/services/planos/resolverPlano';
import type { LlmResponse } from './llm';
import type { Intencao } from './intencao';

export const LIMITE_MENSAL_PADRAO = 300;
/** A partir desta fração da cota o cliente avisa que está perto do limite. */
export const FRACAO_MODO_ECONOMICO = 0.8;

/**
 * Cota mensal. Sem plano, ou com ASSINATURAS_HABILITADAS desligada, é a de sempre
 * (ASSISTENTE_LIMITE_MENSAL, padrão 300). Com a chave ligada e um plano, é a do plano
 * (LIMITES_PLANO.ia / ASSINATURAS_LIMITE_IA_*), nunca acima do teto global.
 */
export function limiteMensal(plano?: Plano): number {
  const n = Number(process.env.ASSISTENTE_LIMITE_MENSAL);
  const teto = Number.isFinite(n) && n > 0 ? Math.floor(n) : LIMITE_MENSAL_PADRAO;
  if (plano === undefined || !assinaturasHabilitadas()) return teto;
  return Math.min(limiteDoPlano('ia', plano), teto);
}

export function assistenteHabilitado(): boolean {
  return process.env.ASSISTENTE_HABILITADO === 'true' && Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface UsoMensal {
  usadas: number;
  limite: number;
  restantes: number;
  economico: boolean;
  /** Plano que definiu a cota; só com ASSINATURAS_HABILITADAS ligada (ausente = como antes). */
  plano?: Plano;
}

export function inicioDoMes(agora = new Date()): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

/**
 * Uso do mês de `userId`, o DONO dos dados: com o consultor agindo, a cota conta no cliente
 * (decisão 4 de 07/11) e o plano é o do cliente, nunca o max com o consultor.
 */
export async function usoMensal(userId: string, agora = new Date()): Promise<UsoMensal> {
  const plano = assinaturasHabilitadas() ? await planoDoUsuario(userId) : undefined;
  const limite = limiteMensal(plano);
  const usadas = await prisma.assistenteMensagem.count({
    where: { userId, ok: true, createdAt: { gte: inicioDoMes(agora) } },
  });
  return {
    usadas,
    limite,
    restantes: Math.max(0, limite - usadas),
    economico: usadas >= Math.floor(limite * FRACAO_MODO_ECONOMICO),
    ...(plano !== undefined ? { plano } : {}),
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
