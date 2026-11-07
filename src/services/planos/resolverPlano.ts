/**
 * Resolver ÚNICO do plano do usuário (Basic, Pro, Advanced). Sempre o plano do dono dos dados
 * (targetUserId); a leitura de um consultor agindo pelo cliente usa planoParaRequisicao.
 *
 * planoDoUsuario(userId):
 *  1. planoForcado() (override de QA) vence tudo.
 *  2. ASSINATURAS_HABILITADAS desligada → 'adv' SEM tocar no banco (app idêntico ao de hoje).
 *  3. Cache Map<userId, {plano, expira}> em globalThis, TTL 60 s; invalidarPlano(userId) apaga.
 *  4. User {role, createdAt, assinatura}: role admin/consultant → 'adv'.
 *  5. max(legado, lançamento, cortesia da linha, assinatura): src/services/planos/planoEfetivo.ts.
 *
 * Override de QA dos cadeados: PLANO_FORCADO=basic|pro|adv (alias novo) ou
 * RELATORIO_PLANO_FORCADO vale SÓ com PLANO_FORCADO_PERMITIDO=1 ou
 * RELATORIO_PLANO_FORCADO_PERMITIDO=1 (independe de NODE_ENV: o job e2e roda build + start).
 * Entram só no env do job e2e e no .env.local; nunca no app.env de prod.
 */
import prisma from '@/lib/prisma';
import { assinaturasHabilitadas } from '@/lib/assinaturasConfig';
import { ehPlano, maxPlano, type Plano } from '@/lib/planos';
import type { Assinatura } from '@prisma/client';
import type { OrigemPlano } from '@/types/assinatura';
import { planoEfetivo } from '@/services/planos/planoEfetivo';

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

/** Plano de todos com ASSINATURAS_HABILITADAS desligada (como antes do Stripe). */
export const PLANO_PADRAO: Plano = 'adv';

/** O override de QA está liberado neste processo? */
export function overridePlanoPermitido(): boolean {
  return (
    process.env.PLANO_FORCADO_PERMITIDO === '1' ||
    process.env.RELATORIO_PLANO_FORCADO_PERMITIDO === '1'
  );
}

/**
 * Plano forçado pelo override de QA, ou null (sem PERMITIDO=1 o override é ignorado).
 * PLANO_FORCADO tem precedência sobre RELATORIO_PLANO_FORCADO.
 */
export function planoForcado(): Plano | null {
  if (!overridePlanoPermitido()) return null;
  for (const nome of ['PLANO_FORCADO', 'RELATORIO_PLANO_FORCADO']) {
    const v = process.env[nome]?.trim().toLowerCase();
    if (ehPlano(v)) return v;
  }
  return null;
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
    `[planos] override de QA PLANO_FORCADO=${forcado} ativo com banco que não é localhost`,
  );
  return true;
}

avisarSeOverrideForaDoLocal();

/** Validade do cache do plano por usuário. */
export const PLANO_CACHE_TTL_MS = 60_000;

type CachePlano = Map<string, { plano: Plano; expira: number }>;

const globalForPlano = globalThis as typeof globalThis & { planoCache?: CachePlano };

/** Mesmo Map para RSC e route handlers do processo (padrão do singleton do Prisma). */
function cachePlano(): CachePlano {
  if (!globalForPlano.planoCache) globalForPlano.planoCache = new Map();
  return globalForPlano.planoCache;
}

/** Apaga o plano em cache de `userId` (webhook, checkout, cortesia); sem argumento, de todos. */
export function invalidarPlano(userId?: string): void {
  if (userId === undefined) cachePlano().clear();
  else cachePlano().delete(userId);
}

export interface ResolucaoAssinatura {
  plano: Plano;
  origem: OrigemPlano;
  /** Fim do acesso gratuito que venceu (cortesia/legado/lançamento); null = sem data ou n/a. */
  acessoAte: Date | null;
  /** Plano pago pela assinatura (independente do efetivo); 'basic' sem assinatura com acesso. */
  planoAssinatura: Plano;
  /** Linha `assinaturas` do usuário (null sem linha, com a chave desligada ou plano forçado). */
  assinatura: Assinatura | null;
}

const SEM_ASSINATURA = { planoAssinatura: 'basic', assinatura: null } as const;

/**
 * Plano efetivo com a origem e a linha da assinatura (para GET /api/assinaturas/me). Sem cache:
 * sempre lê o banco (com a chave ligada) e atualiza o cache do planoDoUsuario.
 */
export async function resolverAssinatura(
  userId: string,
  opts: { agora?: Date } = {},
): Promise<ResolucaoAssinatura> {
  const forcado = planoForcado();
  if (forcado !== null) {
    return { plano: forcado, origem: 'forcado', acessoAte: null, ...SEM_ASSINATURA };
  }
  if (!assinaturasHabilitadas()) {
    return { plano: PLANO_PADRAO, origem: 'desligado', acessoAte: null, ...SEM_ASSINATURA };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, createdAt: true, assinatura: true },
  });
  let resolucao: ResolucaoAssinatura;
  if (!user) {
    resolucao = { plano: 'basic', origem: 'basic', acessoAte: null, ...SEM_ASSINATURA };
  } else if (user.role === 'admin' || user.role === 'consultant') {
    resolucao = {
      plano: 'adv',
      origem: 'consultor',
      acessoAte: null,
      planoAssinatura: 'basic',
      assinatura: user.assinatura,
    };
  } else {
    const efetivo = planoEfetivo({
      createdAt: user.createdAt,
      assinatura: user.assinatura,
      agora: opts.agora ?? new Date(),
    });
    resolucao = { ...efetivo, assinatura: user.assinatura };
  }
  cachePlano().set(userId, { plano: resolucao.plano, expira: Date.now() + PLANO_CACHE_TTL_MS });
  return resolucao;
}

/**
 * Plano efetivo do usuário (o que vale nas telas e nas rotas). Com a chave desligada devolve
 * planoForcado() ?? 'adv' sem tocar no banco. `semCache` força a leitura do banco.
 */
export async function planoDoUsuario(
  userId: string,
  opts: { agora?: Date; semCache?: boolean } = {},
): Promise<Plano> {
  const forcado = planoForcado();
  if (forcado !== null) return forcado;
  if (!assinaturasHabilitadas()) return PLANO_PADRAO;

  if (!opts.semCache) {
    const hit = cachePlano().get(userId);
    if (hit && hit.expira > Date.now()) return hit.plano;
  }
  return (await resolverAssinatura(userId, { agora: opts.agora })).plano;
}

/** O mínimo de requireAuthWithActing que o plano da requisição precisa. */
export interface AuthPlano {
  payload: { id: string };
  targetUserId: string;
}

/**
 * Plano para o gate de LEITURA da requisição: consultor agindo pelo cliente = max(plano do
 * cliente, plano do consultor) (decisão 4 de 07/11). Cotas que custam (IA, Pluggy) NÃO usam isto:
 * contam no cliente, com planoDoUsuario(targetUserId).
 */
export async function planoParaRequisicao(auth: AuthPlano): Promise<Plano> {
  const doDono = await planoDoUsuario(auth.targetUserId);
  if (auth.targetUserId === auth.payload.id) return doDono;
  return maxPlano(doDono, await planoDoUsuario(auth.payload.id));
}
