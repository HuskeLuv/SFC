import { test, expect, type Locator, type Page } from '@playwright/test';
import { expectFitsWithoutClip, openCarteiraTab, waitCarteiraReady } from './helpers/mobileFit';
import { DEFAULT_READY_SELECTOR, DYNAMIC_ROUTES } from './helpers/routes';
import { waitForContent } from './helpers/waitForContent';

/**
 * PWA fase 1, fatia D (projeto `mobile`): wizards de cadastro e resgate, /ativos/{id} e /editar.
 *
 * REGRA: nenhum teste grava nada. O cadastro para na etapa `data-mf-step="info"` (com Conta
 * Corrente, que não tem autoSubmit) e o resgate na de informações; os dois fecham pelo X. A edição
 * do ativo só abre e cancela o sheet.
 */
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent =
      '.tsqd-parent-container, .tsqd-open-btn-container, nextjs-portal { display: none !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
    } catch {
      // sem storage: o aviso de cookies aparece, mas não cobre o wizard (tela cheia)
    }
  });
});

const footerOf = (page: Page) => page.locator('[data-mf-wizard-footer]');

/** O rodapé do wizard inteiro dentro da janela visível. */
async function expectInViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const vp = page.viewportSize()!;
  expect(box, 'rodapé sem caixa').not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
}

async function openLaunch(page: Page, name: RegExp) {
  await page.goto('/carteira');
  await waitCarteiraReady(page);
  await page.getByRole('button', { name: 'Lançar' }).click();
  const sheet = page.getByRole('dialog', { name: 'O que você quer lançar?' });
  await sheet.getByRole('link', { name }).click();
}

/** Cadastro até a etapa de informações (Conta Corrente: 4 etapas). Nunca avança dali. */
async function cadastroAteInfo(page: Page) {
  await openLaunch(page, /Novo investimento/);
  const wizard = page.getByRole('dialog', { name: 'Adicionar Ativo à Carteira' });
  await expect(wizard).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-mf-tabbar]')).toBeHidden();

  const operacao = wizard.getByRole('radiogroup', { name: 'Operação' });
  await expect(operacao.getByRole('radio', { name: /Adicionar investimento/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await wizard.getByRole('radio', { name: 'Conta Corrente' }).click();
  const progress = wizard.getByRole('progressbar');
  await expect(progress).toHaveAttribute('aria-valuemax', '4');

  const footer = footerOf(page);
  await footer.getByRole('button', { name: 'Avançar' }).click();
  const instStep = wizard.locator('[data-mf-step="institution"]');
  await expect(instStep).toBeVisible();
  await instStep.locator('#instituicao').click();
  const firstOption = instStep.locator('button').first();
  const hasOption = await firstOption
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!hasOption) {
    test.info().annotations.push({
      type: 'sem instituições',
      description: 'a busca de instituições não devolveu opções neste banco',
    });
    return { wizard, reached: false };
  }
  await firstOption.click();
  await footer.getByRole('button', { name: 'Avançar' }).click();
  await expect(wizard.locator('[data-mf-step="info"]')).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuenow', '3');
  return { wizard, reached: true };
}

async function fecharWizard(wizard: Locator) {
  await wizard.getByRole('button', { name: 'Fechar sidebar' }).click();
  await expect(wizard).toBeHidden();
}

test('cadastro: uma etapa por tela, rodapé no viewport, teclado e data nativos', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { wizard, reached } = await cadastroAteInfo(page);
  test.skip(!reached, 'sem instituição para escolher');

  const info = wizard.locator('[data-mf-step="info"]');
  await expectInViewport(page, footerOf(page));
  await expect(info.locator('input[inputmode="decimal"]').first()).toBeVisible();
  await expect(info.locator('input[type="date"]').first()).toBeVisible();
  await expect(page.locator('[data-mf-tabbar]')).toBeHidden();
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(390);
  if (!process.env.CI) {
    await page.screenshot({ path: test.info().outputPath('cadastro-info.png') });
  }
  await fecharWizard(wizard);
});

test.describe('altura reduzida', () => {
  test.use({ viewport: { width: 390, height: 500 } });

  test('cadastro a 390x500: o rodapé continua visível', async ({ page }) => {
    test.setTimeout(180_000);
    const { wizard, reached } = await cadastroAteInfo(page);
    test.skip(!reached, 'sem instituição para escolher');
    await expectInViewport(page, footerOf(page));
    await expect(footerOf(page).getByRole('button', { name: 'Voltar' })).toBeInViewport();
    await fecharWizard(wizard);
  });
});

test('resgate: acima da posição mostra o limite e trava o Avançar', async ({ page }) => {
  test.setTimeout(180_000);
  await openLaunch(page, /Resgatar investimento/);
  const wizard = page.getByRole('dialog', { name: 'Resgatar Investimento' });
  await expect(wizard).toBeVisible({ timeout: 60_000 });
  await expect(wizard.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '5');

  const select = wizard.locator('[data-mf-step="asset-type"] select').first();
  const hasTipos = await page
    .waitForFunction(
      (el) =>
        (el as HTMLSelectElement | null)?.querySelectorAll('option[value]:not([value=""])').length,
      await select.elementHandle(),
      { timeout: 30_000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!hasTipos) {
    await fecharWizard(wizard);
    test.skip(true, 'usuário sem posição para resgatar');
  }
  const values = await select
    .locator('option')
    .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  const tipo = ['acao', 'fii', 'etf', 'bdr'].find((v) => values.includes(v));
  if (!tipo) {
    await fecharWizard(wizard);
    test.skip(true, 'sem posição resgatável por quantidade');
  }
  await select.selectOption(tipo!);
  const next = footerOf(page).getByRole('button', { name: 'Avançar' });
  await next.click();

  const inst = wizard.locator('[data-mf-step="institution"]');
  await inst.locator('#instituicao').click();
  await inst.locator('button').first().click({ timeout: 30_000 });
  await next.click();
  const asset = wizard.locator('[data-mf-step="asset"]');
  await asset.locator('input').first().click();
  await asset.locator('button').first().click({ timeout: 30_000 });
  await next.click();

  const info = wizard.locator('[data-mf-step="info"]');
  await expect(info).toBeVisible();
  await expect(info.locator('input[type="date"]')).toBeVisible();
  const qtd = info.locator('#quantidade');
  await qtd.fill('999999999');
  await expect(qtd).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await qtd.getAttribute('aria-describedby');
  await expect(page.locator(`#${describedBy}`)).toContainText(/Você tem .* Use até/);
  await expect(next).toBeDisabled();
  await expect(info.getByRole('button', { name: /^Tudo/ })).toBeVisible();
  await fecharWizard(wizard);
});

test('/ativos/{id} e /editar cabem sem rolagem lateral', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/carteira');
  await waitCarteiraReady(page);
  const dyn = DYNAMIC_ROUTES.find((r) => r.name === '/ativos/{id}')!;
  let href: string | null = null;
  for (const name of dyn.reveal ?? []) {
    const btn = page.getByRole('button', { name, exact: true }).first();
    if ((await btn.count()) === 0) continue;
    await openCarteiraTab(page, name);
    href = await page
      .locator(dyn.linkSelector)
      .first()
      .getAttribute('href', { timeout: 2_000 })
      .catch(() => null);
    if (!href && dyn.expand) {
      const toggle = page.locator(dyn.expand).first();
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
        href = await page
          .locator(dyn.linkSelector)
          .first()
          .getAttribute('href', { timeout: 5_000 })
          .catch(() => null);
      }
    }
    if (href) break;
  }
  test.skip(!href, `sem link ${dyn.linkSelector} na /carteira (usuário sem ativos)`);
  const base = href!.split('?')[0].replace(/\/$/, '');

  await waitForContent(page, base, { readySelector: DEFAULT_READY_SELECTOR });
  await expect(page.locator('[data-mf-ativo-hero]')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar' })).toBeVisible();
  await expectFitsWithoutClip(page, 'ativo');

  await waitForContent(page, `${base}/editar`, { readySelector: DEFAULT_READY_SELECTOR });
  await expectFitsWithoutClip(page, 'ativo-editar');
  // Edição por sheet: abre e CANCELA (nada é gravado).
  const editar = page.locator('[data-mf-edit]').first();
  if (await editar.count()) {
    await editar.click();
    const sheet = page.getByRole('dialog', { name: /^Editar/ });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Cancelar' }).click();
    await expect(sheet).toBeHidden();
  }
});
