import { test, expect, type Page } from '@playwright/test';
import { encontrarPalavrasProibidasBlocoD } from '../src/services/analiseAtivos/regras/comum/varreduraTextos';
import { TICKERS_BLOCO_D_CI as T, exigirRecursoBlocoD } from './fixtures/analise-bloco-d';

/**
 * Análise de Ativos · Bloco D · fatia C — Comparador (computador, projeto `chromium`). Exige a flag
 * ANALISE_ATIVOS_COMPARADOR_HABILITADO (ligada no CI; sem ela os testes pulam). SÓ LEITURA: o
 * estado mora na URL (?t=).
 */
test.describe.configure({ timeout: 180_000 });

const URL = '/analise-ativos/comparador';

async function abrir(page: Page, tickers: string[]) {
  await page.goto(URL, { waitUntil: 'load' });
  await exigirRecursoBlocoD(page, 'comparador');
  await page.goto(tickers.length ? `${URL}?t=${tickers.join(',')}` : URL, { waitUntil: 'load' });
  await expect(
    page.locator('[data-comparador="acao"],[data-comparador="fii"],[data-comparador="vazio"]'),
  ).toBeVisible({
    timeout: 90_000,
  });
}

const tabela = (page: Page) => page.locator('[data-tabela-comparador]');

test('ações: URL compartilhável, ★ com o texto destaque, Resumo sem placar, sem botão de compra', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await abrir(page, [T.acao, T.banco, T.acaoPetro]);
  await expect(page.locator('[data-comparador="acao"]')).toBeVisible();
  const cab = tabela(page).locator('thead th');
  await expect(cab).toHaveText(['Critério', T.acao, T.banco, T.acaoPetro]);

  // ★ sempre com "destaque" em texto; banco: margem n/a
  const estrelas = tabela(page).locator('[data-destaque]');
  const n = await estrelas.count();
  for (let i = 0; i < n; i++) await expect(estrelas.nth(i)).toContainText('destaque');
  await expect(
    tabela(page).locator(`[data-linha="margemLiquida"] [data-celula-ticker="${T.banco}"]`),
  ).toHaveText('n/a');
  // payout neutro: nunca ★
  await expect(tabela(page).locator('[data-linha="payout"] [data-destaque]')).toHaveCount(0);

  // Resumo: ordem dos slots, sem "maior"
  const resumo = page.getByRole('region', { name: 'Resumo numérico' });
  await expect(resumo).toContainText(
    new RegExp(
      `Índice MF, na ordem dos ativos acima: ${T.acao} .* · ${T.banco} .* · ${T.acaoPetro}`,
    ),
  );
  await expect(resumo).not.toContainText(/maior|★/);
  await expect(resumo).toContainText('Não indicam qual ativo escolher');

  // Copiar link
  await page.getByRole('button', { name: 'Copiar link' }).click();
  await expect(page.getByText('Link copiado')).toBeVisible();

  // nada de compra/salvar/PDF; varredura do DOM
  const area = page.locator('[data-analise-ativos]');
  await expect(area.getByRole('button', { name: /comprar|salvar compara|pdf/i })).toHaveCount(0);
  const texto = (await page.locator('[data-comparador]').innerText()).replace(/\s+/g, ' ');
  expect(encontrarPalavrasProibidasBlocoD(texto)).toEqual([]);
});

test('link com outra classe: a classe vem do 1º ticker e o FII sai com aviso', async ({ page }) => {
  await abrir(page, [T.acao, T.fiiTijolo, T.banco]);
  await expect(
    page.getByRole('status').filter({ hasText: `${T.fiiTijolo} ficou de fora` }),
  ).toBeVisible();
  await expect(tabela(page).locator('thead th')).toHaveText(['Critério', T.acao, T.banco]);
});

test('adicionar pela busca (outra classe desabilitada) e remover', async ({ page }) => {
  await abrir(page, [T.acao]);
  await expect(page.getByText('Adicione mais um ativo para ver os destaques.')).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar ação' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Adicionar ação' });
  const campo = dialogo.getByRole('combobox');
  await campo.fill(T.fiiTijolo.slice(0, 4));
  const fii = dialogo.getByRole('option', { name: new RegExp(T.fiiTijolo) });
  await expect(fii).toHaveAttribute('aria-disabled', 'true', { timeout: 60_000 });
  await expect(fii).toContainText('outra classe');
  await campo.fill(T.acao.slice(0, 4));
  await expect(dialogo.getByRole('option', { name: new RegExp(T.acao) })).toContainText(
    'já está na comparação',
  );
  await campo.fill(T.banco.slice(0, 4));
  await dialogo.getByRole('option', { name: new RegExp(T.banco) }).click();
  await expect(page).toHaveURL(new RegExp(`t=${T.acao},${T.banco}$`));
  await expect(tabela(page).locator('thead th')).toHaveText(['Critério', T.acao, T.banco], {
    timeout: 60_000,
  });

  await page.getByRole('button', { name: `Remover ${T.banco} da comparação` }).click();
  await expect(page).toHaveURL(new RegExp(`t=${T.acao}$`));
});

test('FIIs tijolo + papel: aviso, n/a cruzado e P/VP sem ★', async ({ page }) => {
  await abrir(page, [T.fiiTijolo, T.fiiPapel]);
  await expect(page.locator('[data-comparador="fii"]')).toBeVisible();
  await expect(
    page.getByRole('note').filter({ hasText: 'tijolo com FIIs de papel' }),
  ).toBeVisible();
  await expect(tabela(page).locator('[data-linha="pvpFii"] [data-destaque]')).toHaveCount(0);
  await expect(
    tabela(page).locator(`[data-linha="nCri"] [data-celula-ticker="${T.fiiTijolo}"]`),
  ).toHaveText('n/a');
  // imóveis da CVM: sem ★
  await expect(tabela(page).locator('[data-linha="vacanciaFisica"] [data-destaque]')).toHaveCount(
    0,
  );
});

test('vazio: diz o que fazer e a aba FIIs muda a classe', async ({ page }) => {
  await abrir(page, []);
  await expect(page.getByRole('heading', { name: 'Escolha o que comparar' })).toBeVisible();
  await page.getByRole('button', { name: 'FIIs' }).click();
  await expect(page).toHaveURL(/c=fii/);
  await expect(page.getByRole('button', { name: 'Adicionar FII' })).toBeVisible();
});

test('limite de 4 e alvos de 44px (remover, links de ticker, copiar)', async ({ page }) => {
  await abrir(page, [T.acao, T.banco, T.acaoPetro, T.lpaNegativo]);
  await expect(page.getByText('Limite de 4 ativos. Remova um para incluir outro.')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('[data-slot-adicionar]')).toHaveCount(0);
  const alvos = page.locator(
    '[data-comparador] [data-slot] a, [data-comparador] [data-slot] button',
  );
  const n = await alvos.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const caixa = await alvos.nth(i).boundingBox();
    expect(caixa!.height).toBeGreaterThanOrEqual(44);
    expect(caixa!.width).toBeGreaterThanOrEqual(44);
  }
});

test('captura local (claro)', async ({ page }) => {
  test.skip(!!process.env.CI, 'screenshots só locais');
  await abrir(page, [T.acao, T.banco, T.acaoPetro]);
  await page.screenshot({ path: 'test-results/comparador-acoes.png', fullPage: true });
});
