import { test, expect, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { gotoPlanejar, mockarPlanejar, SENTINELAS_PLANEJAR } from './helpers/planejar';

/**
 * Esconder valores — Fase 3, fatia 3: painel da Aposentadoria (LeftPanel, computador) e o
 * simulador no celular (cartão de premissas, sheet de premissas, cartões do acompanhamento e
 * registrar mês). Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura: as
 * APIs do Planejar respondem com as fixtures de helpers/planejar.ts (`mockarPlanejar`) e nenhuma
 * escrita sai da página; os sheets fecham sem Salvar.
 *
 * Formulários ficam visíveis (decisão 3): os CAMPOS continuam com o número; o que está fora deles
 * em R$ (eco do campo, valor automático, patrimônio projetado, "Necessário:", sugestão, Δ vs
 * plano) vira pílula. % (taxas, rentabilidade), idades e meses continuam.
 *
 * Cada trecho é medido no próprio escopo: as abas (Projeção/Acompanhamento/Evolução) são de
 * outras fatias e têm specs próprias.
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
      // sem storage: o aviso de cookies aparece, mas não cobre o que é medido
    }
  });
});

const OPCOES = { ignorarPercentuais: true } as const;
const PAINEL = '[data-mf-content] aside';
const CARTAO = 'section[aria-labelledby="premissas-card-titulo"]';
const HISTORICO = '[data-mf-content] [aria-label="Histórico mensal"]';
const DIALOGO = '[role="dialog"]';

async function abrir(page: Page) {
  const mock = await mockarPlanejar(page);
  await gotoPlanejar(page, 'aposentadoria');
  // O provider montou (o clique no olho antes da hidratação não faz nada).
  await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
  return mock;
}

/** aria-label/title com número em R$ (o mascarar deixa "R$ •••••"). */
async function atributosComValor(page: Page, escopo: string): Promise<string[]> {
  return page.evaluate((escopo) => {
    const valores: string[] = [];
    for (const raiz of Array.from(document.querySelectorAll(escopo))) {
      for (const el of [raiz, ...Array.from(raiz.querySelectorAll('*'))]) {
        for (const attr of ['aria-label', 'title']) {
          const v = el.getAttribute(attr);
          if (v && /R\$\s?-?\d/.test(v)) valores.push(v);
        }
      }
    }
    return valores;
  }, escopo);
}

async function alturas(page: Page, seletor: string): Promise<number[]> {
  return page
    .locator(seletor)
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
}

/** "234567.89" do campo type=number ou "234.567,89" do campo com vírgula: só os dígitos. */
const digitos = (v: string) => v.replace(/\D/g, '');

test.describe('esconder valores — painel da Aposentadoria (computador 1280)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('eco dos campos e valores automáticos viram pílula; campos e % ficam', async ({ page }) => {
    const { escritas } = await abrir(page);
    const painel = page.locator(PAINEL);
    await expect(painel).toBeVisible();
    const numeros = await coletarNumerosDaPosicao(page, PAINEL, OPCOES);
    // Patrimônio, aporte e renda da fixture aparecem no eco dos campos com o olho aberto.
    expect(numeros).toEqual(expect.arrayContaining(['234.567,89', '3.456,78', '12.345,67']));
    const percentuais = await painel.getByText(/%/).count();
    const antes = await tamanhoDoDocumento(page);
    const alturaPainel = await alturas(page, PAINEL);

    await alternarOlho(page, true);
    await expect(painel.locator('.mf-sensivel').first()).toBeVisible();
    await expectNumerosAusentes(page, numeros, PAINEL, OPCOES);
    expect(await coletarValoresExpostos(page, PAINEL)).toEqual([]);
    expect(await atributosComValor(page, PAINEL)).toEqual([]);
    // Formulário visível (decisão 3): o campo de patrimônio continua com o número.
    const campos = await painel
      .locator('input[type="number"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
    expect(campos.map(digitos)).toContain(digitos(String(SENTINELAS_PLANEJAR.patrimonio)));
    // Taxas e "Real a.a." continuam.
    expect(await painel.getByText(/%/).count()).toBe(percentuais);
    await expect(painel.getByText(/^Real a\.a\.:/)).toBeVisible();
    expect(await alturas(page, PAINEL)).toEqual(alturaPainel);
    expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(antes.largura);

    await alternarOlho(page, false);
    await expect(painel.locator('.mf-sensivel')).toHaveCount(0);
    expect(await coletarNumerosDaPosicao(page, PAINEL, OPCOES)).toEqual(numeros);
    // Espera o debounce do autosave: com os campos travados, nada é gravado.
    await page.waitForTimeout(1_500);
    expect(escritas).toEqual([]);
  });

  test('screenshots locais (claro e escuro)', async ({ page }) => {
    test.skip(!!process.env.CI, 'screenshots só locais');
    await abrir(page);
    const dir = process.env.VALORES_OCULTOS_QA_DIR;
    test.skip(!dir, 'defina VALORES_OCULTOS_QA_DIR para gravar');
    await alternarOlho(page, true);
    await page.locator(PAINEL).screenshot({ path: `${dir}/dev-3-painel-1280-claro.png` });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.locator(PAINEL).screenshot({ path: `${dir}/dev-3-painel-1280-escuro.png` });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await alternarOlho(page, false);
  });
});

const VARIANTES = [
  { nome: 'celular 390', largura: 390 },
  { nome: 'celular 320', largura: 320 },
] as const;

for (const variante of VARIANTES) {
  test.describe(`esconder valores — Aposentadoria no ${variante.nome}`, () => {
    test.use({
      viewport: { width: variante.largura, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    test('cartão de premissas e sheet de premissas: R$ em pílula, campos com o número', async ({
      page,
    }) => {
      const { escritas } = await abrir(page);
      const cartao = page.locator(CARTAO);
      await expect(cartao).toBeVisible();
      const numeros = await coletarNumerosDaPosicao(page, CARTAO, OPCOES);
      expect(numeros).toEqual(expect.arrayContaining(['234.567,89', '12.345,67']));
      const alturaBotoes = await alturas(page, `${CARTAO} [data-premissa]`);
      const antes = await tamanhoDoDocumento(page);

      await alternarOlho(page, true);
      // Pílula curta nos 3 valores em R$ (decisão 6); idades e % ficam.
      await expect(cartao.locator('.mf-sensivel--curto')).toHaveCount(3);
      await expectNumerosAusentes(page, numeros, CARTAO, OPCOES);
      expect(await coletarValoresExpostos(page, CARTAO)).toEqual([]);
      expect(await atributosComValor(page, CARTAO)).toEqual([]);
      await expect(cartao.locator('[data-premissa="idade"]')).toContainText('35 anos');
      await expect(cartao.locator('[data-premissa="rentNom"]')).toContainText('11,5%');
      expect(await alturas(page, `${CARTAO} [data-premissa]`)).toEqual(alturaBotoes);
      expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(antes.largura);

      // Sheet: o resumo projetado vira pílula; os campos continuam com o número.
      await cartao.locator('[data-premissa="patrimonio"]').click();
      const folha = page.getByRole('dialog', { name: 'Premissas' });
      await expect(folha).toBeVisible();
      await expect(folha.locator('[data-premissas-resumo] .mf-sensivel')).toHaveCount(1);
      await expect(folha.locator('[data-premissas-resumo]')).toContainText('Renda dura até');
      expect(await coletarValoresExpostos(page, DIALOGO)).toEqual([]);
      expect(await atributosComValor(page, DIALOGO)).toEqual([]);
      await expect(folha.locator('#premissa-patrimonio')).toHaveValue('234.567,89');
      await expect(folha.locator('#premissa-renda')).toHaveValue('12.345,67');
      // Sai sem mexer em nada.
      await folha.getByRole('button', { name: 'Pronto' }).click();
      await expect(folha).toBeHidden();

      await page.waitForTimeout(1_500);
      expect(escritas).toEqual([]);
    });

    test('acompanhamento: cartões e registrar mês sem R$; altura dos cartões igual', async ({
      page,
    }) => {
      const { escritas } = await abrir(page);
      await page.getByRole('tab', { name: /Acompanhamento/ }).click();
      const historico = page.locator(HISTORICO);
      await expect(historico.locator('[data-mf-card]').first()).toBeVisible();
      // Os cartões usam o compacto ("R$ 237 K"): quem pega é o coletarValoresExpostos.
      expect((await coletarValoresExpostos(page, HISTORICO)).length).toBeGreaterThan(0);
      const rents = await historico.getByText(/%$/).count();
      const alturaCartoes = await alturas(page, `${HISTORICO} [data-mf-card]`);
      const antes = await tamanhoDoDocumento(page);
      // Altura das linhas da prévia do registrar mês com o olho aberto (Δ vs plano a 320px).
      const PREVIA = '[data-registrar-mes-previa] > div';
      await historico.locator('[data-mf-card]').first().click();
      const registrar = page.getByRole('dialog', { name: 'Registrar mês' });
      await expect(registrar).toBeVisible();
      const alturaPrevia = await alturas(page, PREVIA);
      await page.keyboard.press('Escape');
      await expect(registrar).toBeHidden();

      await alternarOlho(page, true);
      await expect(historico.locator('.mf-sensivel--curto').first()).toBeVisible();
      expect(await coletarValoresExpostos(page, HISTORICO)).toEqual([]);
      expect(await atributosComValor(page, HISTORICO)).toEqual([]);
      expect(await historico.getByText(/%$/).count()).toBe(rents);
      expect(await alturas(page, `${HISTORICO} [data-mf-card]`)).toEqual(alturaCartoes);
      expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(antes.largura);

      // Registrar mês (mês já registrado): campos com o número; apoio em pílula.
      await historico.locator('[data-mf-card]').first().click();
      const folha = page.getByRole('dialog', { name: 'Registrar mês' });
      await expect(folha).toBeVisible();
      await expect(folha.getByText('Necessário:').first()).toBeVisible();
      expect(await coletarValoresExpostos(page, DIALOGO)).toEqual([]);
      expect(await atributosComValor(page, DIALOGO)).toEqual([]);
      await expect(folha.locator('#registrar-mes-aporte')).toHaveValue('3.517,29');
      await expect(folha.locator('#registrar-mes-patrimonio')).toHaveValue(/\d/);
      await expect(folha.locator('[data-registrar-mes-previa]')).toContainText('%');
      expect(await alturas(page, PREVIA)).toEqual(alturaPrevia);
      // Sai sem Salvar.
      await page.keyboard.press('Escape');
      await expect(folha).toBeHidden();

      expect(escritas).toEqual([]);
    });

    test('screenshots locais (claro e escuro)', async ({ page }) => {
      test.skip(!!process.env.CI, 'screenshots só locais');
      const dir = process.env.VALORES_OCULTOS_QA_DIR;
      test.skip(!dir, 'defina VALORES_OCULTOS_QA_DIR para gravar');
      await abrir(page);
      const w = variante.largura;
      await alternarOlho(page, true);
      for (const tema of ['claro', 'escuro'] as const) {
        if (tema === 'escuro') {
          await page.evaluate(() => document.documentElement.classList.add('dark'));
        }
        await page.locator(CARTAO).screenshot({ path: `${dir}/dev-3-premissas-${w}-${tema}.png` });
        await page.locator(CARTAO).locator('[data-premissa="patrimonio"]').click();
        const folha = page.getByRole('dialog', { name: 'Premissas' });
        await expect(folha).toBeVisible();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${dir}/dev-3-sheet-premissas-${w}-${tema}.png` });
        await folha.getByRole('button', { name: 'Pronto' }).click();
        await expect(folha).toBeHidden();
        await page.getByRole('tab', { name: /Acompanhamento/ }).click();
        const historico = page.locator(HISTORICO);
        await expect(historico.locator('[data-mf-card]').first()).toBeVisible();
        await historico.screenshot({ path: `${dir}/dev-3-acompanhamento-${w}-${tema}.png` });
        await historico.locator('[data-mf-card]').first().click();
        const registrar = page.getByRole('dialog', { name: 'Registrar mês' });
        await expect(registrar).toBeVisible();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${dir}/dev-3-registrar-${w}-${tema}.png` });
        await page.keyboard.press('Escape');
        await expect(registrar).toBeHidden();
        await page.getByRole('tab', { name: /Projeção/ }).click();
      }
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
      await alternarOlho(page, false);
      await page.locator(CARTAO).screenshot({ path: `${dir}/dev-3-premissas-${w}-aberto.png` });
    });
  });
}
