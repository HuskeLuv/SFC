import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { gotoPlanejar, mockarPlanejar } from './helpers/planejar';

/**
 * Esconder valores — Fase 3, fatia 1: Sonhos (/planejamento-financeiro?modo=sonhos). Dashboard
 * (métricas, capacidade de poupança, reserva de emergência, cartões e tabela), detalhe do objetivo
 * (resumo, gráfico, histórico mensal), formulários (Registrar mês e Editar) e as versões do
 * celular. Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura: as APIs
 * do Planejar são respondidas por `mockarPlanejar` (fixtures fixas, independentes do mês corrente)
 * e os formulários são fechados sem salvar.
 *
 * Com o olho fechado: nenhum R$ (compactos "R$ 88 K" inclusive) e nenhum número lido com o olho
 * aberto pode sobrar; % de progresso, prazos, nomes e contagens ficam; altura das linhas e
 * tamanho do documento não mudam.
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

async function abrir(page: Page) {
  const mock = await mockarPlanejar(page);
  await gotoPlanejar(page, 'sonhos');
  await expect(page.getByText('Viagem ao Japão').first()).toBeVisible();
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
  const expostosAbertos = await coletarValoresExpostos(page, escopo);
  const numeros = await coletarNumerosDaPosicao(page, escopo, OPCOES);
  expect(
    expostosAbertos.length + numeros.length,
    'a tela mostra valores com o olho aberto',
  ).toBeGreaterThan(0);
  const antes = await tamanhoDoDocumento(page);
  const alturasAntes = await alturas(linhas);
  expect(alturasAntes.length).toBeGreaterThan(0);

  await alternarOlho(page, true);
  await expect(page.locator(`${escopo} .mf-sensivel`).first()).toBeVisible();
  expect(await coletarValoresExpostos(page, escopo)).toEqual([]);
  await expectNumerosAusentes(page, numeros, escopo, OPCOES);
  expect(await atributosComValor(page, escopo)).toEqual([]);
  expect(await alturas(linhas)).toEqual(alturasAntes);
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

test.describe('esconder valores — Sonhos (desktop 1280)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('dashboard: métricas, capacidade, reserva, cartões e tabela sem valores', async ({
    page,
  }) => {
    const { escritas } = await abrir(page);
    // Cartões: o compacto da meta aparece com o olho aberto.
    expect((await coletarValoresExpostos(page)).map((v) => v.trim())).toContain('R$ 88 K');
    const progresso = await page.getByText(/^\d+%$/).allInnerTexts();
    expect(progresso.length).toBeGreaterThan(0);

    const cartoes = page.locator(`${CONTEUDO} button:has(h3)`);
    await conferirOlhoFechado(page, cartoes);

    // Olho fechado: % de progresso, nomes e contagens continuam.
    await alternarOlho(page, true);
    expect(await page.getByText(/^\d+%$/).allInnerTexts()).toEqual(progresso);
    await expect(page.getByText('Trocar de carro').first()).toBeVisible();
    await expect(page.getByText('2 em andamento')).toBeVisible();
    await alternarOlho(page, false);

    // Tabela consolidada: linhas com a mesma altura.
    await page.getByRole('button', { name: 'Tabela', exact: true }).click();
    const linhas = page.locator(`${CONTEUDO} table tr`);
    await expect(linhas.first()).toBeVisible();
    await conferirOlhoFechado(page, linhas);

    if (!process.env.CI) {
      await alternarOlho(page, true);
      await page.screenshot({
        path: 'test-results/valores-ocultos-sonhos-dashboard-desktop.png',
        fullPage: true,
      });
    }
    expect(escritas).toEqual([]);
  });

  test('detalhe: resumo, gráfico e histórico mensal; formulários com o número', async ({
    page,
  }) => {
    const { escritas } = await abrir(page);
    await page
      .getByRole('button', { name: /Viagem ao Japão/ })
      .first()
      .click();
    await expect(page.getByText(/Histórico Mensal · 9 registros/)).toBeVisible();
    const taxa = page.getByText(/0\.80%\/mês/).first();
    await expect(taxa).toBeVisible();

    // Gráfico desenhado (os rótulos do eixo Y entram na medida com o olho aberto).
    await expect(page.locator(`${CONTEUDO} .apexcharts-yaxis-label`).first()).toBeVisible({
      timeout: 30_000,
    });
    const linhas = page.locator(`${CONTEUDO} table tr`);
    await conferirOlhoFechado(page, linhas);

    // Gráfico: tooltip e eixo Y sem dinheiro; meses do eixo X ficam.
    await alternarOlho(page, true);
    const tooltip = await tooltipDoGrafico(page);
    await expect(tooltip.locator('.mf-pilula-grafico').first()).toBeAttached();
    expect(await coletarValoresExpostos(page)).toEqual([]);
    await expect(page.locator(`${CONTEUDO} .apexcharts-xaxis-label`).first()).toHaveText(/\/26/);
    await expect(taxa).toBeVisible();

    // Registrar mês: campos com o número (decisão 3); Planejado, saldo planejado e deltas em pílula.
    await page.getByRole('button', { name: '+ Registrar Mês' }).click();
    const modal = page.locator(DIALOGO).filter({ hasText: 'Registrar mês' });
    await expect(modal).toBeVisible();
    await expect(modal.locator('#entry-aporte')).toHaveValue(/\d/);
    await expect(modal.locator('#entry-balance')).toHaveValue(/\d/);
    await expect(modal.locator('.mf-sensivel')).toHaveCount(4);
    expect(await coletarValoresExpostos(page, DIALOGO)).toEqual([]);
    await expect(modal).toContainText(/Progresso:\s*\d/);
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toBeHidden();

    // Editar: o aporte mensal calculado (fora do campo) vira pílula; os campos ficam.
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(page.locator('#inline-target')).toHaveValue('87654.32');
    await expect(page.getByText('Aporte mensal:')).toBeVisible();
    expect(await coletarValoresExpostos(page)).toEqual([]);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

    if (!process.env.CI) {
      await page.screenshot({
        path: 'test-results/valores-ocultos-sonhos-detalhe-desktop.png',
        fullPage: true,
      });
    }
    expect(escritas).toEqual([]);
  });
});

const CELULARES = [
  { nome: 'celular 390', largura: 390 },
  { nome: 'celular 320', largura: 320 },
] as const;

for (const celular of CELULARES) {
  test.describe(`esconder valores — Sonhos (${celular.nome})`, () => {
    test.use({
      viewport: { width: celular.largura, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    test('dashboard e detalhe: pílulas curtas, alturas iguais, nada alarga', async ({ page }) => {
      const { escritas } = await abrir(page);
      const cartoes = page.locator(`${CONTEUDO} [data-mf-card]`);
      await expect(cartoes.first()).toBeVisible();
      await conferirOlhoFechado(page, cartoes);

      await alternarOlho(page, true);
      await expect(cartoes.first()).toContainText(/\d+% ·/);
      await expect(cartoes.first()).toContainText(/em \d+ meses/);
      await alternarOlho(page, false);

      await cartoes.filter({ hasText: 'Viagem ao Japão' }).getByRole('button').click();
      await expect(page.getByText(/Histórico Mensal · 9 registros/)).toBeVisible();
      const registros = page.locator(`${CONTEUDO} [data-mf-card]`);
      await conferirOlhoFechado(page, registros);

      if (!process.env.CI) {
        await alternarOlho(page, true);
        await page.screenshot({
          path: `test-results/valores-ocultos-sonhos-detalhe-${celular.largura}.png`,
          fullPage: true,
        });
      }
      expect(escritas).toEqual([]);
    });
  });
}
