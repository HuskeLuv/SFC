import { test, expect, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  ligarValoresOcultos,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';

/**
 * Esconder valores — Fase 5, fatia 2: Relatórios (a TELA; o PDF gerado pelo servidor não muda).
 * Resumo Executivo, Posição Consolidada, Movimentações, Fluxo de Caixa Consolidado e os gráficos
 * (proventos, distribuição, evolução) com o olho fechado: nenhum valor do usuário no innerText,
 * nos title/aria-label nem nos rótulos do Apex; % (TWR, CDI, % da carteira), nomes e datas ficam;
 * a altura das linhas não muda e não surge rolagem lateral. Imprimir segue o olho.
 *
 * Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura, com os dados do
 * seed (usuário demo). Período "Últimos 12 meses": "Mês atual" depende do dia (no dia 1º pode
 * estar vazio).
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
      // sem storage: o aviso de cookies aparece e o teste falha de forma visível
    }
  });
});

const ROTA = '/relatorios';
const OPCOES = { ignorarPercentuais: true } as const;
const ESCOPO = '#relatorios-print';
const SECOES_CELULAR = [
  'relatorio-posicao',
  'relatorio-rentabilidade',
  'relatorio-proventos',
  'relatorio-distribuicao',
  'relatorio-evolucao',
  'relatorio-movimentacoes',
  'relatorio-fluxo',
];

/** Linhas cuja altura não pode mudar ao fechar o olho (tabelas, cartões e faixas). */
const LINHAS = [
  `${ESCOPO} table tr`,
  `${ESCOPO} dl > div`,
  `${ESCOPO} .grid > div`,
  `${ESCOPO} [data-mf-card]`,
  `${ESCOPO} section > div`,
  `${ESCOPO} li`,
  `${ESCOPO} button[aria-controls^="relatorio-"]`,
].join(', ');

async function abrir(page: Page, celular: boolean, ocultos = false) {
  await page.goto(ROTA);
  // O provider montou (o clique no olho antes da hidratação não faz nada).
  await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('h2:has-text("Resumo Executivo")')).toBeVisible({ timeout: 60_000 });
  if (celular) {
    await page.getByRole('button', { name: 'Últimos 12 meses' }).filter({ visible: true }).click();
  } else {
    await page.locator('#report-period').selectOption('last-12-months');
  }
  await expect(
    page
      .getByText(/^Últimos 12 meses •/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  if (celular) {
    for (const id of SECOES_CELULAR) {
      const botao = page.locator(`button[data-mf-mobile][aria-controls="${id}"]`);
      if ((await botao.getAttribute('aria-expanded')) === 'false') await botao.click();
    }
  }
  // Posição e Fluxo do seed já carregados (há valores em R$ — ou pílulas — na tela).
  await expect
    .poll(
      async () =>
        ocultos
          ? await page.locator(`${ESCOPO} .mf-sensivel`).count()
          : (await coletarValoresExpostos(page, ESCOPO)).length,
      { timeout: 60_000 },
    )
    .toBeGreaterThan(5);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
}

/** aria-label/title com número em R$/US$ (o mascarar deixa "R$ •••••"). */
async function atributosComValor(page: Page, escopo: string): Promise<string[]> {
  return page.evaluate((escopo) => {
    const raiz = document.querySelector(escopo) ?? document.body;
    const valores: string[] = [];
    for (const el of [raiz, ...Array.from(raiz.querySelectorAll('*'))]) {
      for (const attr of ['aria-label', 'title']) {
        const v = el.getAttribute(attr);
        if (v && /(?:R|US)\$\s?-?\d/.test(v)) valores.push(v);
      }
    }
    return valores;
  }, escopo);
}

const alturas = (page: Page) =>
  page
    .locator(LINHAS)
    .evaluateAll((els) =>
      els
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => Math.round(el.getBoundingClientRect().height)),
    );

/** % visíveis do Resumo (TWR e CDI): continuam com o olho fechado. */
const percentuais = async (page: Page) =>
  ((await page.locator(ESCOPO).innerText()).match(/[+-]?\d+,\d{2}%/g) ?? []).sort();

async function conferir(page: Page, celular: boolean, nome: string, estreito = false) {
  await abrir(page, celular);
  const numeros = await coletarNumerosDaPosicao(page, ESCOPO, OPCOES);
  expect(numeros.length, 'números do usuário com o olho aberto').toBeGreaterThan(3);
  const alturasAbertas = await alturas(page);
  const pcts = await percentuais(page);
  const largura = (await tamanhoDoDocumento(page)).largura;

  await alternarOlho(page, true);
  await expect(page.locator(`${ESCOPO} .mf-sensivel`).first()).toBeVisible();
  expect(await coletarValoresExpostos(page, ESCOPO), 'R$/US$ expostos').toEqual([]);
  await expectNumerosAusentes(page, numeros, ESCOPO, OPCOES);
  expect(await atributosComValor(page, 'body'), 'title/aria-label com valor').toEqual([]);
  const alturasFechadas = await alturas(page);
  if (estreito) {
    // 320px: na tabela do Fluxo de Caixa Consolidado o "R$ 45.525,00" quebra em duas linhas
    // com o olho aberto; a pílula (5,5em) cabe numa só. Nenhuma linha pode CRESCER.
    expect(alturasFechadas).toHaveLength(alturasAbertas.length);
    alturasFechadas.forEach((h, i) =>
      expect(h, `linha ${i} cresceu`).toBeLessThanOrEqual(alturasAbertas[i]),
    );
  } else {
    expect(alturasFechadas, 'altura das linhas').toEqual(alturasAbertas);
  }
  expect(await percentuais(page), '% continuam').toEqual(pcts);
  expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(largura);
  await expect(page.getByText('Posição Consolidada').first()).toBeVisible();

  if (!process.env.CI) {
    await page.screenshot({
      path: `test-results/valores-ocultos-relatorios-${nome}.png`,
      fullPage: true,
    });
  }

  // Reabre: os números voltam iguais.
  await alternarOlho(page, false);
  await expect(page.locator(`${ESCOPO} .mf-sensivel`)).toHaveCount(0);
  expect(await coletarNumerosDaPosicao(page, ESCOPO, OPCOES)).toEqual(numeros);
}

test.describe('esconder valores — Relatórios (desktop 1280)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('resumo, posição, movimentações, fluxo e gráficos sem valores; % ficam', async ({
    page,
  }) => {
    await conferir(page, false, 'desktop');
  });

  test('tooltip da Evolução Patrimonial com pílula', async ({ page }) => {
    await abrir(page, false);
    await alternarOlho(page, true);
    const cartao = page
      .locator(`${ESCOPO} .rounded-2xl`)
      .filter({ has: page.locator('h3', { hasText: 'Evolução Patrimonial' }) });
    const grafico = cartao.locator('.apexcharts-canvas');
    test.skip((await grafico.count()) === 0, 'sem série de patrimônio no período');
    await grafico.scrollIntoViewIfNeeded();
    const caixa = await grafico.boundingBox();
    if (!caixa) throw new Error('gráfico sem caixa');
    await page.mouse.move(caixa.x + caixa.width * 0.6, caixa.y + caixa.height * 0.5);
    const tooltip = cartao.locator('.apexcharts-tooltip.apexcharts-active');
    await expect(tooltip).toBeVisible({ timeout: 10_000 });
    await expect(tooltip.locator('.mf-pilula-grafico').first()).toBeVisible();
    expect(await coletarValoresExpostos(page, ESCOPO)).toEqual([]);
    // Eixo Y sem rótulo em R$.
    const eixo = await cartao.locator('.apexcharts-yaxis-label').allTextContents();
    expect(eixo.filter((t) => /\d/.test(t))).toEqual([]);
  });

  test('imprimir segue o olho: fechado imprime pílulas; aberto imprime os valores', async ({
    page,
    context,
    baseURL,
  }) => {
    await abrir(page, false);
    await page.emulateMedia({ media: 'print' });
    expect((await coletarValoresExpostos(page, ESCOPO)).length).toBeGreaterThan(5);
    await page.emulateMedia({ media: 'screen' });

    await ligarValoresOcultos(context, baseURL!);
    await abrir(page, false, true);
    await page.emulateMedia({ media: 'print' });
    expect(await coletarValoresExpostos(page, ESCOPO)).toEqual([]);
  });
});

for (const largura of [390, 320]) {
  test.describe(`esconder valores — Relatórios (celular ${largura})`, () => {
    test.use({ viewport: { width: largura, height: 844 }, isMobile: true, hasTouch: true });

    test('seções abertas sem valores; altura e largura iguais', async ({ page }) => {
      await conferir(page, true, `${largura}`, largura < 360);
    });
  });
}
