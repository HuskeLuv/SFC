/**
 * Plano efetivo (puro, sem banco): status da assinatura → plano, e o max das quatro fontes.
 *
 * STATUS → PLANO
 *  - active, trialing, past_due: plano do priceId (past_due não tem carência calculada pelo app:
 *    o Smart Retries do Stripe leva a canceled/unpaid no fim das tentativas).
 *  - incomplete, incomplete_expired, unpaid, canceled, paused, 'none' (e qualquer outro): basic.
 *  - cancelAtPeriodEnd: mantém o plano até o fim do período (o Stripe só manda canceled depois).
 *  - priceId desconhecido: log + basic.
 *
 * RESULTADO = max(legado pelo env, lançamento pelo env, cortesia vigente da linha, assinatura),
 * SEMPRE, com ou sem linha: um checkout abandonado (linha 'none') não derruba o legado.
 */
import { cortesiaAte, cortesiaCorte, lancamentoAte, precoParaPlano } from '@/lib/assinaturasConfig';
import { ehPlanoPago, RANK, type Plano } from '@/lib/planos';
import type { OrigemPlano } from '@/types/assinatura';

/** Status do Stripe que dão acesso ao plano pago. */
export const STATUS_COM_ACESSO: readonly string[] = ['active', 'trialing', 'past_due'];

/** Campos da linha `assinaturas` que o cálculo usa (subconjunto do model Assinatura). */
export interface LinhaAssinaturaPlano {
  status: string;
  stripePriceId: string | null;
  cortesiaPlano: string | null;
  cortesiaAte: Date | null;
}

/** Plano pago pela assinatura do Stripe (Basic fora de active/trialing/past_due). */
export function planoDaAssinatura(linha: LinhaAssinaturaPlano | null | undefined): Plano {
  if (!linha || !STATUS_COM_ACESSO.includes(linha.status)) return 'basic';
  const preco = precoParaPlano(linha.stripePriceId);
  if (!preco) {
    console.warn(
      `[assinaturas] priceId desconhecido (${linha.stripePriceId ?? 'vazio'}) com status ${linha.status}: tratado como Basic`,
    );
    return 'basic';
  }
  return preco.plano;
}

/** Cortesia manual da linha ainda vigente em `agora` (cortesiaAte NULL = sem data). */
export function cortesiaVigente(
  linha: LinhaAssinaturaPlano | null | undefined,
  agora: Date,
): Plano | null {
  if (!linha || !ehPlanoPago(linha.cortesiaPlano)) return null;
  if (linha.cortesiaAte && agora.getTime() >= linha.cortesiaAte.getTime()) return null;
  return linha.cortesiaPlano;
}

/** Legado: criado antes do corte (15/11/2026) e antes de ASSINATURAS_CORTESIA_ATE (ausente = sem data). */
export function legadoVigente(createdAt: Date, agora: Date): boolean {
  if (createdAt.getTime() >= cortesiaCorte().getTime()) return false;
  const ate = cortesiaAte();
  return ate === null || agora.getTime() < ate.getTime();
}

/** Lançamento: criado no corte ou depois e antes de ASSINATURAS_LANCAMENTO_ATE (ausente = não há). */
export function lancamentoVigente(createdAt: Date, agora: Date): boolean {
  if (createdAt.getTime() < cortesiaCorte().getTime()) return false;
  const ate = lancamentoAte();
  return ate !== null && agora.getTime() < ate.getTime();
}

export interface PlanoEfetivoEntrada {
  /** User.createdAt. */
  createdAt: Date;
  /** Linha `assinaturas` do usuário, ou null se não houver. */
  assinatura: LinhaAssinaturaPlano | null;
  agora: Date;
}

export interface PlanoEfetivoResultado {
  plano: Plano;
  origem: Extract<OrigemPlano, 'assinatura' | 'cortesia' | 'legado' | 'lancamento' | 'basic'>;
  /** Plano pago pela assinatura (independente do efetivo). */
  planoAssinatura: Plano;
  /** Fim do acesso gratuito que venceu (cortesia/legado/lançamento); null = sem data ou n/a. */
  acessoAte: Date | null;
}

/**
 * max(legado, lançamento, cortesia, assinatura). Empate: assinatura > cortesia > legado >
 * lançamento (quem paga aparece como 'assinatura').
 */
export function planoEfetivo({
  createdAt,
  assinatura,
  agora,
}: PlanoEfetivoEntrada): PlanoEfetivoResultado {
  const planoAssinatura = planoDaAssinatura(assinatura);
  const candidatos: Array<{
    plano: Plano;
    origem: PlanoEfetivoResultado['origem'];
    acessoAte: Date | null;
  }> = [];
  if (planoAssinatura !== 'basic') {
    candidatos.push({ plano: planoAssinatura, origem: 'assinatura', acessoAte: null });
  }
  const cortesia = cortesiaVigente(assinatura, agora);
  if (cortesia) {
    candidatos.push({
      plano: cortesia,
      origem: 'cortesia',
      acessoAte: assinatura?.cortesiaAte ?? null,
    });
  }
  if (legadoVigente(createdAt, agora)) {
    candidatos.push({ plano: 'adv', origem: 'legado', acessoAte: cortesiaAte() });
  }
  if (lancamentoVigente(createdAt, agora)) {
    candidatos.push({ plano: 'adv', origem: 'lancamento', acessoAte: lancamentoAte() });
  }

  let melhor: (typeof candidatos)[number] = { plano: 'basic', origem: 'basic', acessoAte: null };
  for (const c of candidatos) {
    // Estritamente maior: no empate fica o primeiro da ordem de prioridade acima.
    if (RANK[c.plano] > RANK[melhor.plano]) melhor = c;
  }
  return { ...melhor, planoAssinatura };
}
