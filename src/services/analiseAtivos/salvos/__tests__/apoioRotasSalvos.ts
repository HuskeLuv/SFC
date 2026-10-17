/**
 * Apoio dos testes de ROTA do bloco 1 (fatia A): o banco falso de salvos (fakeSalvosPrisma) +
 * o que o caminho real da rota lê (linhas do Quadro de linhasDb.ts, criteria_params v1, perfil do
 * usuário para o beta, tabelas do Comparador vazias), as flags do bloco 1 e requisições prontas.
 * Não é arquivo de teste (sem .test.).
 */
import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { GERADO_EM_FIXTURE, LINHAS_FIXTURE } from '@/test/fixtures/analiseAtivos/linhasDb';
import { criarFakeSalvos, type FakeSalvos } from './fakeSalvosPrisma';

export const BASE = 'http://localhost/api/analise-ativos';

/** Banco falso completo para as rotas (o perfil do usuário é admin: área liberada). */
export function criarBancoRotas(): FakeSalvos {
  const fake = criarFakeSalvos();
  Object.assign(fake.prisma, {
    user: { findUnique: async () => ({ role: 'admin', featureBetas: [] }) },
    analiseQuadroLinha: {
      aggregate: async () => ({ _max: { geradoEm: GERADO_EM_FIXTURE } }),
      findMany: async () => LINHAS_FIXTURE,
    },
    criteriaParams: {
      findFirst: async () => ({ version: 1, params: CRITERIA_PARAMS_V1 }),
      findUnique: async () => ({ version: 1, params: CRITERIA_PARAMS_V1 }),
    },
    assetMultiplesCurrent: { findMany: async () => [] },
    fiiQuarterly: { findMany: async () => [] },
    assetPerShareYearly: { findMany: async () => [] },
    fiiMonthly: { findMany: async () => [] },
  });
  return fake;
}

const FLAGS = {
  ANALISE_ATIVOS_HABILITADA: 'true',
  ANALISE_ATIVOS_ACESSO: 'beta',
  ANALISE_ATIVOS_SALVOS_HABILITADO: 'true',
  ANALISE_ATIVOS_ALERTAS_HABILITADO: 'true',
  ANALISE_ATIVOS_COMPARADOR_HABILITADO: 'true',
  ANALISE_ATIVOS_PDF_HABILITADO: 'true',
} as const;

/** Liga as flags do bloco 1 (sobrescreva uma com `desligar`). */
export function ligarFlags(desligar: Array<keyof typeof FLAGS> = []): void {
  for (const [k, v] of Object.entries(FLAGS)) {
    vi.stubEnv(k, desligar.includes(k as keyof typeof FLAGS) ? 'false' : v);
  }
}

export function requisicao(metodo: string, caminho: string, corpo?: unknown): NextRequest {
  return new NextRequest(`${BASE}${caminho}`, {
    method: metodo,
    ...(corpo === undefined
      ? {}
      : { body: JSON.stringify(corpo), headers: { 'Content-Type': 'application/json' } }),
  });
}

export function ctx<P extends Record<string, string>>(params: P): { params: Promise<P> } {
  return { params: Promise.resolve(params) };
}

export async function json(
  res: Response,
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  return { status: res.status, corpo: (await res.json()) as Record<string, unknown> };
}
