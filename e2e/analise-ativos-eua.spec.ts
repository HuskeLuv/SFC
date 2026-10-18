import { test, expect, type Page } from '@playwright/test';
import { encontrarProibidasV2 } from '../src/services/analiseAtivos/regras/comum/linguagemV2';

/**
 * Análise de Ativos · Stocks e REITs (fatia C) — SÓ LEITURA. Exige ANALISE_ATIVOS_EUA_HABILITADO
 * (sem ela os testes PULAM) e as fixtures EUA do banco efêmero (prisma/seedAnaliseAtivosEua.ts:
 * AAPL, MSFT … e os REITs O, PLD …, sem rede). Variante SEM cotação (chave de preço desligada):
 * nenhum preço, P/L ou DY; nenhum nome de índice; Comparador só da mesma classe.
 */
test.describe.configure({ timeout: 180_000 });

async function exigirEua(page: Page) {
  const res = await page.request.get('/api/analise-ativos/config');
  const corpo = res.ok()
    ? ((await res.json()) as {
        habilitada?: boolean;
        recursos?: { eua?: boolean; euaPreco?: boolean };
      })
    : {};
  test.skip(
    corpo.habilitada !== true || corpo.recursos?.eua !== true,
    'Stocks e REITs: ANALISE_ATIVOS_EUA_HABILITADO desligada no servidor',
  );
  return corpo.recursos?.euaPreco === true;
}

async function abrir(page: Page, caminho: string) {
  await page.goto('/analise-ativos', { waitUntil: 'load' });
  const comPreco = await exigirEua(page);
  await page.goto(caminho, { waitUntil: 'load' });
  return comPreco;
}

/** Rola até o fim (as seções preguiçosas montam ao entrar na tela). */
async function rolarAteOFim(page: Page) {
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(150);
  }
}

/**
 * Texto da área (Quadro ou página) SEM os literais jurídicos registrados (data-texto-legal), que
 * citam "recomendação"/"ranking" na negativa e têm teste próprio.
 */
async function semIndiceNemLinguagemProibida(page: Page) {
  const texto = await page.evaluate(() => {
    const raiz = document.querySelector('[data-quadro-classe],[data-pagina-ativo]');
    if (!raiz) return '';
    const copia = raiz.cloneNode(true) as HTMLElement;
    copia.querySelectorAll('[data-texto-legal]').forEach((n) => n.remove());
    return copia.innerText || copia.textContent || '';
  });
  expect(texto.length).toBeGreaterThan(0);
  expect(texto).not.toMatch(/S&P|MSCI|Dow Jones|Russell/);
  expect(encontrarProibidasV2(texto, { ignorarLiterais: true })).toEqual([]);
}

test('Quadro Stocks → filtro → AAPL sem cotação → Comparar com MSFT', async ({ page }) => {
  const comPreco = await abrir(page, '/analise-ativos?classe=stock');
  const tabela = page.locator('[data-quadro-tabela="stock"]');
  await expect(tabela).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('button', { name: /^Stocks \d+/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^REITs \d+/ })).toBeVisible();
  if (!comPreco) {
    await expect(page.locator('[data-faixa-sem-cotacao]')).toBeVisible();
    await expect(tabela.locator('thead')).not.toContainText('P/L');
  }
  await expect(page.locator('[data-texto-legal="rodape-quadro-eua"]')).toBeVisible();
  await expect(page.locator('[data-universo-eua]')).toContainText('NYSE ou na Nasdaq');

  // filtro de critério (Margem líquida positiva): AAPL atende na fixture
  await page.locator('[data-criterio-chip="mg"]').click();
  await expect(page).toHaveURL(/c=mg/);
  await expect(tabela.locator('[data-ticker="AAPL"]')).toBeVisible({ timeout: 60_000 });
  await semIndiceNemLinguagemProibida(page);

  await tabela.locator('[data-ticker="AAPL"]').click();
  await expect(page).toHaveURL(/\/analise-ativos\/AAPL/);
  const preco = page.locator('[data-sem-cotacao]');
  if (!comPreco) await expect(preco).toContainText('Cotação EUA indisponível nesta versão');
  await expect(page.locator('[data-tags]')).toContainText('Nasdaq');
  await expect(page.getByRole('heading', { name: 'LPA por ano' })).toBeVisible();
  await semIndiceNemLinguagemProibida(page);

  await page.goto('/analise-ativos/comparador?t=AAPL,MSFT', { waitUntil: 'load' });
  await expect(page.locator('[data-comparador="stock"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-tabela-comparador] thead th')).toHaveText([
    'Critério',
    'AAPL',
    'MSFT',
  ]);
  await expect(page.locator('[data-texto-legal="instrucao-comparador-stocks"]')).toBeVisible();
  await expect(page.locator('[data-destaque]')).toHaveCount(0);
});

test('REIT O → Essencial sem FFO/AFFO → Comparar com PLD; stock × REIT bloqueado', async ({
  page,
}) => {
  await abrir(page, '/analise-ativos/O');
  await expect(page.locator('[data-pagina-eua="reit"]')).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByRole('heading', { name: 'Caixa operacional por ação por ano' }),
  ).toBeVisible();
  const essencial = page.locator('[data-essencial-eua="reit"]');
  await rolarAteOFim(page);
  await expect(essencial).toBeVisible({ timeout: 60_000 });
  const cab = await essencial.locator('thead th').allInnerTexts();
  expect(cab.join(' ')).toMatch(/Caixa op\./i);
  for (const x of ['FFO', 'AFFO', 'Ocupação', 'Imóveis']) expect(cab.join(' ')).not.toContain(x);
  await semIndiceNemLinguagemProibida(page);

  await page.goto('/analise-ativos/comparador?t=O,PLD', { waitUntil: 'load' });
  await expect(page.locator('[data-comparador="reit"]')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('[data-texto-legal="instrucao-comparador-reits"]')).toBeVisible();

  await page.goto('/analise-ativos/comparador?t=AAPL,O', { waitUntil: 'load' });
  const misto = page.locator('[data-comparador-misto-eua]');
  await expect(misto).toBeVisible({ timeout: 90_000 });
  await misto.locator('[data-saida-misto="reit"]').click();
  await expect(page).toHaveURL(/t=O(&|$)/);
  await expect(page.locator('[data-comparador="reit"]')).toBeVisible({ timeout: 90_000 });
});

test('escuro: Quadro REITs e página do AAPL sem erro de JS', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('theme', 'dark');
    } catch {
      /* sem storage */
    }
  });
  await abrir(page, '/analise-ativos?classe=reit');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('[data-quadro-tabela="reit"]')).toBeVisible({ timeout: 90_000 });
  await page.goto('/analise-ativos/AAPL', { waitUntil: 'load' });
  await expect(page.locator('[data-pagina-eua="stock"]')).toBeVisible({ timeout: 90_000 });
  expect(erros).toEqual([]);
});

test('390 px: 4 abas e chips sem rolagem horizontal; página sem estouro', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page, '/analise-ativos?classe=stock');
  await expect(page.locator('[data-quadro-cartoes="stock"]')).toBeVisible({ timeout: 90_000 });
  const medidas = await page.evaluate(() => {
    const m = (s: string) => {
      const e = document.querySelector(s);
      return e ? [e.scrollWidth, e.clientWidth] : null;
    };
    return {
      abas: m('nav[aria-label="Classe de ativo"]'),
      chips: m('[data-quadro-chips]'),
      pagina: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
    };
  });
  for (const [s, c] of Object.values(medidas).filter((x): x is number[] => !!x)) {
    expect(s).toBeLessThanOrEqual(c);
  }
  await expect(page.locator('[data-criterio-chip]')).toHaveCount(6);
  for (const aba of ['Ações', 'FIIs', 'Stocks', 'REITs']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${aba} \\d+`) })).toBeInViewport();
  }

  await page.goto('/analise-ativos/O', { waitUntil: 'load' });
  await expect(page.locator('[data-pagina-eua="reit"]')).toBeVisible({ timeout: 90_000 });
  const [s, c] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(s).toBeLessThanOrEqual(c);
});
