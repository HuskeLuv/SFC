import { test, expect, type Page } from '@playwright/test';
import {
  expectFitsWithoutClip,
  expectInViewport,
  expectMinTarget,
  gotoMobile,
  prepareMobilePage,
} from './helpers/mobileFit';

/**
 * PWA fase 3 · fatia C — Dívidas no celular (projeto `mobile`, 390px).
 *
 * SÓ LEITURA: o cadastro abre e fecha sem salvar (o "Salvar" sem nome só mostra o erro no campo).
 * No CI o usuário do seed não tem dívida (estado vazio); no banco de dev há dívidas e os testes do
 * detalhe rodam — os que dependem de dado pulam com anotação quando a lista está vazia.
 */
test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

const cards = (page: Page) => page.locator('[data-mf-card]');

async function abrir(page: Page, width = 390, height = 844) {
  await gotoMobile(page, '/dividas', { width, height });
}

for (const [width, height] of [
  [390, 844],
  [320, 640],
] as const) {
  test(`cabe sem corte a ${width}px (lista e cadastro)`, async ({ page }) => {
    await abrir(page, width, height);
    await expectFitsWithoutClip(page, `/dividas@${width}`, { width });
    await page.getByRole('button', { name: 'Nova', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Nova dívida' })).toBeVisible();
    await expectFitsWithoutClip(page, `/dividas nova@${width}`, { width });
  });
}

test('lista em cartões (ou estado vazio) com "+ Nova"; sem a tabela do desktop', async ({
  page,
}) => {
  await abrir(page);
  await expect(page.getByRole('heading', { name: 'Dívidas', exact: true })).toBeVisible();
  const nova = page.getByRole('button', { name: 'Nova', exact: true });
  await expect(nova).toBeVisible();
  await expectMinTarget(nova);
  await expect(page.getByRole('button', { name: '+ Adicionar dívida' })).toBeHidden();
  await expect(page.locator('table')).toHaveCount(0);

  if ((await cards(page).count()) === 0) {
    await expect(page.getByText('Nenhuma dívida cadastrada')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cadastrar dívida' })).toBeVisible();
  } else {
    await expect(page.getByText('Total em aberto')).toBeVisible();
    // Prazos em chips (aria-pressed) com a contagem no nome.
    await expect(page.getByRole('button', { name: /^Todas \(\d+\)$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectMinTarget(cards(page).first());
  }
});

test('"+ Nova" abre o sheet alto; Salvar sem nome dá erro no campo; Cancelar fecha', async ({
  page,
}) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Nova', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova dívida' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radiogroup')).toHaveCount(3); // modalidade, taxa, sistema
  // O sheet sobe com animação (mf-sheet-in, 260ms): mede depois de assentar.
  await page.waitForTimeout(500);
  const salvar = dialog.getByRole('button', { name: 'Salvar', exact: true });
  await expectInViewport(salvar);
  await expectInViewport(dialog.getByRole('button', { name: 'Cancelar', exact: true }));

  // Taxa e valor com teclado decimal (aceitam vírgula).
  await expect(dialog.locator('#divida-principal')).toHaveAttribute('inputmode', 'decimal');
  await expect(dialog.locator('#divida-taxa')).toHaveAttribute('inputmode', 'decimal');
  await expect(dialog.locator('#divida-vencimento')).toHaveAttribute('type', 'month');

  await salvar.click();
  const nome = dialog.locator('#divida-nome');
  await expect(nome).toHaveAttribute('aria-invalid', 'true');
  await expect(nome).toBeFocused();
  await expect(dialog.getByRole('alert')).toHaveText('Informe o nome da dívida.');

  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toBeHidden();
});

test('detalhe: ?divida= na URL, Situação e ⋯ em sheet, voltar do sistema volta à lista', async ({
  page,
}) => {
  await abrir(page);
  const n = await cards(page).count();
  test.skip(n === 0, 'sem dívida no banco (seed do CI): o fluxo com dado está no .escrita');

  await cards(page).first().click();
  await expect(page).toHaveURL(/[?&]divida=/);
  await expect(page.getByRole('button', { name: '← Voltar' })).toBeVisible();
  await expectMinTarget(page.getByRole('button', { name: '← Voltar' }));

  await page.getByRole('button', { name: /^Situação:/ }).click();
  const situacao = page.getByRole('dialog', { name: 'Situação da dívida' });
  await expect(situacao).toBeVisible();
  await expect(situacao.getByRole('radio', { checked: true })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(situacao).toBeHidden();

  await page.getByRole('button', { name: 'Mais ações da dívida' }).click();
  const menu = page.getByRole('dialog', { name: 'Ações da dívida' });
  await expect(menu.getByRole('button', { name: /Excluir dívida/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await expectFitsWithoutClip(page, '/dividas detalhe@390', { width: 390 });

  await page.goBack();
  await expect(page).not.toHaveURL(/divida=/);
  await expect(cards(page).first()).toBeVisible();
});
