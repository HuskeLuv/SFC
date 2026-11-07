import { ehPlano, ehPlanoPago } from '@/lib/planos';
import type { ErroLimitePlano, ErroPlanoInsuficiente } from '@/types/assinatura';

/**
 * Reconhece o corpo de 403 por plano ({ codigo: 'plano_insuficiente', need, plano }) que o gate
 * central e o exigirPlano devolvem. Só para os poucos pontos cruzados (destinos do Open Finance,
 * contexto da IA); as páginas da matriz ficam atrás do GatePlano e nem chamam essas rotas.
 */
export function ehErroPlano(body: unknown): body is ErroPlanoInsuficiente {
  if (!body || typeof body !== 'object') return false;
  const o = body as Record<string, unknown>;
  return o.codigo === 'plano_insuficiente' && ehPlanoPago(o.need) && ehPlano(o.plano);
}

/** Corpo de 403/429 por limite do plano (conexões do Open Finance, mensagens da IA). */
export function ehErroLimitePlano(body: unknown): body is ErroLimitePlano {
  if (!body || typeof body !== 'object') return false;
  const o = body as Record<string, unknown>;
  return o.codigo === 'limite_plano' && ehPlano(o.plano) && typeof o.limite === 'number';
}

/**
 * Lê o corpo de uma resposta 403 e diz se é bloqueio por plano. Usa um clone: quem chamou
 * ainda pode ler o corpo original.
 */
export async function respostaEhErroPlano(res: Response): Promise<ErroPlanoInsuficiente | null> {
  if (res.status !== 403) return null;
  try {
    const body: unknown = await res.clone().json();
    return ehErroPlano(body) ? body : null;
  } catch {
    return null;
  }
}
