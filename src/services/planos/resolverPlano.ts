/**
 * Resolver ÚNICO do plano do usuário (Basic, Pro, Advanced).
 *
 * Até a assinatura no Stripe (ticket 86e2zkhe2) todo usuário é Advanced. Este é o único ponto a
 * trocar quando o plano real existir. Sempre o plano do dono dos dados (targetUserId), também
 * quando um consultor gera pelo cliente.
 *
 * Override de QA dos cadeados: RELATORIO_PLANO_FORCADO=basic|pro|adv vale SÓ com
 * RELATORIO_PLANO_FORCADO_PERMITIDO=1 (independe de NODE_ENV: o job e2e roda build + start).
 * As duas variáveis entram só no env do job e2e e no .env.local; nunca no app.env de prod.
 */
import { ehPlano, type Plano } from '@/lib/planos';

export {
  ACESSO_BLOCOS,
  NOME_PLANO,
  OFERTAS_PLANOS,
  RANK,
  aplicarCadeado,
  ehPlano,
  temAcesso,
  type Plano,
} from '@/lib/planos';

/** Plano de todos até o Stripe. */
export const PLANO_PADRAO: Plano = 'adv';

/** O override de QA está liberado neste processo? */
export function overridePlanoPermitido(): boolean {
  return process.env.RELATORIO_PLANO_FORCADO_PERMITIDO === '1';
}

/** Plano forçado pelo override de QA, ou null (sem PERMITIDO=1 o override é ignorado). */
export function planoForcado(): Plano | null {
  if (!overridePlanoPermitido()) return null;
  const v = process.env.RELATORIO_PLANO_FORCADO?.trim().toLowerCase();
  return ehPlano(v) ? v : null;
}

function bancoEhLocal(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * Avisa no log quando o override está ativo com um banco que não é localhost (sinal de que a
 * variável vazou para um ambiente real). Chamado no carregamento do módulo e na rota.
 */
export function avisarSeOverrideForaDoLocal(): boolean {
  const forcado = planoForcado();
  if (forcado === null || bancoEhLocal(process.env.DATABASE_URL)) return false;
  console.warn(
    `[relatorio-financeiro] RELATORIO_PLANO_FORCADO=${forcado} ativo com banco que não é localhost`,
  );
  return true;
}

avisarSeOverrideForaDoLocal();

/**
 * Plano do usuário. TODO Stripe 86e2zkhe2: ler a assinatura de `userId`.
 */
export async function planoDoUsuario(_userId: string): Promise<Plano> {
  return planoForcado() ?? PLANO_PADRAO;
}
