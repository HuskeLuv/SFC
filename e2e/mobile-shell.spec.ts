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

/**
 * A caixa do elemento dentro da área VISÍVEL (visualViewport). Com isMobile, um transbordo estica
 * a viewport de layout e um `fixed` se posiciona por ela — fora da tela, mas "visível" para o
 * Playwright, que mede em coordenadas de layout.
 */
async function expectInsideVisualViewport(page: Page, selector: string) {
  const box = await page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const vv = window.visualViewport!;
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        vw: vv.width,
        vh: vv.height,
      };
    });
  expect(box.top, `${selector} acima da tela`).toBeGreaterThanOrEqual(-1);
  expect(box.left, `${selector} à esquerda da tela`).toBeGreaterThanOrEqual(-1);
  expect(box.bottom, `${selector} abaixo da tela`).toBeLessThanOrEqual(box.vh + 1);
  expect(box.right, `${selector} à direita da tela`).toBeLessThanOrEqual(box.vw + 1);
}

for (const route of [
  '/carteira',
  '/fluxodecaixa',
  '/planejamento-financeiro',
  '/dividas',
  '/calendario',
  '/historico-alteracoes',
]) {
  test(`casca em ${route}: header e barra visíveis, título descoberto, fim alcançável`, async ({
    page,
  }) => {
    // A /carteira sozinha pode levar ~30s até o título no CI (build de produção em runner frio).
    test.setTimeout(90_000);
    await page.goto(route);
    await waitForShell(page);
    await expect(page.getByRole('button', { name: 'Abrir menu', exact: true })).toHaveCount(0);

    // O primeiro título da página não fica coberto por nada da casca. "Primeiro" = o primeiro
    // h1–h3 com caixa de verdade: um `.sr-only` (1×1px, recortado) é "visível" para o Playwright,
    // mas o elementFromPoint no centro dele acerta outro elemento.
    const headings = page.locator('h1:visible, h2:visible, h3:visible');
    await expect(headings.first()).toBeVisible({ timeout: 30000 });
    const firstReal = await headings.evaluateAll((els) =>
      els.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      }),
    );
    expect(firstReal, 'nenhum título com caixa maior que 2px').toBeGreaterThanOrEqual(0);
    const heading = headings.nth(firstReal);
    const covered = await heading.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + Math.min(r.width / 2, 40),
        r.top + r.height / 2,
      );
      return !(hit && (hit === el || el.contains(hit)));
    });
    expect(covered).toBe(false);

    // Com o conteúdo carregado, a barra de abas está na área visível (não só no layout).
    // Limite próprio: páginas com polling nunca ficam ociosas e a espera comia o timeout do teste.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expectInsideVisualViewport(page, '[data-mf-tabbar]');

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

test('Lançar → Novo investimento com a Carteira ainda carregando abre o wizard', async ({
  page,
}) => {
  await page.goto('/carteira');
  await waitForShell(page);
  // Sem esperar a página: o atalho fica pendente até o CarteiraResumo montar.
  await page.getByRole('button', { name: 'Lançar' }).click();
  const sheet = page.getByRole('dialog', { name: 'O que você quer lançar?' });
  await sheet.getByRole('link', { name: /Novo investimento/ }).click();
  await expect(page.getByRole('heading', { name: 'Adicionar Ativo à Carteira' })).toBeVisible({
    timeout: 60000,
  });
  expect(new URL(page.url()).search).toBe('');
});

test('Agenda: o sheet de Novo evento cabe na tela (X e rodapé)', async ({ page }) => {
  await page.goto('/calendario');
  await waitForShell(page);
  const novo = page.getByRole('button', { name: /Novo evento/ }).first();
  await expect(novo).toBeVisible({ timeout: 60000 });
  await novo.click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible();
  const fechar = dialog.getByRole('button', { name: 'Fechar' }).first();
  await expect(fechar).toBeVisible();
  const box = await fechar.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { right: r.right, top: r.top, vw: window.visualViewport!.width };
  });
  expect(box.right).toBeLessThanOrEqual(box.vw + 1);
  expect(box.top).toBeGreaterThanOrEqual(0);
  await fechar.click();
  await expect(dialog).toBeHidden();
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
