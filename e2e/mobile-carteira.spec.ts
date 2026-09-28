import { test, expect, type Page } from '@playwright/test';
import { expectFitsWithoutClip, waitCarteiraReady } from './helpers/mobileFit';

/**
 * PWA fase 1 · fatia A — casca da /carteira no celular: Resumo em coluna única, segmentado
 * Resumo | Análise que gruda, trilho de classes + "Todas", Alocação em cartões (Aplicar sem gravar)
 * e o + Lançar abrindo o wizard também com a Análise aberta. Projeto `mobile` (390px, isMobile).
 *
 * Nada aqui grava dado: a meta é aplicada e DESCARTADA, e o wizard é só aberto e fechado.
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
      // sem storage: o aviso de cookies aparece, mas não cobre o topo
    }
  });
});

const segmentado = (page: Page) => page.getByRole('navigation', { name: 'Seções da carteira' });
const trilho = (page: Page) => page.getByRole('navigation', { name: 'Classes de ativo' });

async function abrirCarteira(page: Page, path = '/carteira') {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await waitCarteiraReady(page, { timeout: 120_000 });
}

test('Resumo e Carteira Consolidada cabem a 390px sem o corte da casca', async ({ page }) => {
  await abrirCarteira(page);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Carteira de Investimentos' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alocação de ativos' })).toBeVisible();
  // Desktop-only no celular: subtítulo e botões Adicionar/Resgatar.
  await expect(page.getByText('Gerencie e acompanhe seus investimentos por categoria')).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Adicionar Investimento' })).toHaveCount(0);
  await expectFitsWithoutClip(page, 'carteira-390', { width: 390 });
});

test.describe('a 320px', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('Resumo cabe sem o corte da casca', async ({ page }) => {
    await abrirCarteira(page);
    await expectFitsWithoutClip(page, 'carteira-320', { width: 320 });
  });
});

test('"Todas" abre o painel de classes; escolher Ações troca a aba e grava ?aba=', async ({
  page,
}) => {
  await abrirCarteira(page);
  await page.getByRole('button', { name: 'Todas' }).click();
  const sheet = page.getByRole('dialog', { name: 'Classes da carteira' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('radio', { name: /^Ações/ }).click();
  await expect(sheet).toBeHidden();

  const chip = trilho(page).getByRole('button', { name: 'Ações', exact: true });
  await expect(chip).toHaveAttribute('aria-current', 'page');
  await expect(chip).toBeInViewport();
  await expect(page).toHaveURL(/[?&]aba=acoes/);

  // A aba vem da URL numa visita nova.
  await abrirCarteira(page, '/carteira?aba=acoes');
  await expect(trilho(page).getByRole('button', { name: 'Ações', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('segmentado Resumo | Análise e trilho continuam na tela ao rolar', async ({ page }) => {
  await abrirCarteira(page);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  await expect(segmentado(page)).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Todas' })).toBeInViewport();
});

test('Análise → + Lançar → Novo investimento abre o wizard sem trocar de aba', async ({ page }) => {
  await abrirCarteira(page);
  await segmentado(page).getByRole('button', { name: 'Análise', exact: true }).click();
  await expect(
    segmentado(page).getByRole('button', { name: 'Análise', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/[?&]aba=analise/);

  await page.getByRole('button', { name: 'Lançar' }).click();
  const sheet = page.getByRole('dialog', { name: 'O que você quer lançar?' });
  await sheet.getByRole('link', { name: /Novo investimento/ }).click();

  const wizard = page.getByRole('dialog', { name: 'Adicionar Ativo à Carteira' });
  await expect(wizard).toBeVisible({ timeout: 30_000 });
  await wizard.getByRole('button', { name: 'Fechar sidebar' }).click();
  await expect(wizard).toBeHidden();
  // Continua na Análise.
  await expect(
    segmentado(page).getByRole('button', { name: 'Análise', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
});

test('?acao=novo continua abrindo o wizard e sai da URL', async ({ page }) => {
  await page.goto('/carteira?acao=novo', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('dialog', { name: 'Adicionar Ativo à Carteira' })).toBeVisible({
    timeout: 120_000,
  });
  expect(new URL(page.url()).searchParams.get('acao')).toBeNull();
});

test('meta da alocação: Aplicar mostra "não salvas" e Descartar não grava nada', async ({
  page,
}) => {
  await abrirCarteira(page);
  const saves: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/carteira/configuracao') && req.method() !== 'GET') {
      saves.push(req.method());
    }
  });

  const editar = page.getByRole('button', { name: /^Editar meta de / }).nth(1);
  await editar.scrollIntoViewIfNeeded();
  await editar.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: 'Aplicar' })).toBeVisible();
  const target = sheet.getByLabel('% Target');
  const atual = await target.inputValue();
  const novo = String((Number(atual.replace(',', '.')) || 0) + 1).replace('.', ',');
  await target.fill(novo);
  await sheet.getByRole('button', { name: 'Aplicar' }).click();
  await expect(sheet).toBeHidden();

  const barra = page.getByRole('region', { name: 'Alterações de alocação não salvas' });
  await expect(barra).toBeVisible();
  await expect(barra).toContainText('ainda não salva');
  await expect(barra).toBeInViewport();

  await barra.getByRole('button', { name: 'Descartar' }).click();
  await expect(barra).toBeHidden();
  expect(saves, 'Aplicar/Descartar não podem gravar a configuração').toEqual([]);
});
