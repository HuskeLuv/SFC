import { test, expect, type Page } from '@playwright/test';
import {
  ORCAMENTO_V2_STORAGE,
  exigirOrcamentoV2,
  gotoOrcamentoV2,
  prepararPagina,
} from './helpers/orcamentoV2';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';

/**
 * Esconder valores — Fase 2, fatia 4: Orçamento v2 (aba Orçamento do /fluxodecaixa). Usuário do
 * seed orcamento.v2@finapp.local (o demo não está no beta do v2); pula sem a flag
 * ORCAMENTO_V2_HABILITADO. Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só
 * leitura: o olho é preferência do aparelho (cookie do contexto) e o campo do orçado é aberto e
 * fechado com Esc, sem gravar.
 *
 * O v2 abre no mês corrente; o seed lança e orça todos os meses dos dois anos, então o mês de hoje
 * tem números mesmo no dia 1º.
 *
 * Com o olho ABERTO lê os números da seção (o dinheiro do Orçamento não tem "R$"; os %, que ficam
 * visíveis, saem da conta) e, com o olho FECHADO, nenhum deles pode sobrar no texto nem em
 * title/aria-label/<title> do gráfico; a página não alarga e nenhuma linha muda de altura.
 */

const ESCOPO = '[data-mf-orcamento-v2]';
const OPCOES = { ignorarPercentuais: true } as const;
const REGEX_VALOR_MONETARIO = /(?:R\$|US\$)\s?-?\d/;

test.use({ storageState: ORCAMENTO_V2_STORAGE });

test.beforeEach(async ({ page }) => {
  await prepararPagina(page);
  await exigirOrcamentoV2(page);
});

/** title/aria-label da seção (fora das pílulas) e o <title> das barras do gráfico. */
async function atributosExpostos(page: Page): Promise<string[]> {
  return page.evaluate((escopo) => {
    const raiz = document.querySelector(escopo);
    if (!raiz) return [];
    const textos: string[] = [];
    raiz.querySelectorAll('[title], [aria-label], [aria-description]').forEach((el) => {
      if (el.closest('.mf-sensivel__valor')) return;
      for (const a of ['title', 'aria-label', 'aria-description']) {
        const v = el.getAttribute(a);
        if (v) textos.push(v);
      }
    });
    raiz.querySelectorAll('svg title').forEach((t) => textos.push(t.textContent ?? ''));
    return textos;
  }, ESCOPO);
}

/** Alturas das linhas da tabela, dos cartões e das subcategorias do celular. */
async function alturasDasLinhas(page: Page): Promise<number[]> {
  return page.evaluate((escopo) => {
    const raiz = document.querySelector(escopo);
    if (!raiz) return [];
    return Array.from(
      raiz.querySelectorAll('tr, li[data-mf-card], [data-mf-sub-mobile], [data-mf-kpi]'),
    ).map((el) => Math.round(el.getBoundingClientRect().height * 2) / 2);
  }, ESCOPO);
}

async function conferirOlho(page: Page) {
  const nums = await coletarNumerosDaPosicao(page, ESCOPO, OPCOES);
  expect(nums.length, 'números do orçamento com o olho aberto').toBeGreaterThan(0);
  await expect(page.locator(`${ESCOPO} .mf-sensivel`)).toHaveCount(0);
  const antes = await tamanhoDoDocumento(page);
  const alturasAntes = await alturasDasLinhas(page);

  await alternarOlho(page, true);

  await expectNumerosAusentes(page, nums, ESCOPO, OPCOES);
  expect(await coletarValoresExpostos(page, ESCOPO)).toEqual([]);
  const atributos = (await atributosExpostos(page)).filter(
    (t) => REGEX_VALOR_MONETARIO.test(t) || nums.some((n) => t.includes(n)),
  );
  expect(atributos, 'valores em title/aria-label com o olho fechado').toEqual([]);
  expect(await page.locator(`${ESCOPO} .mf-sensivel`).count()).toBeGreaterThan(0);
  // Nenhum campo de orçado em R$ mostra o número parado.
  expect(await page.locator(`${ESCOPO} [data-mf-orcado-oculto]`).count()).toBeGreaterThan(0);

  const depois = await tamanhoDoDocumento(page);
  expect(depois.largura, 'fechar o olho não alarga a página').toBeLessThanOrEqual(antes.largura);
  expect(await alturasDasLinhas(page), 'altura das linhas').toEqual(alturasAntes);

  // Tocar na pílula do orçado abre o campo com o número; Esc volta a pílula sem gravar.
  const pilula = page.locator(`${ESCOPO} [data-mf-orcado-oculto]`).first();
  await pilula.scrollIntoViewIfNeeded();
  const qtd = await page.locator(`${ESCOPO} [data-mf-orcado-oculto]`).count();
  await pilula.click();
  const campo = page.locator(`${ESCOPO} input:focus`);
  await expect(campo).toHaveValue(/\d/);
  await campo.press('Escape');
  await expect(page.locator(`${ESCOPO} [data-mf-orcado-oculto]`)).toHaveCount(qtd);

  // Olho aberto de novo: os números voltam e as pílulas somem.
  await alternarOlho(page, false);
  await expect(page.locator(`${ESCOPO} .mf-sensivel`)).toHaveCount(0);
  expect(await coletarNumerosDaPosicao(page, ESCOPO, OPCOES)).toEqual(nums);
}

test.describe('computador (1280)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('KPIs, gráfico e tabela: dinheiro em pílula, % visíveis, orçado abre com o número', async ({
    page,
  }) => {
    await gotoOrcamentoV2(page);
    await expect(page.locator(`${ESCOPO} table tbody tr`).first()).toBeVisible({
      timeout: 60_000,
    });
    // O gráfico (aberto por padrão no seed) entra na conferência: eixo e <title> das barras.
    await conferirOlho(page);
  });
});

for (const largura of [390, 320]) {
  test.describe(`celular (${largura})`, () => {
    test.use({
      viewport: { width: largura, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });

    test('herói, cartões e subcategorias: dinheiro em pílula, sem alargar', async ({ page }) => {
      await gotoOrcamentoV2(page);
      await expect(page.locator('[data-mf-sub-mobile]').first()).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: /Orçado × Real por categoria/ }).click();
      await expect(page.locator(`${ESCOPO} [data-mf-grafico-categoria]`).first()).toBeVisible();
      await conferirOlho(page);
    });
  });
}
