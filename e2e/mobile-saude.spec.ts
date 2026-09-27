import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  expectChartsFit,
  expectFitsWithoutClip,
  expectMinTarget,
  gotoMobile,
  prepareMobilePage,
  waitForIdle,
} from './helpers/mobileFit';
import {
  A4,
  printDesktopLike,
  printPhoneLike,
  printSignature,
  visibleMobileOnly,
} from './helpers/print';

/**
 * PWA fase 3 — fatia B: Saúde Financeira no celular (projeto `mobile`, SÓ LEITURA).
 *
 * - cabe a 390 e 320 (a única rolagem horizontal é a matriz da Evolução, declarada);
 * - Status é o 1º bloco depois do título; blocos recolhíveis com aria-expanded;
 * - Balanço em quadrantes (sem <table> visível); ⋯ com Exportar PDF (não clica);
 * - imprimir a partir do celular dá a MESMA assinatura do desktop e nenhum [data-mf-mobile].
 *
 * Roda contra o banco do seed no CI: seguros e evolução podem estar vazios — o que depende de
 * dado fica condicional e anotado. Nada é salvo.
 */

const ROUTE = '/saude-financeira';
const READY = 'h2:has-text("Saúde Financeira")';
const BLOCOS = [
  ['Dados Econômicos', 'saude-bloco-dados'],
  ['Balanço Patrimonial', 'saude-bloco-balanco'],
  ['Evolução', 'saude-bloco-evolucao'],
  ['Gestão de Risco (seguros)', 'saude-bloco-seguros'],
] as const;

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

const bloco = (page: Page, titulo: string) =>
  page.locator(`button[data-mf-mobile][aria-controls]`, { hasText: titulo }).first();

async function abrirTodos(page: Page) {
  for (const [titulo] of BLOCOS) {
    const b = bloco(page, titulo);
    if ((await b.getAttribute('aria-expanded')) === 'false') await b.click();
  }
  await waitForIdle(page, { settleMs: 1_000 });
}

for (const width of [390, 320]) {
  test(`Saúde cabe sem corte a ${width}px (fechada e com os blocos abertos)`, async ({ page }) => {
    test.setTimeout(180_000);
    await gotoMobile(page, ROUTE, { width, readySelector: READY });
    await expectFitsWithoutClip(page, `saude-${width}`, { width });
    await abrirTodos(page);
    await expectFitsWithoutClip(page, `saude-${width}-aberta`, { width });
    await expectChartsFit(page);
  });
}

test('Status no topo, blocos recolhíveis e Balanço em quadrantes', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoMobile(page, ROUTE, { readySelector: READY });

  // Título compacto e visível; o Status vem antes do cabeçalho do cliente e do fluxo.
  await expect(page.locator(READY).first()).toBeVisible();
  const status = page.getByRole('heading', { name: 'Status Saúde Financeira' });
  const cliente = page.getByText('Data do diagnóstico', { exact: true });
  const fluxo = page.getByRole('heading', { name: 'Indicadores Financeiros (Fluxo de Caixa)' });
  const yStatus = (await status.boundingBox())!.y;
  expect(yStatus).toBeLessThan((await cliente.boundingBox())!.y);
  expect(yStatus).toBeLessThan((await fluxo.boundingBox())!.y);
  // Selo ponto + palavra (sem o badge colorido de hoje).
  await expect(page.locator('[data-mf-status]').first()).toBeVisible();

  for (const [titulo, id] of BLOCOS) {
    const b = bloco(page, titulo);
    await expect(b).toBeVisible();
    await expect(b).toHaveAttribute('aria-expanded', 'false');
    await expect(b).toHaveAttribute('aria-controls', id);
    await expectMinTarget(b);
    await expect(page.locator(`#${id}`)).toBeHidden();
  }

  const balanco = bloco(page, 'Balanço Patrimonial');
  await balanco.click();
  await expect(balanco).toHaveAttribute('aria-expanded', 'true');
  const conteudo = page.locator('#saude-bloco-balanco');
  await expect(conteudo.locator('[data-mf-mobile]').first()).toBeVisible();
  await expect(
    conteudo.locator('[data-mf-mobile]').getByText('TOTAL Ativos Curto Prazo'),
  ).toBeVisible();
  await expect(
    conteudo.locator('[data-mf-mobile]').getByText('Total do Patrimônio Líquido'),
  ).toBeVisible();
  expect(await conteudo.locator('table:visible').count()).toBe(0);
  await expectMinTarget(conteudo.getByRole('link', { name: /Gerenciar dívidas/ }));
});

test('Evolução: matriz com rolagem declarada, no mês mais recente', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoMobile(page, ROUTE, { readySelector: READY });
  await bloco(page, 'Evolução').click();
  await waitForIdle(page, { settleMs: 1_000 });
  const wrapper = page.locator('#saude-bloco-evolucao [data-mf-scroll-x]:has(table)');
  if ((await wrapper.count()) === 0) {
    test.info().annotations.push({
      type: 'sem dado',
      description: 'menos de 2 fotos mensais: a Evolução não tem a matriz',
    });
    return;
  }
  await expect(wrapper).toBeVisible();
  const m = await wrapper.evaluate((el) => ({
    left: el.scrollLeft,
    sw: el.scrollWidth,
    cw: el.clientWidth,
  }));
  if (m.sw > m.cw + 1) expect(m.left, 'abre no fim (mês mais recente)').toBeGreaterThan(0);
  else test.info().annotations.push({ type: 'matriz cabe', description: JSON.stringify(m) });
  await expectChartsFit(page);
});

test('⋯ abre o menu com Exportar PDF e Configurar metas', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoMobile(page, ROUTE, { readySelector: READY });
  const mais = page.getByRole('button', { name: 'Mais ações da Saúde Financeira' });
  await expectMinTarget(mais);
  // O Exportar PDF do desktop some na tela do celular.
  await expect(page.getByRole('button', { name: 'Exportar PDF' })).toHaveCount(0);
  await mais.click();
  const menu = page.locator('[data-mf-action-sheet]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Exportar PDF' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Configurar metas' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

/**
 * Wrappers do bloco recolhível (o <div> do MobileCollapsible e o do conteúdo) são neutros na
 * impressão: viram `display: contents` só para a medida, e a assinatura compara o resto.
 */
async function neutralizarRecolhiveis(page: Page) {
  await page.addStyleTag({
    content:
      '[data-mf-collapsible], div:has(> button[data-mf-mobile][aria-controls] + [data-mf-collapsible]) { display: contents !important; }',
  });
}

async function assinaturaDesktop(browser: Browser, storageState: string) {
  const ctx = await browser.newContext({ storageState, viewport: A4 });
  const desk = await ctx.newPage();
  await prepareMobilePage(desk);
  await printDesktopLike(desk, ROUTE, READY);
  const sig = await printSignature(desk);
  await ctx.close();
  return sig;
}

test('Impressão a partir do celular = impressão do desktop', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const desktop = await assinaturaDesktop(browser, 'e2e/.auth/user.json');

  await printPhoneLike(page, ROUTE, READY);
  // A folha A4 do celular: a janela passa a ter a largura da folha, mas o JS continua de celular.
  await page.setViewportSize(A4);
  await page.waitForTimeout(1_500);
  expect(await page.evaluate(() => matchMedia('(max-width: 1023.98px)').matches)).toBe(true);
  expect(await visibleMobileOnly(page), '[data-mf-mobile] visível na impressão').toBe(0);
  await neutralizarRecolhiveis(page);
  const celular = await printSignature(page);
  expect(celular.join('\n')).toBe(desktop.join('\n'));
});
