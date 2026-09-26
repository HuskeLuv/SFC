import { test, expect, type Page } from '@playwright/test';

/**
 * PWA fase 2 · fatia C — "+ Lançar → Despesa ou receita" (lançamento rápido do Fluxo) no celular.
 *
 * NÃO grava nada (decisão 11): vai só até a PRÉVIA, que chama a rota real com `confirmar:false`, e
 * volta/fecha. Gravação e Desfazer ficam no Vitest da rota (lancamento-rapido/route.test.ts).
 * Projeto `mobile` (390px, isMobile); um cenário a 320px.
 */
test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent =
      '.tsqd-parent-container, .tsqd-open-btn-container { display: none !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
    } catch {
      // sem storage: o aviso de cookies aparece, mas não cobre o sheet
    }
  });
});

const tabbar = (page: Page) => page.locator('[data-mf-tabbar]');
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Lançar despesa ou receita' });

async function abrirLancamento(page: Page, path = '/planejamento-financeiro') {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-mf-mobile-header]')).toBeVisible({ timeout: 60_000 });
  await expect(tabbar(page)).toBeVisible();
  const launch = page.getByRole('dialog', { name: 'O que você quer lançar?' });
  // A barra vem no HTML do servidor: um toque antes da hidratação se perde — tenta de novo.
  await expect(async () => {
    await page.getByRole('button', { name: 'Lançar' }).click();
    await expect(launch).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect(launch.getByText('Em breve')).toHaveCount(0);
  await launch.getByRole('button', { name: /Despesa ou receita/ }).click();
  await expect(launch).toBeHidden();
  await expect(sheet(page)).toBeVisible();
}

test('Despesa ou receita abre o sheet em qualquer tela e vai até a prévia sem gravar', async ({
  page,
}) => {
  const posts: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/api/cashflow/lancamento-rapido')) {
      posts.push(req.postData() ?? '');
    }
  });

  await abrirLancamento(page);
  const s = sheet(page);
  await s.getByLabel('Valor').fill('45,90');
  await s.getByRole('button', { name: /Linha do fluxo/ }).click();
  await s.getByLabel('Buscar linha de despesa').fill('supermercado');
  await s
    .getByRole('list', { name: 'Linhas encontradas' })
    .getByRole('button', { name: /^Supermercado/ })
    .first()
    .click();
  await expect(s.getByRole('button', { name: /Linha do fluxo/ })).toContainText('Supermercado');
  await s.getByRole('button', { name: 'Revisar' }).click();

  await expect(s.getByRole('heading', { name: 'Supermercado' })).toBeVisible({ timeout: 60_000 });
  await expect(s.getByText(/R\$\s45,90/).first()).toBeVisible();
  const lancar = s.getByRole('button', { name: /Lançar R\$\s45,90/ });
  await expect(lancar).toBeInViewport();

  // Só a prévia foi pedida (confirmar:false); nada gravado.
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0])).toMatchObject({ valor: 45.9, confirmar: false });

  await s.getByRole('button', { name: 'Voltar' }).click();
  await expect(s.getByLabel('Valor')).toHaveValue('45,90');
  await s.getByRole('button', { name: 'Fechar' }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(tabbar(page)).toBeVisible();
  expect(posts).toHaveLength(1);
});

test('Revisar sem valor e sem linha mostra os erros sem chamar a rota', async ({ page }) => {
  let chamou = false;
  page.on('request', (req) => {
    if (req.url().includes('/api/cashflow/lancamento-rapido')) chamou = true;
  });
  await abrirLancamento(page);
  const s = sheet(page);
  await s.getByRole('button', { name: 'Revisar' }).click();
  await expect(s.getByText('Digite um valor maior que zero, como 45,90.')).toBeVisible();
  await expect(s.getByText('Escolha em qual linha do fluxo o valor entra.')).toBeVisible();
  expect(chamou).toBe(false);
});

test.describe('320px', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('o sheet cabe: sem rolagem horizontal, Revisar e Fechar visíveis', async ({ page }) => {
    await abrirLancamento(page);
    const s = sheet(page);
    await expect(s.getByRole('button', { name: 'Revisar' })).toBeInViewport();
    await expect(s.getByRole('button', { name: 'Fechar' })).toBeInViewport();
    const largura = await s.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(largura.sw).toBeLessThanOrEqual(largura.cw + 1);
    const doc = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(doc).toBeLessThanOrEqual(320);
  });
});
