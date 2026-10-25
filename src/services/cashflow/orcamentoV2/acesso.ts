/**
 * Gate do Orçamento v2 (flag + beta + ativação), desenho técnico §8. Copia o padrão de
 * acessoAnalise.ts, com duas diferenças deliberadas:
 *
 * - Decide pelo DONO DOS DADOS (targetUserId), não por quem está logado (Q1): o consultor agindo
 *   pelo cliente vê o v2 se o CLIENTE estiver no beta, porque a estrutura (Gerais, orçados) é dele.
 * - Admin NÃO entra automaticamente: só a lista feature_beta_users (recurso 'orcamento-v2').
 *
 * Estados:
 * - ORCAMENTO_V2_HABILITADO desligada → 'desligada' (sem consultar o banco; ativado=false);
 * - ligada e ORCAMENTO_V2_ACESSO='todos' → 'liberada' para todos;
 * - ligada e 'beta' (padrão) → 'liberada' só para quem está na lista; senão 'fora_do_beta'.
 *
 * `ativado` = CashflowOrcamentoPrefs.estruturaCriadaEm preenchido (a ativação cria as Gerais e copia
 * os orçados antigos). A tela v2 só aparece com `liberada && ativado`. Beta e ativação saem numa
 * query só, com cache de 60 s por userId (o script de beta roda em outro processo: a mudança vale em
 * até 1 minuto, sem reiniciar).
 */
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTtlCache } from '@/lib/simpleTtlCache';
import { orcamentoV2Acesso, orcamentoV2Habilitado } from '@/lib/orcamentoV2Config';
import { ApiError } from '@/utils/apiErrorHandler';
import { requireAuthWithActing, type AuthWithActingResult } from '@/utils/auth';

export const RECURSO_ORCAMENTO_V2 = 'orcamento-v2';
export const TTL_ACESSO_MS = 60_000;
export const MENSAGEM_SEM_ACESSO = 'Recurso não disponível';

export type EstadoOrcamentoV2 = 'desligada' | 'fora_do_beta' | 'liberada';

export interface AcessoOrcamentoV2 {
  estado: EstadoOrcamentoV2;
  ativado: boolean;
}

interface PerfilOrcamentoV2 {
  beta: boolean;
  ativado: boolean;
}

const cache = getTtlCache<PerfilOrcamentoV2>('orcamentoV2Acesso');

async function perfilOrcamentoV2(userId: string): Promise<PerfilOrcamentoV2> {
  const emCache = cache.get(userId);
  if (emCache) return emCache;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      featureBetas: { where: { recurso: RECURSO_ORCAMENTO_V2 }, select: { id: true }, take: 1 },
      cashflowOrcamentoPrefs: { select: { estruturaCriadaEm: true } },
    },
  });
  const perfil: PerfilOrcamentoV2 = {
    beta: (user?.featureBetas.length ?? 0) > 0,
    ativado: user?.cashflowOrcamentoPrefs?.estruturaCriadaEm != null,
  };
  cache.set(userId, perfil, TTL_ACESSO_MS);
  return perfil;
}

/** Esquece o cache de um usuário (ativação/desativação no servidor, testes). */
export function limparCacheAcessoOrcamentoV2(userId: string): void {
  cache.del(userId);
}

/** Estado do v2 para o dono dos dados (`userId` = targetUserId). */
export async function estadoAcessoOrcamentoV2(userId: string): Promise<AcessoOrcamentoV2> {
  if (!orcamentoV2Habilitado()) return { estado: 'desligada', ativado: false };
  const perfil = await perfilOrcamentoV2(userId);
  const liberada = orcamentoV2Acesso() === 'todos' || perfil.beta;
  return { estado: liberada ? 'liberada' : 'fora_do_beta', ativado: perfil.ativado };
}

/**
 * Para as rotas /api/cashflow/orcamento/v2/* (exceto /acesso): flag desligada → 404 antes de olhar
 * a sessão; sem sessão → 401; não liberada para o targetUserId → 404 'Recurso não disponível'.
 * Não exige `ativado` (o POST /ativar passa por aqui). Devolve o contexto de requireAuthWithActing.
 */
export async function exigirAcessoOrcamentoV2(request: NextRequest): Promise<AuthWithActingResult> {
  if (!orcamentoV2Habilitado()) throw new ApiError(404, MENSAGEM_SEM_ACESSO);
  const auth = await requireAuthWithActing(request);
  const { estado } = await estadoAcessoOrcamentoV2(auth.targetUserId);
  if (estado !== 'liberada') throw new ApiError(404, MENSAGEM_SEM_ACESSO);
  return auth;
}
