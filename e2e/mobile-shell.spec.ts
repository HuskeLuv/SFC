import { test, expect, type Page } from '@playwright/test';

/**
 * Casca mobile (PWA fase 0): cabeçalho compacto + barra de abas abaixo de lg.
 * Só mobile — o desktop é coberto pelo desktop-layout.spec (fatia C).
 * Usa o estado de login salvo pelo auth.setup.ts. As interações partem do Planejamento: a
 * /carteira ainda transborda na horizontal (corrigido na fatia C), o que desloca a barra fixa.
 */
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

// O botão do React Query Devtools (só em dev) fica no canto de baixo, por cima da aba Mais.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent =
      '.tsqd-parent-container, .tsqd-open-btn-container { display: none !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    // Aviso de cookies já aceito (ele fica acima da barra, mas cobriria parte do conteúdo).
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
    } catch {
      // sem storage: o aviso aparece e o teste falha de forma visível
    }
  });
});

const tabbar = (page: Page) => page.locator('[data-mf-tabbar]');
const header = (page: Page) => page.locator('[data-mf-mobile-header]');

async function waitForShell(page: Page) {
  await expect(header(page)).toBeVisible({ timeout: 30000 });
  await expect(tabbar(page)).toBeVisible();
}

for (const route of ['/carteira', '/fluxodecaixa', '/planejamento-financeiro', '/dividas']) {
  test(`casca em ${route}: header e barra visíveis, título descoberto, fim alcançável`, async ({
    page,
  }) => {
    await page.goto(route);
    await waitForShell(page);
    await expect(page.getByRole('button', { name: 'Abrir menu', exact: true })).toHaveCount(0);

    // O primeiro título da página não fica coberto por nada da casca.
    const heading = page.locator('h1:visible, h2:visible, h3:visible').first();
    await expect(heading).toBeVisible({ timeout: 30000 });
    const covered = await heading.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + Math.min(r.width / 2, 40),
        r.top + r.height / 2,
      );
      return !(hit && (hit === el || el.contains(hit)));
    });
    expect(covered).toBe(false);

    // O fim do conteúdo, depois de rolar, fica acima da barra de abas.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const { lastBottom, barTop } = await page.evaluate(() => {
      const bar = document.querySelector('[data-mf-tabbar]') as HTMLElement;
      const column = document.querySelector('[data-mf-mobile-header]')?.parentElement;
      const content = column?.lastElementChild as HTMLElement | null;
      return {
        lastBottom: content ? content.getBoundingClientRect().bottom : 0,
        barTop: bar.getBoundingClientRect().top,
      };
    });
    expect(lastBottom).toBeLessThanOrEqual(barTop + 1);
  });
}

test('Mais abre o painel com as seções e esconde a barra', async ({ page }) => {
  await page.goto('/planejamento-financeiro');
  await waitForShell(page);
  await tabbar(page).getByRole('button', { name: 'Mais' }).click();
  const dialog = page.getByRole('dialog', { name: 'Mais' });
  await expect(dialog).toBeVisible();
  for (const name of ['Dívidas', 'Agenda', 'Relatórios']) {
    await expect(dialog.getByRole('link', { name })).toBeVisible();
  }
  await expect(tabbar(page)).toBeHidden();
  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await expect(tabbar(page)).toBeVisible();
});

test('avatar abre o mesmo painel, na seção Conta', async ({ page }) => {
  await page.goto('/planejamento-financeiro');
  await waitForShell(page);
  await page.getByRole('button', { name: 'Abrir menu da conta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Mais' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Conta' })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Sair' })).toBeVisible();
});

test('Lançar → Novo investimento abre o wizard na Carteira e limpa ?acao', async ({ page }) => {
  await page.goto('/planejamento-financeiro');
  await waitForShell(page);
  await page.getByRole('button', { name: 'Lançar' }).click();
  const sheet = page.getByRole('dialog', { name: 'O que você quer lançar?' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[aria-disabled="true"]')).toContainText('Em breve');
  await sheet.getByRole('link', { name: /Novo investimento/ }).click();

  await page.waitForURL('**/carteira', { timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Adicionar Ativo à Carteira' })).toBeVisible({
    timeout: 30000,
  });
  expect(new URL(page.url()).search).toBe('');
  // Com o wizard aberto a barra some (aria-modal no drawer ui/sidebar/Sidebar).
  await expect(tabbar(page)).toBeHidden();
  // O botão de avançar é procurado dentro do drawer: a Carteira tem outros "Salvar ..." por trás.
  const wizard = page.getByRole('dialog', { name: 'Adicionar Ativo à Carteira' });
  const avancar = wizard.getByRole('button', { name: /Avançar|Confirmar|Planejar/ }).first();
  await expect(avancar).toBeInViewport();
});

test('o sino abre para baixo, dentro da tela', async ({ page }) => {
  await page.goto('/planejamento-financeiro');
  await waitForShell(page);
  await header(page).getByRole('button', { name: 'Abrir notificações' }).click();
  const painel = page.getByRole('heading', { name: 'Notificações' });
  await expect(painel).toBeVisible();
  const box = await painel.evaluate((el) => {
    const panel = el.closest('.absolute') as HTMLElement;
    const r = panel.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
  const headerBox = await header(page).boundingBox();
  expect(box.top).toBeGreaterThanOrEqual((headerBox?.y ?? 0) + (headerBox?.height ?? 0) - 1);
  expect(box.bottom).toBeLessThanOrEqual(844);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(390);
});

test('/fluxodecaixa: sem rolagem do documento e com o ano no cabeçalho', async ({ page }) => {
  await page.goto('/fluxodecaixa');
  await waitForShell(page);
  await expect(
    header(page).getByRole('combobox', { name: 'Ano da planilha de fluxo de caixa' }),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(scrollHeight).toBeLessThanOrEqual(innerHeight + 1);
});

test('campo com foco esconde a barra (teclado)', async ({ page }) => {
  await page.goto('/profile');
  await waitForShell(page);
  const input = page
    .locator(
      'main input:not([type=checkbox]):not([type=radio]), input[type=text], input[type=email]',
    )
    .first();
  await expect(input).toBeVisible({ timeout: 30000 });
  await input.focus();
  await expect(tabbar(page)).toBeHidden();
});
