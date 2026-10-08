import { test, type Page } from '@playwright/test';

/**
 * Fixture do Bloco D da Análise de Ativos (fatia 0) para os e2e das fatias A–D.
 *
 * - CI (.github/workflows/ci.yml): liga as 3 flags (ANALISE_ATIVOS_RAIOX_HABILITADO,
 *   ANALISE_ATIVOS_COMPARADOR_HABILITADO, ANALISE_ATIVOS_CENARIOS_HABILITADO) além da área; o seed
 *   (prisma/seedAnaliseAtivos.ts) carrega as fixtures do Quadro e põe o usuário demo no beta.
 * - Local: suba o servidor com as mesmas envs; sem elas, os testes do recurso PULAM.
 *
 * Uso: `await exigirRecursoBlocoD(page, 'raioX')` no início do teste (pula com o motivo se o
 * recurso estiver desligado para o usuário logado). Os tickers abaixo existem nas fixtures do CI
 * (prisma/fixtures/analise-ativos/quadro-linhas.json); CBAV3, TAEE11 e VALE3 só no banco de dev.
 * Testes que gravam (cenário salvo, objetivo do Planejamento) vão em *.escrita.spec.ts e desfazem
 * o que gravaram.
 */

export type RecursoBlocoD = 'raioX' | 'cenarios' | 'comparador';

export const TICKERS_BLOCO_D_CI = {
  acao: 'WEGE3',
  acaoPetro: 'PETR4',
  banco: 'ITUB4',
  lpaNegativo: 'AURE3',
  fiiTijolo: 'HGLG11',
  fiiTijolo2: 'XPLG11',
  fiiPapel: 'KNCR11',
  fiiPapel2: 'MXRF11',
} as const;

/** Recursos do Bloco D ligados para o usuário logado (GET /api/analise-ativos/config). */
export async function recursosBlocoD(page: Page): Promise<Record<RecursoBlocoD, boolean>> {
  const desligado = { raioX: false, cenarios: false, comparador: false };
  const res = await page.request.get('/api/analise-ativos/config');
  if (!res.ok()) return desligado;
  const corpo = (await res.json()) as {
    habilitada?: boolean;
    recursos?: Partial<Record<RecursoBlocoD, boolean>>;
  };
  if (corpo.habilitada !== true) return desligado;
  return {
    raioX: corpo.recursos?.raioX === true,
    cenarios: corpo.recursos?.cenarios === true,
    comparador: corpo.recursos?.comparador === true,
  };
}

/** Pula o teste atual quando o recurso não está ligado para o usuário logado. */
export async function exigirRecursoBlocoD(page: Page, recurso: RecursoBlocoD): Promise<void> {
  const recursos = await recursosBlocoD(page);
  test.skip(
    !recursos[recurso],
    `Bloco D: recurso '${recurso}' desligado (ANALISE_ATIVOS_*_HABILITADO no servidor)`,
  );
}
