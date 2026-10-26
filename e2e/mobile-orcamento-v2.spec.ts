import { test, expect, type Page } from '@playwright/test';
import { writesAllowed } from './helpers/api';
import { expectNoHorizontalOverflow } from './helpers/horizontalOverflow';
import {
  ORCAMENTO_V2_STORAGE,
  brl,
  exigirOrcamentoV2,
  gotoOrcamentoV2,
  isPutOrcado,
  prepararPagina,
  valorNovo,
} from './helpers/orcamentoV2';

/**
 * Orçamento v2 no celular (projeto `mobile`, 390 px) — e2e mínimos da E1 (desenho técnico §9,
 * PR 13; T31/M01). Usuário próprio do seed (orcamento.v2@finapp.local); pula sem a flag
 * ORCAMENTO_V2_HABILITADO. Abaixo de lg só cartões (a tabela de 860 px nunca aparece), sem
 * rolagem horizontal, e a subcategoria em DUAS linhas (nome/valores em cima, orçado embaixo).
 * Sem snapshots visuais. A edição grava em Uber (Transporte), que o seed deixa sem orçado e que o
 * "copiar" do desktop não toca.
 */

test.use({
  storageState: ORCAMENTO_V2_STORAGE,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
  await exigirOrcamentoV2(page);
});

/** Cartões carregados (o esqueleto some e as subcategorias aparecem). */
async function esperarCartoes(page: Page) {
  await expect(page.locator('[data-mf-orcamento-v2-celular]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-mf-sub-mobile]').first()).toBeVisible({ timeout: 60_000 });
}

const subMobile = (page: Page, nome: string) =>
  page.locator('[data-mf-sub-mobile]').filter({ has: page.getByText(nome, { exact: true }) });

test('390 px: cartões sem tabela, sem rolagem horizontal, sub em duas linhas', async ({ page }) => {
  await gotoOrcamentoV2(page);
  await esperarCartoes(page);

  await expect(page.locator('[data-mf-orcamento-v2-rolagem]')).toHaveCount(0);
  await expect(page.locator('[data-mf-orcamento-mobile]')).toHaveCount(0);

  // Largura FIXA do viewport (390), nunca innerWidth: com isMobile a viewport de layout estica.
  const W = page.viewportSize()!.width;
  await expectNoHorizontalOverflow(page, 'orçamento v2 (cartões)');

  // Duas linhas: o campo do orçado fica inteiro abaixo do nome.
  const linha = subMobile(page, 'Uber');
  await linha.scrollIntoViewIfNeeded();
  const nome = await linha.getByText('Uber', { exact: true }).boundingBox();
  const campo = await linha
    .getByRole('textbox', { name: 'Orçado de Uber em Transporte' })
    .boundingBox();
  expect(nome, 'nome da subcategoria').not.toBeNull();
  expect(campo, 'campo do orçado').not.toBeNull();
  expect(campo!.y, 'orçado na segunda linha').toBeGreaterThanOrEqual(nome!.y + nome!.height);
  expect(campo!.x + campo!.width, 'campo do orçado dentro da tela').toBeLessThanOrEqual(W);
});

test('editar o orçado no cartão persiste depois do reload', async ({ page }) => {
  test.skip(!writesAllowed(), 'grava no banco: só com E2E_ALLOW_WRITES=1');
  const valor = valorNovo();
  await gotoOrcamentoV2(page);
  await esperarCartoes(page);

  const campo = subMobile(page, 'Uber').getByRole('textbox', {
    name: 'Orçado de Uber em Transporte',
  });
  await campo.fill(String(valor));
  const salvo = page.waitForResponse(isPutOrcado);
  await campo.press('Enter');
  expect((await salvo).ok(), 'PUT do orçado').toBeTruthy();
  await expect(campo).toHaveValue(brl(valor));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await esperarCartoes(page);
  await expect(
    subMobile(page, 'Uber').getByRole('textbox', { name: 'Orçado de Uber em Transporte' }),
  ).toHaveValue(brl(valor));

  await expectNoHorizontalOverflow(page, 'orçamento v2 (cartões) depois da edição');
});
