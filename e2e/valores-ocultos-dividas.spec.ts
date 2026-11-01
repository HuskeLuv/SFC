import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { gotoDividas, ID_DIVIDA, mockarDividas, SENTINELAS_DIVIDAS } from './helpers/dividas';

/**
 * Esconder valores — Fase 4, fatia 1: Dívidas (/dividas). Painel (métricas, tabela, cartões do
 * celular), detalhe da dívida (métricas, gráfico e cronograma, pagamentos) e Registrar pagamento.
 * Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura: as APIs de Dívidas
 * são respondidas por `mockarDividas` (fixtures fixas, independentes do mês corrente) e o modal é
 * fechado sem salvar.
 *
 * Com o olho fechado: nenhum R$ e nenhum número lido com o olho aberto pode sobrar; taxa/CET,
 * nº de parcelas, prazos, datas e nomes ficam; nenhuma linha cresce e o documento não alarga.
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

const CONTEUDO = '[data-mf-content]';
const DIALOGO = '[role="dialog"]';
const OPCOES = { ignorarPercentuais: true } as const;
const SENTINELAS_TELA = Object.values(SENTINELAS_DIVIDAS).map((v) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
);

async function abrir(page: Page, id?: string) {
  const mock = await mockarDividas(page);
  await gotoDividas(page, id);
  // O provider montou (o clique no olho antes da hidratação não faz nada).
  await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
  return mock;
}

/** aria-label/title com número em R$ (o mascarar deixa "R$ •••••"). */
async function atributosComValor(page: Page, escopo: string): Promise<string[]> {
  return page.evaluate((escopo) => {
    const raiz = document.querySelector(escopo) ?? document.body;
    const valores: string[] = [];
    for (const el of [raiz, ...Array.from(raiz.querySelectorAll('*'))]) {
      for (const attr of ['aria-label', 'title']) {
        const v = el.getAttribute(attr);
        if (v && /R\$\s?-?\d/.test(v)) valores.push(v);
      }
    }
    return valores;
  }, escopo);
}

const alturas = (linhas: Locator) =>
  linhas.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));

/**
 * Fecha o olho e confere a tela: nenhum R$ nem número da posição, atributos limpos, pílulas na
 * tela, alturas das `linhas` iguais e documento sem alargar. Reabre o olho no fim e confere que
 * os números voltam.
 */
async function conferirOlhoFechado(page: Page, linhas: Locator, escopo = CONTEUDO) {
  const numeros = await coletarNumerosDaPosicao(page, escopo, OPCOES);
  expect(numeros.length, 'a tela mostra valores com o olho aberto').toBeGreaterThan(0);
  const antes = await tamanhoDoDocumento(page);
  const alturasAntes = await alturas(linhas);
  expect(alturasAntes.length).toBeGreaterThan(0);

  await alternarOlho(page, true);
  await expect(page.locator(`${escopo} .mf-sensivel`).first()).toBeVisible();
  expect(await coletarValoresExpostos(page, escopo)).toEqual([]);
  await expectNumerosAusentes(page, numeros, escopo, OPCOES);
  await expectNumerosAusentes(page, SENTINELAS_TELA, escopo, OPCOES);
  expect(await atributosComValor(page, escopo)).toEqual([]);
  // Nenhuma linha cresce. Onde o valor de hoje quebra em 2 linhas (cronograma do celular, o
  // total da coluna Parcela no desktop) a pílula de largura fixa (decisão 4) cabe numa só, e a
  // linha pode ficar mais baixa — nunca mais alta.
  const alturasDepois = await alturas(linhas);
  expect(alturasDepois).toHaveLength(alturasAntes.length);
  alturasDepois.forEach((h, i) => expect(h, `linha ${i}`).toBeLessThanOrEqual(alturasAntes[i]));
  const depois = await tamanhoDoDocumento(page);
  expect(depois.largura).toBeLessThanOrEqual(antes.largura);

  await alternarOlho(page, false);
  await expect(page.locator(`${escopo} .mf-sensivel`)).toHaveCount(0);
  // O gráfico remonta ao alternar: espera os rótulos voltarem.
  await expect
    .poll(async () => (await coletarNumerosDaPosicao(page, escopo, OPCOES)).sort())
    .toEqual([...numeros].sort());
}

async function tooltipDoGrafico(page: Page) {
  const grafico = page.locator(`${CONTEUDO} .apexcharts-canvas`).first();
  await expect(grafico).toBeVisible({ timeout: 30_000 });
  const caixa = (await grafico.boundingBox())!;
  await page.mouse.move(caixa.x + caixa.width * 0.3, caixa.y + caixa.height * 0.55);
  const tooltip = page.locator(`${CONTEUDO} .apexcharts-tooltip.apexcharts-active`).first();
  await expect(tooltip).toBeVisible({ timeout: 10_000 });
  return tooltip;
}

test.describe('esconder valores — Dívidas (desktop 1280)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('painel: métricas e tabela sem valores; CET, parcelas e status ficam', async ({ page }) => {
    const { escritas } = await abrir(page);
    const linhas = page.locator(`${CONTEUDO} table tr`);
    await expect(linhas.first()).toBeVisible();
    const cet = await page.getByText(/^\d+,\d{2}%$/).allInnerTexts();
    expect(cet.length).toBeGreaterThan(0);

    await conferirOlhoFechado(page, linhas);

    await alternarOlho(page, true);
    expect(await page.getByText(/^\d+,\d{2}%$/).allInnerTexts()).toEqual(cet);
    await expect(page.getByText('20/120')).toBeVisible();
    await expect(page.getByText('Financiamento do carro').first()).toBeVisible();
    if (!process.env.CI) {
      await page.screenshot({
        path: 'test-results/valores-ocultos-dividas-painel-desktop.png',
        fullPage: true,
      });
    }
    await alternarOlho(page, false);
    expect(escritas).toEqual([]);
  });

  test('detalhe: métricas, gráfico, cronograma e pagamentos; registrar pagamento', async ({
    page,
  }) => {
    const { escritas } = await abrir(page, ID_DIVIDA.imovel);
    await expect(page.locator(`${CONTEUDO} .apexcharts-yaxis-label`).first()).toBeVisible({
      timeout: 30_000,
    });
    const linhas = page.locator(`${CONTEUDO} table tr`);
    await expect(linhas.first()).toBeVisible();
    await conferirOlhoFechado(page, linhas);

    // Gráfico: os dois eixos Y sem rótulo, tooltip com pílula; meses do eixo X ficam.
    await alternarOlho(page, true);
    const rotulosY = await page
      .locator(`${CONTEUDO} .apexcharts-yaxis-label`)
      .evaluateAll((els) => els.map((el) => el.textContent?.trim()).filter(Boolean));
    expect(rotulosY).toEqual([]);
    const tooltip = await tooltipDoGrafico(page);
    await expect(tooltip.locator('.mf-pilula-grafico').first()).toBeAttached();
    expect(await coletarValoresExpostos(page)).toEqual([]);
    await expect(page.locator(`${CONTEUDO} .apexcharts-xaxis-label`).first()).toHaveText(/\/\d\d/);

    // Registrar pagamento: o campo fica (decisão 3); a parcela esperada vira pílula.
    await page.getByRole('button', { name: 'Registrar pagamento' }).first().click();
    const modal = page.locator(DIALOGO).filter({ hasText: 'Parcela esperada' });
    await expect(modal).toBeVisible();
    await expect(modal.locator('#pg-valor')).toHaveValue(/\d/);
    await expect(modal.locator('.mf-sensivel').first()).toBeAttached();
    expect(await coletarValoresExpostos(page, DIALOGO)).toEqual([]);
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toBeHidden();

    if (!process.env.CI) {
      await page.screenshot({
        path: 'test-results/valores-ocultos-dividas-detalhe-desktop.png',
        fullPage: true,
      });
    }
    await alternarOlho(page, false);
    expect(escritas).toEqual([]);
  });
});

test.describe('esconder valores — Dívidas (celular 390)', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('painel: grade 2×2 e cartões sem valores', async ({ page }) => {
    const { escritas } = await abrir(page);
    const cartoes = page.locator(`${CONTEUDO} [data-mf-card]`);
    await expect(cartoes.first()).toBeVisible();
    await conferirOlhoFechado(page, cartoes);
    await alternarOlho(page, true);
    await expect(page.getByText('20 de 120 parcelas pagas')).toBeVisible();
    if (!process.env.CI) {
      await page.screenshot({
        path: 'test-results/valores-ocultos-dividas-painel-390.png',
        fullPage: true,
      });
    }
    await alternarOlho(page, false);
    expect(escritas).toEqual([]);
  });

  test('detalhe: grade, gráfico e lista do cronograma sem valores', async ({ page }) => {
    const { escritas } = await abrir(page, ID_DIVIDA.carro);
    const parcelas = page.locator(`${CONTEUDO} li[data-mf-parcela]`);
    await expect(parcelas.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`${CONTEUDO} .apexcharts-yaxis-label`).first()).toBeVisible({
      timeout: 30_000,
    });
    await conferirOlhoFechado(page, parcelas);
    if (!process.env.CI) {
      await alternarOlho(page, true);
      await page.screenshot({
        path: 'test-results/valores-ocultos-dividas-detalhe-390.png',
        fullPage: true,
      });
      await alternarOlho(page, false);
    }
    expect(escritas).toEqual([]);
  });
});
