/**
 * Gate da Análise de Ativos (flag + beta), para PÁGINA e API (decisão 10).
 *
 * - Flag ANALISE_ATIVOS_HABILITADA desligada → 'desligada' (página 404 pelo notFound() do layout;
 *   API 404; config com habilitada=false).
 * - Ligada e ANALISE_ATIVOS_ACESSO='todos' → 'liberada' para todo usuário logado.
 * - Ligada e 'beta' (padrão) → 'liberada' só para admin ou quem está em feature_beta_users
 *   (recurso 'analise-ativos'); senão 'fora_do_beta' (página mostra "Área em beta fechado"; API 404).
 *
 * O acesso é decidido pelo usuário LOGADO (payload.id) — o consultor agindo pelo cliente entra
 * pelo beta DELE. Role e beta saem numa query só, com cache de 60 s por userId.
 *
 * Bloco D (decisão 15): cada recurso (Raio-X, Cenários, Comparador) tem flag própria e só vale com
 * a área liberada para o usuário: recursosLiberados(userId) alimenta ConfigResposta.recursos e
 * exigirRecursoAnalise(request, recurso) protege as rotas do recurso (404 com a flag desligada).
 *
 * Bloco 1 (desenho.json, flags_e_ativacao): salvos, alertas e pdfComparador entram no mesmo
 * mecanismo, com DEPENDÊNCIAS aplicadas aqui (FLAG_RECURSO): alertas exige SALVOS e pdfComparador
 * exige COMPARADOR. exigirRecursosAnalise(request, ['salvos','comparador']) exige todos (rotas de
 * comparações salvas). Listas/filtros/comparações/avisos são PESSOAIS: a rota usa payload.id e,
 * com actingClient, devolve vazio (podeSalvar=false) ou 403 (MENSAGEM_LISTAS_PESSOAIS, contrato).
 */
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTtlCache } from '@/lib/simpleTtlCache';
import {
  analiseAtivosAcesso,
  analiseAtivosAlertasHabilitado,
  analiseAtivosCenariosHabilitado,
  analiseAtivosComparadorHabilitado,
  analiseAtivosHabilitada,
  analiseAtivosPdfHabilitado,
  analiseAtivosRaioXHabilitado,
  analiseAtivosSalvosHabilitado,
} from '@/lib/analiseAtivosConfig';
import { ApiError } from '@/utils/apiErrorHandler';
import { requireAuthWithActing, type AuthWithActingResult } from '@/utils/auth';
import type { EstadoAcessoAnalise, RecursosBlocoD } from '@/types/analiseAtivosApi';

export const RECURSO_BETA = 'analise-ativos';
export const TTL_ACESSO_MS = 60_000;
export const MENSAGEM_SEM_ACESSO = 'Recurso não disponível';

interface PerfilAcesso {
  admin: boolean;
  beta: boolean;
}

const cache = getTtlCache<PerfilAcesso>('analiseAcesso');

async function perfilAcesso(userId: string): Promise<PerfilAcesso> {
  const emCache = cache.get(userId);
  if (emCache) return emCache;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      featureBetas: { where: { recurso: RECURSO_BETA }, select: { id: true }, take: 1 },
    },
  });
  const perfil: PerfilAcesso = {
    admin: user?.role === 'admin',
    beta: (user?.featureBetas.length ?? 0) > 0,
  };
  cache.set(userId, perfil, TTL_ACESSO_MS);
  return perfil;
}

/** Esquece o cache de um usuário (script de beta, testes). */
export function limparCacheAcessoAnalise(userId: string): void {
  cache.del(userId);
}

export async function estadoAcessoAnalise(userId: string): Promise<EstadoAcessoAnalise> {
  if (!analiseAtivosHabilitada()) return 'desligada';
  if (analiseAtivosAcesso() === 'todos') return 'liberada';
  const perfil = await perfilAcesso(userId);
  return perfil.admin || perfil.beta ? 'liberada' : 'fora_do_beta';
}

export async function podeAcessarAnaliseAtivos(userId: string): Promise<boolean> {
  return (await estadoAcessoAnalise(userId)) === 'liberada';
}

/**
 * Para TODA rota /api/analise-ativos/* (exceto /config): flag desligada → 404 antes de olhar a
 * sessão; sem sessão → 401; sem acesso (decidido por payload.id) → 404 'Recurso não disponível'.
 * Devolve o contexto de requireAuthWithActing (targetUserId = cliente quando consultor age).
 */
export async function exigirAcessoAnalise(request: NextRequest): Promise<AuthWithActingResult> {
  if (!analiseAtivosHabilitada()) throw new ApiError(404, MENSAGEM_SEM_ACESSO);
  const auth = await requireAuthWithActing(request);
  if (!(await podeAcessarAnaliseAtivos(auth.payload.id))) {
    throw new ApiError(404, MENSAGEM_SEM_ACESSO);
  }
  return auth;
}

// ---------------------------------------------------------------------------
// Bloco D — recursos com flag própria
// ---------------------------------------------------------------------------

/** Recursos do Bloco D e do bloco 1, cada um com a sua flag (decisão 15). */
export type RecursoBlocoD = keyof RecursosBlocoD;

/**
 * Flag de cada recurso JÁ com as dependências (bloco 1): alertas só com SALVOS; pdfComparador só
 * com COMPARADOR. Assim recursosLiberados e exigirRecursoAnalise nunca divergem.
 */
const FLAG_RECURSO: Record<RecursoBlocoD, () => boolean> = {
  raioX: analiseAtivosRaioXHabilitado,
  cenarios: analiseAtivosCenariosHabilitado,
  comparador: analiseAtivosComparadorHabilitado,
  salvos: analiseAtivosSalvosHabilitado,
  alertas: () => analiseAtivosAlertasHabilitado() && analiseAtivosSalvosHabilitado(),
  pdfComparador: () => analiseAtivosPdfHabilitado() && analiseAtivosComparadorHabilitado(),
};

/** Monta o objeto de recursos a partir de uma função por recurso (ordem fixa, tipada). */
function porRecurso(fn: (r: RecursoBlocoD) => boolean): RecursosBlocoD {
  return {
    raioX: fn('raioX'),
    cenarios: fn('cenarios'),
    comparador: fn('comparador'),
    salvos: fn('salvos'),
    alertas: fn('alertas'),
    pdfComparador: fn('pdfComparador'),
  };
}

/** Flags (com dependências) lidas sem olhar o usuário (o estado da área entra em recursosLiberados). */
export function flagsRecursosBlocoD(): RecursosBlocoD {
  return porRecurso((r) => FLAG_RECURSO[r]());
}

/**
 * Recursos ligados para o usuário: flag && estado 'liberada'. Recebe o estado já calculado (a rota
 * /config já o tem) para não repetir a consulta; sem ele, calcula. Com todas as flags desligadas
 * não consulta o banco.
 */
export async function recursosLiberados(
  userId: string,
  estado?: EstadoAcessoAnalise,
): Promise<RecursosBlocoD> {
  const flags = flagsRecursosBlocoD();
  if (!Object.values(flags).some(Boolean)) return flags;
  const liberada = (estado ?? (await estadoAcessoAnalise(userId))) === 'liberada';
  return porRecurso((r) => liberada && flags[r]);
}

/**
 * Para as rotas do Bloco D: exigirAcessoAnalise (área desligada → 404; sem sessão → 401; sem acesso
 * → 404) e, com a flag do recurso desligada, 404 MENSAGEM_SEM_ACESSO — ANTES de olhar a sessão,
 * como a flag da área. Devolve o mesmo AuthWithActingResult (targetUserId = cliente quando o
 * consultor age; os cenários usam SEMPRE payload.id para o salvo).
 */
export async function exigirRecursoAnalise(
  request: NextRequest,
  recurso: RecursoBlocoD,
): Promise<AuthWithActingResult> {
  if (!analiseAtivosHabilitada() || !FLAG_RECURSO[recurso]()) {
    throw new ApiError(404, MENSAGEM_SEM_ACESSO);
  }
  return exigirAcessoAnalise(request);
}

/**
 * Bloco 1: como exigirRecursoAnalise, mas exige TODOS os recursos (ex.: ['salvos','comparador']
 * nas comparações salvas; ['pdfComparador'] já inclui o comparador). Qualquer flag desligada →
 * 404 antes da sessão.
 */
export async function exigirRecursosAnalise(
  request: NextRequest,
  recursos: readonly RecursoBlocoD[],
): Promise<AuthWithActingResult> {
  if (!analiseAtivosHabilitada() || recursos.some((r) => !FLAG_RECURSO[r]())) {
    throw new ApiError(404, MENSAGEM_SEM_ACESSO);
  }
  return exigirAcessoAnalise(request);
}
