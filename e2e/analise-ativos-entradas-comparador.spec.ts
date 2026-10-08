import { test, expect, type Page } from '@playwright/test';
import { exigirRecursoBlocoD, TICKERS_BLOCO_D_CI } from './fixtures/analise-bloco-d';
import { expectFitsWithoutClip, expectMinTarget, prepareMobilePage } from './helpers/mobileFit';

/**
 * Análise de Ativos — Bloco D, fatia D: entradas do Comparador (SÓ LEITURA). Pílulas
 * Quadro | Comparador, modo "Comparar" do Quadro (caixas + bandeja) e o botão "Comparar" do
 * cabeçalho do ativo. Pulam sem o recurso 'comparador' (no CI as 3 flags ficam ligadas). A página do
 * Comparador é da fatia C: aqui só conferimos o link (?t=).
 */

async function aceitarCookies(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
      sessionStorage.clear();
    } catch {
      /* sem storage */
    }
  });
}

const quadro = (page: Page) => page.locator('section[aria-label="Quadro"]');
const bandeja = (page: Page) => page.getByRole('region', { name: 'Seleção para comparar' });

async function abrirQuadro(page: Page, pronto: string) {
  await page.goto('/analise-ativos', { waitUntil: 'domcontentloaded' });
  await quadro(page).locator(pronto).first().waitFor({ timeout: 60_000 });
}

/** Tickers das primeiras linhas/cartões do Quadro (a ordem depende do banco). */
async function primeirosTickers(page: Page, n: number): Promise<string[]> {
  return (
    await quadro(page)
      .locator('[data-ticker]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-ticker') ?? ''))
  ).slice(0, n);
}

test.describe('computador', () => {
  test.beforeEach(async ({ page }) => {
    await aceitarCookies(page);
    await exigirRecursoBlocoD(page, 'comparador');
  });

  test('pílulas com aria-current e 44px', async ({ page }) => {
    test.setTimeout(90_000);
    await abrirQuadro(page, 'tbody tr[data-ticker]');
    const nav = page.getByRole('navigation', { name: 'Páginas da Análise de Ativos' });
    const q = nav.getByRole('link', { name: 'Quadro' });
    const c = nav.getByRole('link', { name: 'Comparador' });
    await expect(q).toHaveAttribute('aria-current', 'page');
    await expect(c).not.toHaveAttribute('aria-current', 'page');
    await expect(c).toHaveAttribute('href', '/analise-ativos/comparador');
    for (const l of [q, c]) await expectMinTarget(l);
  });

  test('Quadro → Comparar → marcar 3 → ?t= com os 3, na ordem marcada', async ({ page }) => {
    test.setTimeout(120_000);
    await abrirQuadro(page, 'tbody tr[data-ticker]');
    const botao = page.getByRole('button', { name: 'Comparar', exact: true });
    await expect(botao).toHaveAttribute('aria-pressed', 'false');
    await expectMinTarget(botao);
    await botao.click();
    await expect(page.getByRole('button', { name: 'Sair do modo comparar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const tickers = await primeirosTickers(page, 3);
    expect(tickers).toHaveLength(3);
    await expect(bandeja(page)).toContainText('0 de 4 selecionados');
    await expect(bandeja(page).getByRole('button', { name: /Comparar/ })).toBeDisabled();
    for (const t of tickers) {
      const caixa = page.getByRole('checkbox', { name: `Comparar ${t}` });
      // área de toque de 44×44 é o <label> em volta da caixa de 18px
      await expectMinTarget(caixa.locator('xpath=ancestor::label[1]'));
      await caixa.check();
    }
    // marcar não abre a página do ativo
    await expect(page).toHaveURL(/\/analise-ativos(\?.*)?$/);
    await expect(bandeja(page)).toContainText('3 de 4 selecionados');
    const ir = bandeja(page).getByRole('link', { name: `Comparar ${tickers.join(', ')}` });
    await expectMinTarget(ir);
    await expectMinTarget(bandeja(page).getByRole('button', { name: 'Limpar' }));
    await expect(ir).toHaveAttribute('href', `/analise-ativos/comparador?t=${tickers.join(',')}`);

    // limite: o 4º marca e o 5º fica desabilitado
    const todos = await primeirosTickers(page, 5);
    if (todos.length === 5) {
      await page.getByRole('checkbox', { name: `Comparar ${todos[3]}` }).check();
      await expect(bandeja(page)).toContainText('limite atingido');
      await expect(page.getByRole('checkbox', { name: `Comparar ${todos[4]}` })).toBeDisabled();
      await page.getByRole('checkbox', { name: `Comparar ${todos[3]}` }).uncheck();
    }

    await ir.click();
    await expect(page).toHaveURL(
      new RegExp(`/analise-ativos/comparador\\?t=${tickers.join(',')}$`),
    );
  });

  test('trocar de aba limpa a seleção', async ({ page }) => {
    test.setTimeout(120_000);
    await abrirQuadro(page, 'tbody tr[data-ticker]');
    await page.getByRole('button', { name: 'Comparar', exact: true }).click();
    const [t] = await primeirosTickers(page, 1);
    await page.getByRole('checkbox', { name: `Comparar ${t}` }).check();
    await expect(bandeja(page)).toContainText('1 de 4 selecionados');
    await quadro(page)
      .getByRole('button', { name: /^FIIs \d+$/ })
      .click();
    await expect(page).toHaveURL(/classe=fii/);
    await expect(bandeja(page)).toContainText('0 de 4 selecionados');
    await expect(bandeja(page)).toContainText('marque de 1 a 4 FIIs');
  });

  test('ativo → Comparar → ?t=TICKER (depois de Planejar/Registrar)', async ({ page }) => {
    test.setTimeout(90_000);
    const t = TICKERS_BLOCO_D_CI.acao;
    await page.goto(`/analise-ativos/${t}`, { waitUntil: 'domcontentloaded' });
    const link = page.getByRole('link', { name: `Comparar ${t} com outros ativos` });
    await link.waitFor({ timeout: 60_000 });
    await expectMinTarget(link);
    await expect(link).toHaveAttribute('href', `/analise-ativos/comparador?t=${t}`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/analise-ativos/comparador\\?t=${t}$`));
  });
});

test.describe('celular', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test.beforeEach(async ({ page }) => {
    await prepareMobilePage(page);
    await aceitarCookies(page);
    await exigirRecursoBlocoD(page, 'comparador');
  });

  for (const width of [390, 320]) {
    test(`Quadro @ ${width}: caixas e bandeja com 44px, bandeja não cobre o conteúdo`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: width === 320 ? 640 : 844 });
      await abrirQuadro(page, '[data-quadro-cartoes] li');
      for (const l of await page
        .getByRole('navigation', { name: 'Páginas da Análise de Ativos' })
        .getByRole('link')
        .all())
        await expectMinTarget(l);
      const botao = page.getByRole('button', { name: 'Comparar', exact: true });
      await expectMinTarget(botao);
      await botao.click();

      const tickers = await primeirosTickers(page, 2);
      for (const t of tickers) {
        const caixa = page.getByRole('checkbox', { name: `Comparar ${t}` });
        await expectMinTarget(caixa.locator('xpath=ancestor::label[1]'));
        await caixa.check();
      }
      await expect(bandeja(page)).toContainText('2 de 4 selecionados');
      for (const b of await bandeja(page).locator('a, button').all()) await expectMinTarget(b);
      await expectFitsWithoutClip(page, `quadro-comparar-${width}`, { width });

      // fixa acima da barra de abas
      const tab = await page.locator('[data-mf-tabbar]').first().boundingBox();
      const caixa = await bandeja(page).boundingBox();
      if (tab && caixa) expect(caixa.y + caixa.height).toBeLessThanOrEqual(tab.y);

      // no fim da página, o último conteúdo (rodapé legal) fica acima da bandeja
      // content-visibility dos cartões muda a altura enquanto rola: rola até o fim estabilizar
      for (let i = 0, antes = -1; i < 10; i++) {
        const altura = await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          return document.documentElement.scrollHeight;
        });
        if (altura === antes) break;
        antes = altura;
        await page.waitForTimeout(400);
      }
      const fim = await page.locator('[data-analise-ativos="quadro"] > *').last().boundingBox();
      const caixaFim = await bandeja(page).boundingBox();
      expect(fim && caixaFim).toBeTruthy();
      expect(fim!.y + fim!.height).toBeLessThanOrEqual(caixaFim!.y + 0.5);
    });
  }

  test('ativo @ 390: Planejar/Registrar/Comparar com 44px', async ({ page }) => {
    test.setTimeout(90_000);
    const t = TICKERS_BLOCO_D_CI.acao;
    await page.goto(`/analise-ativos/${t}`, { waitUntil: 'domcontentloaded' });
    const link = page.getByRole('link', { name: `Comparar ${t} com outros ativos` });
    await link.waitFor({ timeout: 60_000 });
    for (const el of await page
      .locator('[data-bloco="cabecalho"] [data-acoes-cabecalho]')
      .locator('a, button')
      .all())
      await expectMinTarget(el);
  });
});
