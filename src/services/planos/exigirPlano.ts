/**
 * Corte por plano no servidor (assinaturas, ClickUp 86e2zkhe2).
 *
 * Lança ApiError 403 com corpo { error, codigo: 'plano_insuficiente', need, plano } — as rotas
 * sob withErrorHandler devolvem esse JSON. Com ASSINATURAS_HABILITADAS desligada não consulta
 * nada (nem banco nem ACESSO_ROTAS) e libera tudo, como hoje — inclusive com o override de QA
 * (PLANO_FORCADO), que só muda os cadeados do relatório; para testar o corte, ligue a chave.
 *
 *  - exigirPlano(userId, need): chamada explícita (Pluggy-carteira, Análise de Ativos).
 *  - exigirPlanoRequisicao(auth, need): idem, com a regra do consultor (max cliente/consultor).
 *  - exigirPlanoDaRota(auth, pathname, method): o gate central, chamado por requireAuthWithActing.
 */
import { assinaturasHabilitadas } from '@/lib/assinaturasConfig';
import { NOME_PLANO, temAcesso, type Plano, type PlanoPago } from '@/lib/planos';
import { ApiError } from '@/utils/apiErrorHandler';
import type { ErroPlanoInsuficiente } from '@/types/assinatura';
import { planoExigidoPelaRota } from '@/services/planos/acessoRotas';
import {
  planoDoUsuario,
  planoParaRequisicao,
  type AuthPlano,
} from '@/services/planos/resolverPlano';

export const CODIGO_PLANO_INSUFICIENTE = 'plano_insuficiente' as const;

/** ApiError 403 padrão do plano insuficiente. */
export function erroPlanoInsuficiente(need: PlanoPago, plano: Plano): ApiError {
  const extra: Omit<ErroPlanoInsuficiente, 'error'> = {
    codigo: CODIGO_PLANO_INSUFICIENTE,
    need,
    plano,
  };
  return new ApiError(403, `Recurso disponível no plano ${NOME_PLANO[need]}`, undefined, extra);
}

/** Exige `need` do plano de `userId` (dono dos dados). Devolve o plano efetivo. */
export async function exigirPlano(userId: string, need: PlanoPago): Promise<Plano> {
  if (!assinaturasHabilitadas()) return 'adv';
  const plano = await planoDoUsuario(userId);
  if (!temAcesso(plano, need)) throw erroPlanoInsuficiente(need, plano);
  return plano;
}

/** Exige `need` na leitura da requisição: consultor pelo cliente = max(cliente, consultor). */
export async function exigirPlanoRequisicao(auth: AuthPlano, need: PlanoPago): Promise<Plano> {
  if (!assinaturasHabilitadas()) return 'adv';
  const plano = await planoParaRequisicao(auth);
  if (!temAcesso(plano, need)) throw erroPlanoInsuficiente(need, plano);
  return plano;
}

/**
 * Gate central por pathname (prefixo mais longo de ACESSO_ROTAS) e método. Devolve o plano
 * exigido que foi conferido, ou null quando a rota não exige nada (ou o corte está desligado).
 */
export async function exigirPlanoDaRota(
  auth: AuthPlano,
  pathname: string,
  method: string,
): Promise<PlanoPago | null> {
  if (!assinaturasHabilitadas()) return null;
  const need = planoExigidoPelaRota(pathname, method);
  if (need === null) return null;
  await exigirPlanoRequisicao(auth, need);
  return need;
}
