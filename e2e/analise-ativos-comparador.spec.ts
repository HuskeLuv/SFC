import { test, expect, type Page } from '@playwright/test';
import { encontrarProibidasV2 } from '../src/services/analiseAtivos/regras/comum/linguagemV2';
import { TICKERS_BLOCO_D_CI as T, exigirRecursoBlocoD } from './fixtures/analise-bloco-d';

/**
 * Análise de Ativos · v2.4 fatia D — Comparador ISONÔMICO (computador, projeto `chromium`). Exige
 * a flag ANALISE_ATIVOS_COMPARADOR_HABILITADO (ligada no CI; sem ela os testes pulam). SÓ LEITURA:
 * o estado mora na URL (?t=&janela=). Sem ★, sem destaque, sem Índice MF, sem placar; critérios
 * primeiro e "Leitura dos dados" só com contagens (funciona com ou sem avaliação no banco).
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

test('ações: critérios primeiro, sem ★/destaque/Índice, Leitura dos dados e Copiar link', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await abrir(page, [T.acao, T.banco, T.acaoPetro]);
  await expect(page.locator('[data-comparador="acao"]')).toBeVisible();
  const cab = tabela(page).locator('thead th');
  await expect(cab).toHaveText(['Critério', T.acao, T.banco, T.acaoPetro]);

  // o bloco de critérios é a 1ª faixa; fecha com "Critérios atendidos" (n de k ou sem avaliação)
  await expect(tabela(page).locator('th[scope="rowgroup"]').first()).toHaveText(
    'Critérios de fundamentos · 5 anos',
  );
  await expect(tabela(page).locator('[data-criterio="atendidos"] td')).toHaveCount(3);
  await expect(tabela(page).locator('[data-criterio="atendidos"] td').first()).toHaveText(
    /^\d de \d$|^sem avaliação$/,
  );
  // nenhuma marca de valor
  await expect(page.locator('[data-destaque]')).toHaveCount(0);
  await expect(
    tabela(page).locator(`[data-linha="margemLiquida"] [data-celula-ticker="${T.banco}"]`),
  ).toHaveText('n/a');

  // instrução e Leitura dos dados: literais exatos (data-texto-legal)
  await expect(page.locator('[data-texto-legal="instrucao-comparador-acoes"]')).toBeVisible();
  const leitura = page.getByRole('region', { name: 'Leitura dos dados' });
  await expect(leitura).toContainText(
    new RegExp(`${T.acao}: .* · ${T.banco}: .* · ${T.acaoPetro}: `),
  );
  await expect(leitura.locator('[data-texto-legal="leitura-dos-dados"]')).toContainText(
    'Não há ranking, nota ou ativo "vencedor"',
  );
  await expect(page.getByRole('region', { name: 'Resumo numérico' })).toHaveCount(0);

  // Copiar link (o Comparador não grava)
  await page.getByRole('button', { name: 'Copiar link', exact: true }).click();
  await expect(page.getByText('Link copiado').first()).toBeVisible();

  // nada de compra/salvar/PDF; varredura do DOM fora dos literais e dos nomes do banco
  const area = page.locator('[data-analise-ativos]');
  await expect(area.getByRole('button', { name: /comprar|salvar compara|pdf/i })).toHaveCount(0);
  const texto = await page.locator('[data-comparador]').evaluate((el) => {
    const c = el.cloneNode(true) as Element;
    c.querySelectorAll('[data-texto-legal],[data-nome-ativo]').forEach((n) => n.remove());
    return (c.textContent ?? '').replace(/\s+/g, ' ');
  });
  expect(encontrarProibidasV2(texto)).toEqual([]);
});

test('janela 10 anos: vai para a URL e o bloco de critérios acompanha', async ({ page }) => {
  await abrir(page, [T.acao, T.banco]);
  await page.getByRole('radio', { name: '10 anos' }).click();
  await expect(page).toHaveURL(new RegExp(`t=${T.acao},${T.banco}&janela=10$`));
  await expect(tabela(page).locator('th[scope="rowgroup"]').first()).toHaveText(
    'Critérios de fundamentos · 10 anos',
    { timeout: 60_000 },
  );
  await expect(page.getByRole('region', { name: 'Leitura dos dados' })).toContainText(
    /em 10 anos|sem avaliação/,
  );
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
  await expect(
    page.getByText('Adicione mais um ativo para ver os dados lado a lado.'),
  ).toBeVisible();
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

test('FIIs tijolo + papel: aviso, n/a por grupo, Obrigações/PL comum, Tijolo | Papel', async ({
  page,
}) => {
  await abrir(page, [T.fiiTijolo, T.fiiPapel]);
  await expect(page.locator('[data-comparador="fii"]')).toBeVisible();
  await expect(page.locator('[data-texto-legal="instrucao-comparador-fiis"]')).toBeVisible();
  await expect(
    page.getByRole('note').filter({ hasText: 'tijolo com FIIs de papel' }),
  ).toBeVisible();
  await expect(page.locator('[data-destaque]')).toHaveCount(0);
  await expect(
    tabela(page).locator(`[data-linha="nCri"] [data-celula-ticker="${T.fiiTijolo}"]`),
  ).toHaveText('n/a');
  await expect(
    tabela(page).locator(`[data-linha="nImoveis"] [data-celula-ticker="${T.fiiPapel}"]`),
  ).toHaveText('n/a');
  await expect(
    tabela(page).locator(`[data-linha="obrigacoesPl"] [data-celula-ticker="${T.fiiPapel}"]`),
  ).not.toHaveText('n/a');
  // Tijolo | Papel: no misto nenhum marcado; Papel deixa só o fundo de papel
  const tipo = page.getByRole('group', { name: 'Tipo de FII' });
  await expect(tipo.getByRole('button', { pressed: true })).toHaveCount(0);
  await tipo.getByRole('button', { name: 'Papel' }).click();
  await expect(page).toHaveURL(new RegExp(`t=${T.fiiPapel}$`));
});

test('vazio: diz o que fazer e a aba FIIs muda a classe', async ({ page }) => {
  await abrir(page, []);
  await expect(page.getByRole('heading', { name: 'Escolha o que comparar' })).toBeVisible();
  await page.getByRole('button', { name: 'FIIs' }).click();
  await expect(page).toHaveURL(/c=fii/);
  await expect(page.getByRole('button', { name: 'Adicionar FII' })).toBeVisible();
});

test('limite de 4 e alvos de 44px (remover, links de ticker, janela, copiar)', async ({ page }) => {
  await abrir(page, [T.acao, T.banco, T.acaoPetro, T.lpaNegativo]);
  await expect(page.getByText('Limite de 4 ativos. Remova um para incluir outro.')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('[data-slot-adicionar]')).toHaveCount(0);
  const alvos = page.locator(
    '[data-comparador] [data-slot] a, [data-comparador] [data-slot] button, [data-pilulas-janela] button, [data-acao="copiar-link"]',
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
