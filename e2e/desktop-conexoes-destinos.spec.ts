import { test, expect, type Page } from '@playwright/test';
import { CONEXAO_ID, ID, mockConexoesDestinos } from './helpers/destinosMock';

/**
 * Escolher o destino na importação Open Finance (fatia D) — desktop 1280, SÓ LEITURA.
 *
 * Independe da chave do servidor: o CI roda com PLUGGY_HABILITADO e PLUGGY_DESTINOS_HABILITADO
 * desligadas, e todo o /api/pluggy/* da tela (mais o Desfazer) é respondido por page.route em
 * e2e/helpers/destinosMock.ts. `comDestinos:false` reproduz o payload da chave desligada (tela
 * idêntica à de hoje); `comDestinos:true`, o da chave ligada. Nada é gravado no banco.
 *
 * O fluxo pós-conexão ("Conexão realizada" → "Escolher onde ficam") é coberto pelo RTL
 * (ConexaoRealizadaModal.destinos.test.tsx): o widget do Pluggy não roda no e2e.
 *
 * A revisão (RevisarDestinos, fatia C) é dirigida pelos nomes acessíveis do desenho: botão
 * "Destino de <ticker>: …", painel com fieldset/legend por aba e rádios por seção, "Pronto",
 * caixas "Selecionar <ticker>", barra de lote "Mover para", "Salvar N mudanças", toast com Desfazer.
 */

const ROUTE = '/conexoes-bancarias';
const REVISAO = 'Confira onde seus investimentos entraram';

test.beforeEach(async ({ page }) => {
  // O aviso de cookies (LGPD) fica fixo no rodapé e cobre o rodapé dos modais.
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
    } catch {
      // sem storage: o aviso aparece
    }
  });
});

async function gotoConexoes(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Investimentos e empréstimos do banco' }),
  ).toBeVisible({ timeout: 60_000 });
}

const tabelaInvestimentos = (page: Page) =>
  page.getByRole('table', { name: 'Investimentos importados' });

test('chave desligada: "Investimentos do banco" como hoje (sem aviso, coluna nem selo)', async ({
  page,
}) => {
  await mockConexoesDestinos(page, { comDestinos: false });
  await gotoConexoes(page);
  const tabela = tabelaInvestimentos(page);
  await expect(tabela).toBeVisible();
  await expect(tabela.getByRole('columnheader')).toHaveText([
    'Investimento',
    'Tipo',
    'Saldo no banco',
    'Situação',
    '',
  ]);
  await expect(page.getByRole('button', { name: /Conferir destinos/ })).toHaveCount(0);
  await expect(page.getByText('Novo · conferir')).toHaveCount(0);
  await expect(page.locator('[data-destinos-aviso]')).toHaveCount(0);
});

test('chave ligada: aviso "para conferir", coluna "Na Carteira em" com link e selo', async ({
  page,
}) => {
  await mockConexoesDestinos(page, { comDestinos: true });
  await gotoConexoes(page);
  const aviso = page.locator('[data-destinos-aviso]');
  await expect(aviso).toContainText('4 investimentos novos chegaram na sincronização');
  const conferir = aviso.getByRole('button', { name: 'Conferir destinos (4)' });
  const caixa = await conferir.boundingBox();
  expect(caixa!.height).toBeGreaterThanOrEqual(44);

  const tabela = tabelaInvestimentos(page);
  await expect(tabela.getByRole('columnheader', { name: 'Na Carteira em' })).toBeVisible();
  const ver = tabela.getByRole('link', { name: "Ver FII's › Tijolo na Carteira" });
  await expect(ver).toHaveAttribute('href', '/carteira?aba=fiis');
  expect((await ver.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(tabela.getByText('Novo · conferir')).toHaveCount(4);
  await expect(tabela.getByText('Já estava na Carteira')).toBeVisible();
});

/** Abre a revisão pelo aviso e espera os itens. */
async function abrirRevisao(page: Page) {
  await page.getByRole('button', { name: 'Conferir destinos (4)' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: REVISAO });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('KNCA11').first()).toBeVisible();
  return dialog;
}

/** KNCA11: FII's › Tijolo → Fundos › Fiagro pelo painel da linha. */
async function trocarKncaParaFiagro(page: Page) {
  const dialog = page.getByRole('dialog').filter({ hasText: REVISAO });
  await dialog.getByRole('button', { name: /^Destino de KNCA11/ }).click();
  const fundos = dialog.getByRole('group', { name: 'Fundos' });
  await fundos.getByRole('radio', { name: 'Fiagro' }).check();
  await dialog.getByRole('button', { name: 'Pronto' }).click();
}

test('revisão: painel + lote → "Salvar 3 mudanças" → corpo do POST → toast → Desfazer', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const mock = await mockConexoesDestinos(page, { comDestinos: true });
  await gotoConexoes(page);
  const dialog = await abrirRevisao(page);

  // A revisão pede só os novos (sem connectionId).
  await trocarKncaParaFiagro(page);

  // Lote: as 2 ações para Growth (só destinos aceitos por todos os marcados).
  await dialog.getByRole('checkbox', { name: 'Selecionar PETR4' }).check();
  await dialog.getByRole('checkbox', { name: 'Selecionar ITSA4' }).check();
  await dialog
    .getByRole('combobox', { name: /Mover para/ })
    .selectOption({ label: 'Ações › Growth' });
  await dialog.getByRole('button', { name: 'Aplicar' }).click();

  const salvar = dialog.getByRole('button', { name: 'Salvar 3 mudanças' });
  await expect(salvar).toBeEnabled();
  const post = page.waitForRequest(
    (r) => r.url().endsWith('/api/pluggy/carteira/destinos') && r.method() === 'POST',
  );
  await salvar.click();
  await post;

  const corpo = mock.posts[0] as {
    itens: { id: string; categoria: string; subgrupo?: string }[];
    confirmarIds: string[];
  };
  expect(corpo.itens).toHaveLength(3);
  expect(corpo.itens).toEqual(
    expect.arrayContaining([
      { id: ID.knca, categoria: 'fimFia', subgrupo: 'fiagro' },
      { id: ID.petr, categoria: 'acoes', subgrupo: 'growth' },
      { id: ID.itsa, categoria: 'acoes', subgrupo: 'growth' },
    ]),
  );
  // confirmarIds = todos os para conferir EXIBIDOS (inclusive o CDB mantido), nunca os fixos.
  expect([...corpo.confirmarIds].sort()).toEqual([ID.cdb, ID.itsa, ID.knca, ID.petr].sort());

  const toast = page.getByRole('status').filter({ hasText: '3 investimentos mudaram de lugar' });
  await expect(toast).toBeVisible();
  // Depois de salvar, o aviso some (a carteira volta sem pendências).
  await expect(page.locator('[data-destinos-aviso]')).toHaveCount(0);

  await toast.getByRole('button', { name: 'Desfazer' }).click();
  await expect.poll(() => mock.undos.length).toBe(3);
  // Ordem reversa dos historicoIds.
  expect(mock.undos).toEqual(['hist-e2e-3', 'hist-e2e-2', 'hist-e2e-1']);
});

test('revisão com 409: alerta "nada mudou" e as escolhas continuam na tela', async ({ page }) => {
  test.setTimeout(120_000);
  const mock = await mockConexoesDestinos(page, { comDestinos: true });
  mock.responderPost('409');
  await gotoConexoes(page);
  const dialog = await abrirRevisao(page);
  await trocarKncaParaFiagro(page);
  const salvar = dialog.getByRole('button', { name: 'Salvar 1 mudança' });
  await salvar.click();
  const alerta = dialog.getByRole('alert');
  await expect(alerta).toContainText('Nenhum investimento mudou de lugar');
  await expect(alerta).toContainText(
    'Este investimento já foi conferido ou não está mais na Carteira',
  );
  // A escolha foi preservada e o primário segue ativo para tentar de novo.
  await expect(
    dialog.getByRole('button', { name: /^Destino de KNCA11: Fundos, Fiagro/ }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Salvar 1 mudança' })).toBeEnabled();
  // A revisão aberta por Conexões não manda connectionId.
  expect(mock.posts).toHaveLength(1);
  expect(JSON.stringify(mock.posts[0])).not.toContain(CONEXAO_ID);
});
