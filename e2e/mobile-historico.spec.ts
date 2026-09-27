import { test, expect, type Page } from '@playwright/test';
import {
  expectFitsWithoutClip,
  expectMinTarget,
  gotoMobile,
  prepareMobilePage,
} from './helpers/mobileFit';

/**
 * PWA fase 3, fatia D: Histórico de alterações no celular (projeto `mobile`, SÓ LEITURA).
 *
 * Cabe sem corte a 390 e 320, chips de seção num trilho com rolagem própria, cartões (não tabela)
 * até lg e, se houver "Desfazer", a confirmação abre em sheet e o Cancelar fecha sem gravar. A lista
 * depende do que existe no banco (no CI o seed pode não ter histórico): o vazio também vale.
 */

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

const ROUTE = '/historico-alteracoes';
const READY = 'h2:has-text("Histórico de alterações")';

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

async function gotoHistorico(page: Page, width: number) {
  await gotoMobile(page, ROUTE, {
    width,
    height: width === 320 ? 640 : 844,
    readySelector: READY,
  });
  await expect(page.locator('[data-historico-lista], [data-historico-vazio]').first()).toBeVisible({
    timeout: 60_000,
  });
}

for (const width of [390, 320]) {
  test(`Histórico @ ${width}: cabe sem corte, chips com rolagem própria e cartões`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await gotoHistorico(page, width);
    await expectFitsWithoutClip(page, `historico@${width}`, { width });

    // Título existente visível (nenhum h1 novo).
    const titulos = page.locator('h1:visible, h2:visible', { hasText: 'Histórico de alterações' });
    await expect(titulos).toHaveCount(1);
    await expect(page.locator('[data-mf-content] h1:visible')).toHaveCount(0);

    const rail = page.locator('[data-mf-scroll-x][aria-label="Filtrar por seção"]');
    await expect(rail).toBeVisible();
    const todas = rail.getByRole('button', { name: 'Todas', exact: true });
    await expect(todas).toHaveAttribute('aria-pressed', 'true');
    // Alvo do chip (::before) é do primitivo da fatia 0 (TABLE_MOBILE_STYLES.chip): medido lá.

    // Tabela do desktop fora; cartões (se houver entradas).
    await expect(page.locator('[data-historico-lista] table')).toBeHidden();
    const cards = page.locator('[data-historico-card]');
    if ((await cards.count()) > 0) {
      await expect(cards.first()).toBeVisible();
      const detalhes = cards.first().getByRole('button', { name: 'Detalhes' });
      if (await detalhes.count()) await expectMinTarget(detalhes);
    }
  });
}

test('Histórico @ 800 (tablet): cartões, não a tabela', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoHistorico(page, 800);
  await expectFitsWithoutClip(page, 'historico@800', { width: 800 });
  await expect(page.locator('[data-historico-lista] table')).toBeHidden();
  if (await page.locator('[data-historico-lista]').count()) {
    await expect(page.locator('[data-historico-card]').first()).toBeVisible();
  }
});

test('Filtro por seção troca o chip ativo e a lista (só leitura)', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoHistorico(page, 390);
  const rail = page.locator('[data-mf-scroll-x][aria-label="Filtrar por seção"]');
  const agenda = rail.getByRole('button', { name: 'Agenda', exact: true });
  await agenda.scrollIntoViewIfNeeded();
  await agenda.click();
  await expect(agenda).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-historico-lista], [data-historico-vazio]').first()).toBeVisible({
    timeout: 30_000,
  });
});

test('Desfazer abre a confirmação em sheet e Cancelar fecha sem gravar', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoHistorico(page, 390);
  const desfazer = page.locator('[data-historico-card]').getByRole('button', { name: 'Desfazer' });
  if ((await desfazer.count()) === 0) {
    test.info().annotations.push({ type: 'historico', description: 'nenhuma entrada desfazível' });
    return;
  }
  const primeiro = desfazer.first();
  await primeiro.scrollIntoViewIfNeeded();
  await expectMinTarget(primeiro);

  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/undo')) posts += 1;
  });
  await primeiro.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Desfazer esta alteração?')).toBeVisible();
  // A barra de abas some sob o sheet.
  await expect(page.locator('[data-mf-tabbar]')).toBeHidden();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  expect(posts).toBe(0);
});
