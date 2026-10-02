import { test, expect, type Page } from '@playwright/test';
import { encontrarPalavrasProibidas } from '../src/services/analiseAtivos/regras/comum/linguagem';

/**
 * Análise de Ativos — Fase 1, fatia A: Quadro e busca no computador (projeto `chromium`, SÓ
 * LEITURA). No CI o seed traz as fixtures da área (12 ações e 7 FIIs no Quadro) com
 * ANALISE_ATIVOS_HABILITADA=true; no dev, o banco inteiro. Sem a área liberada, pula.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
    } catch {
      /* sem storage */
    }
  });
  const cfg = await page.request.get('/api/analise-ativos/config');
  const habilitada = cfg.ok() && ((await cfg.json()) as { habilitada?: boolean }).habilitada;
  test.skip(!habilitada, 'Análise de Ativos desligada ou usuário fora do beta');
});

const quadro = (page: Page) => page.locator('section[aria-label="Quadro"]');
const linhas = (page: Page) => quadro(page).locator('tbody tr[data-ticker]');

/** Espera a tabela com linhas e sem a página anterior (placeholder) em tela. */
async function tabelaPronta(page: Page) {
  await linhas(page).first().waitFor({ timeout: 60_000 });
  await expect(quadro(page).locator('[data-quadro-tabela][aria-busy]')).toHaveCount(0, {
    timeout: 30_000,
  });
}

async function abrirQuadro(page: Page, qs = '') {
  await page.goto(`/analise-ativos${qs}`, { waitUntil: 'domcontentloaded' });
  await tabelaPronta(page);
}

/** Texto da coluna (data-coluna) de cada linha carregada. */
async function valoresColuna(page: Page, coluna: string): Promise<string[]> {
  return linhas(page)
    .locator(`td[data-coluna="${coluna}"]`)
    .evaluateAll((tds) => tds.map((td) => (td.textContent ?? '').trim()));
}

const numeroBr = (t: string): number | null => {
  const m = t
    .replace(/\./g, '')
    .replace('−', '-')
    .match(/-?\d+(,\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
};

test('ordena por P/L: crescente, aria-sort e "—" sempre no fim (API e tela)', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirQuadro(page);
  await page.getByRole('button', { name: 'Ordenar por P/L' }).click();
  await expect(page).toHaveURL(/ordem=pl&dir=asc/);
  const th = page.locator('th[data-coluna="pl"]');
  await expect(th).toHaveAttribute('aria-sort', 'ascending');
  await tabelaPronta(page);

  // na tela: números crescentes e nada numérico depois do primeiro "—"
  const tela = (await valoresColuna(page, 'pl')).map(numeroBr);
  const primeiroNulo = tela.indexOf(null);
  if (primeiroNulo >= 0) expect(tela.slice(primeiroNulo).every((v) => v === null)).toBe(true);
  const nums = tela.filter((v): v is number => v !== null);
  expect([...nums].sort((a, b) => a - b)).toEqual(nums);

  // na API, a lista inteira: nulos no fim nas duas direções
  for (const dir of ['asc', 'desc']) {
    const valores: Array<number | null> = [];
    for (let offset = 0; ; offset += 100) {
      const r = await page.request.get(
        `/api/analise-ativos/quadro?classe=acao&ordem=pl&dir=${dir}&limite=100&offset=${offset}`,
      );
      expect(r.ok()).toBe(true);
      expect(r.headers()['cache-control']).toContain('no-store');
      const corpo = (await r.json()) as {
        total: number;
        itens: Array<{ pl: { estado: string; valor?: number } }>;
      };
      valores.push(...corpo.itens.map((i) => (i.pl.estado === 'ok' ? i.pl.valor! : null)));
      if (offset + 100 >= corpo.total) break;
    }
    const n = valores.indexOf(null);
    if (n >= 0)
      expect(
        valores.slice(n).every((v) => v === null),
        dir,
      ).toBe(true);
  }
});

test('Detalhado acrescenta colunas e fica na URL', async ({ page }) => {
  await abrirQuadro(page);
  await expect(page.getByRole('columnheader', { name: /Margem líquida/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Detalhado' }).click();
  await expect(page).toHaveURL(/modo=detalhado/);
  await expect(page.getByRole('button', { name: 'Ordenar por Margem líquida' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Setor' })).toBeVisible();
});

test('chip DY 12m ≥ 4%: aria-pressed e só DY ≥ 4 na lista', async ({ page }) => {
  await abrirQuadro(page);
  const chip = page.getByRole('button', { name: /DY 12m ≥ 4%/ });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/f=dyMinAcao/);
  await tabelaPronta(page);
  const dys = (await valoresColuna(page, 'dy12m')).map(numeroBr);
  expect(dys.length).toBeGreaterThan(0);
  for (const v of dys) expect(v ?? -1).toBeGreaterThanOrEqual(4);
  await page.getByRole('button', { name: 'Limpar filtros' }).first().click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
});

test('Mostrar mais traz mais 25', async ({ page }) => {
  await abrirQuadro(page);
  const contagem = page.locator('[data-quadro-contagem]');
  await expect(contagem).toContainText('Mostrando');
  const total = Number((await contagem.textContent())?.match(/de (\d+)/)?.[1] ?? 0);
  test.skip(total <= 25, 'menos de 25 ações no Quadro (seed do CI)');
  await expect(linhas(page)).toHaveCount(25);
  await page.getByRole('button', { name: 'Mostrar mais 25' }).click();
  await expect(linhas(page)).toHaveCount(Math.min(50, total));
  await expect(contagem).toContainText(`Mostrando ${Math.min(50, total)} de ${total}`);
});

test('aba FIIs: colunas de fundo e contador nas abas', async ({ page }) => {
  await abrirQuadro(page);
  const abaFii = page.getByRole('button', { name: /^FIIs \d+$/ });
  await expect(abaFii).toBeVisible();
  await abaFii.click();
  await expect(page).toHaveURL(/classe=fii/);
  await expect(page.getByRole('button', { name: 'Ordenar por Fundo' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Rendimento 10 anos' })).toBeVisible();
  await expect(abaFii).toHaveAttribute('aria-current', 'page');
});

test('busca "weg" → WEGE3 abre a página do ativo; "/" foca a busca', async ({ page }) => {
  await abrirQuadro(page);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  const campo = page.getByRole('combobox', { name: 'Buscar ativo' });
  await expect(campo).toBeFocused();
  await campo.fill('weg');
  const opcao = page.getByRole('option', { name: /WEGE3/ });
  await expect(opcao).toBeVisible({ timeout: 30_000 });
  await expect(campo).toHaveAttribute('aria-expanded', 'true');
  await campo.press('Enter');
  await expect(page).toHaveURL(/\/analise-ativos\/WEGE3$/);
});

test('busca sem resultado diz o que cobre; textos sem linguagem proibida', async ({ page }) => {
  await abrirQuadro(page);
  const campo = page.getByRole('combobox', { name: 'Buscar ativo' });
  await campo.fill('AAPL');
  await expect(page.getByText('A busca cobre ações e FIIs da B3, por ticker ou nome')).toBeVisible({
    timeout: 30_000,
  });
  await campo.fill('');
  // varredura do Quadro (o rodapé legal fica fora: texto fixo exigido)
  for (const classe of ['acao', 'fii']) {
    await abrirQuadro(page, classe === 'fii' ? '?classe=fii&modo=detalhado' : '?modo=detalhado');
    const texto = await quadro(page).innerText();
    expect(encontrarPalavrasProibidas(texto), classe).toEqual([]);
    expect(texto).not.toMatch(/\b(comprar?|recomenda\w*|nota)\b/i);
  }
});
