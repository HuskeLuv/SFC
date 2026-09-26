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
 * PWA fase 3 — fatia B: Relatórios no celular (projeto `mobile`, SÓ LEITURA).
 *
 * - cabe a 390 e 320, fechado e com as seções abertas;
 * - período em chips (as mesmas opções do select); Personalizado → 2 datas nativas;
 * - Posição e Movimentações abertas por padrão, em cartões (ou o vazio de hoje);
 * - imprimir a partir do celular dá a MESMA assinatura do desktop (é o `test.fixme` do
 *   desktop-fase3 ligado aqui, com o helper de print.ts) e nenhum [data-mf-mobile] visível.
 *
 * Roda contra o banco do seed no CI: sem movimentação/posição, o vazio de hoje vale.
 */

const ROUTE = '/relatorios';
const READY = 'h2:has-text("Resumo Executivo")';
const SECOES = [
  ['Posição Consolidada', 'relatorio-posicao', true],
  ['Rentabilidade da Carteira', 'relatorio-rentabilidade', false],
  ['Proventos Recebidos', 'relatorio-proventos', false],
  ['Distribuição de Ativos', 'relatorio-distribuicao', false],
  ['Evolução Patrimonial', 'relatorio-evolucao', false],
  ['Movimentações do Período', 'relatorio-movimentacoes', true],
  ['Fluxo de Caixa Consolidado', 'relatorio-fluxo', false],
] as const;

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

const secao = (page: Page, id: string) => page.locator(`button[aria-controls="${id}"]`);

async function abrirTodas(page: Page) {
  for (const [, id] of SECOES) {
    const b = secao(page, id);
    if ((await b.getAttribute('aria-expanded')) === 'false') await b.click();
  }
  await waitForIdle(page, { settleMs: 1_500 });
}

for (const width of [390, 320]) {
  test(`Relatórios cabem sem corte a ${width}px (fechados e abertos)`, async ({ page }) => {
    test.setTimeout(240_000);
    await gotoMobile(page, ROUTE, { width, readySelector: READY });
    await expectFitsWithoutClip(page, `relatorios-${width}`, { width });
    await abrirTodas(page);
    await expectFitsWithoutClip(page, `relatorios-${width}-abertos`, { width });
    await expectChartsFit(page);
  });
}

test('seções recolhíveis: Posição e Movimentações abertas, em cartões', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoMobile(page, ROUTE, { readySelector: READY });
  await expect(page.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeVisible();

  for (const [titulo, id, aberta] of SECOES) {
    const b = secao(page, id);
    await expect(b, titulo).toBeVisible();
    await expect(b).toContainText(titulo);
    await expect(b).toHaveAttribute('aria-expanded', aberta ? 'true' : 'false');
    await expectMinTarget(b);
  }

  const posicao = page.locator('#relatorio-posicao');
  const cartoes = posicao.locator('[data-mf-mobile]');
  if ((await cartoes.count()) > 0) {
    await expect(cartoes.first()).toBeVisible();
    await expect(cartoes.first().getByText('Total Geral')).toBeVisible();
  } else {
    await expect(posicao.getByText('Sem posições para exibir.')).toBeVisible();
  }
  expect(await posicao.locator('table:visible').count()).toBe(0);

  const mov = page.locator('#relatorio-movimentacoes');
  expect(await mov.locator('table:visible').count()).toBe(0);
  const verTodas = mov.getByRole('button', { name: /^Ver as \d+$/ });
  if ((await verTodas.count()) > 0) {
    expect(await mov.locator('[data-mf-card]').count()).toBe(5);
    const n = Number((await verTodas.textContent())!.replace(/\D/g, ''));
    await verTodas.click();
    await expect(mov.locator('[data-mf-card]')).toHaveCount(n);
  } else {
    test.info().annotations.push({ type: 'dado', description: 'até 5 movimentações no período' });
  }
});

test('período em chips; Personalizado abre as duas datas nativas', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoMobile(page, ROUTE, { readySelector: READY });
  // O select do desktop some na tela do celular; os chips têm as mesmas opções.
  await expect(page.locator('#report-period')).toBeHidden();
  const rail = page.getByLabel('Filtro de período').filter({ visible: true });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole('button', { name: 'Mês atual' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const personalizado = rail.getByRole('button', { name: 'Personalizado' });
  await personalizado.scrollIntoViewIfNeeded();
  // Chip do MobileTabRail (fatia 0): 36px visíveis + ::before; a área de toque é do primitivo.
  await expectMinTarget(personalizado, 42);
  await personalizado.click();
  await expect(personalizado).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('input[type="date"]:visible')).toHaveCount(2);
  // Exportar PDF do celular: no topo e no fim; o do desktop some.
  await waitForIdle(page);
  const pdf = page.getByRole('button', { name: 'Exportar PDF' });
  await expect(pdf).toHaveCount(2);
  await expectMinTarget(pdf.first());
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

/**
 * "Gráficos à parte": os cartões de gráfico (adaptados na fase 1 com ramos JS de celular —
 * legenda própria da pizza, botões de período, alturas) saem da comparação nos DOIS lados.
 */
const CARTOES_DE_GRAFICO = [
  'Rentabilidade Por Dia',
  'Rentabilidade Por Mês',
  'Histórico de Proventos',
  'Distribuição de Proventos',
  'Distribuição Atual de Ativos',
  'Divisão por Instituição Financeira',
  'Evolução Patrimonial',
];

async function assinaturaSemGraficos(page: Page) {
  await page.evaluate((titulos) => {
    for (const h3 of Array.from(document.querySelectorAll('[data-mf-content] h3'))) {
      if (!titulos.includes((h3.textContent ?? '').trim())) continue;
      const corpo = h3.parentElement?.nextElementSibling as HTMLElement | null;
      if (corpo) corpo.style.display = 'none';
    }
  }, CARTOES_DE_GRAFICO);
  return printSignature(page);
}

async function assinaturaDesktop(browser: Browser) {
  const ctx = await browser.newContext({ storageState: 'e2e/.auth/user.json', viewport: A4 });
  const desk = await ctx.newPage();
  await prepareMobilePage(desk);
  await printDesktopLike(desk, ROUTE, READY);
  const sig = await assinaturaSemGraficos(desk);
  await ctx.close();
  return sig;
}

test('Impressão a partir do celular = impressão do desktop', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const desktop = await assinaturaDesktop(browser);

  await printPhoneLike(page, ROUTE, READY);
  // A folha A4 do celular: a janela passa a ter a largura da folha, mas o JS continua de celular.
  await page.setViewportSize(A4);
  await page.waitForTimeout(2_000);
  expect(await page.evaluate(() => matchMedia('(max-width: 1023.98px)').matches)).toBe(true);
  expect(await visibleMobileOnly(page), '[data-mf-mobile] visível na impressão').toBe(0);
  await neutralizarRecolhiveis(page);
  const celular = await assinaturaSemGraficos(page);
  expect(celular.join('\n')).toBe(desktop.join('\n'));
});
