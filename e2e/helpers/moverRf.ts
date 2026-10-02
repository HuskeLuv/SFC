import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { apiDelete, apiPost } from './api';

/**
 * Apoio dos e2e do mover da FASE 2 (Reservas + Renda Fixa).
 *
 * A chave MOVER_CAIXA_RF_HABILITADO é do SERVIDOR (env lida em runtime, sem NEXT_PUBLIC). O
 * Playwright não tem como perguntar ao servidor; os testes leem a MESMA variável no ambiente em
 * que rodam. Para testar ligada: `MOVER_CAIXA_RF_HABILITADO=true npm run dev -- -p <porta>` e
 * `MOVER_CAIXA_RF_HABILITADO=true PLAYWRIGHT_PORT=<porta> npx playwright test …` (o webServer do
 * playwright.config herda o ambiente quando é ele quem sobe o servidor). O CI não liga a chave:
 * os testes que dependem dela pulam e os de "desligada" garantem que nada mudou.
 */
export const moverCaixaRfLigado = (): boolean => process.env.MOVER_CAIXA_RF_HABILITADO === 'true';

export const isMoverPost = (r: Response) =>
  r.url().endsWith('/api/carteira/mover') && r.request().method() === 'POST';

/** Primeira instituição ativa (o wizard exige uma; o seed carrega a lista do Bacen). */
async function instituicaoId(page: Page): Promise<string> {
  const res = await page.request.get('/api/institutions?limit=1');
  expect(res.ok(), 'GET /api/institutions').toBeTruthy();
  const body = (await res.json()) as { institutions?: { id: string }[] };
  const id = body.institutions?.[0]?.id;
  if (!id) throw new Error('nenhuma instituição ativa no banco');
  return id;
}

/** dd/mm/aaaa (UTC) — como as tabelas mostram o vencimento. */
export const dataBR = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

export interface CdbFixture {
  nome: string;
  vencimento: string;
}

/**
 * CDB pós-fixado (110% do CDI, sem liquidez diária) criado pela API de operação, como o wizard.
 * Cai na Renda Fixa › Pós-fixada. Sem `usarCaixa`: não mexe no Caixa para Investir.
 */
export async function criarCdbPos(page: Page, nome: string): Promise<CdbFixture> {
  const vencimento = '2030-01-15';
  await apiPost(page, '/api/carteira/operacao', {
    tipoAtivo: 'renda-fixa-posfixada',
    instituicaoId: await instituicaoId(page),
    rendaFixaTipo: 'CDB_PRE',
    rendaFixaIndexer: 'CDI',
    taxaJurosAnual: 110,
    dataInicio: '2026-09-01',
    dataVencimento: vencimento,
    valorAplicado: 1000,
    descricao: nome,
  });
  return { nome, vencimento };
}

/**
 * Conta corrente informada na Reserva de Emergência (saldo sem título). O nome do ativo vira
 * "Conta Corrente (Reserva Emergência) - <instituicao> - R$ 500 - dd/mm/aaaa": `nome` vai no
 * campo `instituicao` para a linha ser achada pelo texto.
 */
export async function criarContaCorrenteEmergencia(page: Page, nome: string): Promise<void> {
  await apiPost(page, '/api/carteira/operacao', {
    tipoAtivo: 'conta-corrente',
    instituicaoId: await instituicaoId(page),
    instituicao: nome,
    contaCorrenteDestino: 'reserva-emergencia',
    dataInicio: '2026-09-01',
    valorAplicado: 500,
  });
}

/** id do Portfolio pela linha de uma aba (`data-mover-linha` ou o link do nome). */
export async function portfolioIdNaAba(
  page: Page,
  nome: string,
  escopo?: Locator,
): Promise<string | null> {
  // No cartão do celular o link é "Ver detalhes do ativo" (sem o nome): procura dentro dele.
  const link = escopo
    ? escopo.locator(`a[href^="/ativos/"]`).first()
    : page.locator(`a[href^="/ativos/"]`).filter({ hasText: nome }).first();
  if ((await link.count()) === 0) return null;
  const href = await link.getAttribute('href');
  return href?.replace(/^\/ativos\//, '').split(/[/?#]/)[0] ?? null;
}

/** Apaga a posição criada pelo teste (mesma rota do "Excluir" da página do ativo). */
export async function apagarPosicao(page: Page, portfolioId: string): Promise<void> {
  await apiDelete(page, `/api/ativos/${portfolioId}/portfolio`);
}

/** Desfaz, do mais novo para o mais antigo, os itens do Histórico gravados pelo teste. */
export async function desfazerTudo(
  page: Page,
  historico: readonly string[],
  anotar: (msg: string) => void,
): Promise<void> {
  for (const id of [...historico].reverse()) {
    await apiPost(page, `/api/historico-alteracoes/${id}/undo`, {}).catch((e: unknown) =>
      anotar(String(e)),
    );
  }
}

/** Guarda o `historicoId` de cada POST /mover que deu certo (para o Desfazer no fim). */
export function gravarHistoricoMover(page: Page, historico: string[]) {
  page.on('response', async (r) => {
    if (!isMoverPost(r) || !r.ok()) return;
    const body = (await r.json().catch(() => null)) as { historicoId?: string | null } | null;
    if (body?.historicoId) historico.push(body.historicoId);
  });
}
