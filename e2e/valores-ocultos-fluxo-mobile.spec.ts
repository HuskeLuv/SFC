import { test, expect, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { FLUXO_MES_PADRAO, gotoFluxo, waitFluxoMobileReady } from './helpers/fluxo';

/**
 * Esconder valores — Fase 2, fatia 2: visão do mês do Fluxo de caixa no celular (resumo, faixas,
 * linhas, linhas calculadas, "Escolher mês", sheet da conta e sheet da célula). Exige o app com
 * VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura: nenhum valor é salvo (o sheet da
 * célula é fechado sem Salvar) e a preferência é um cookie do contexto do navegador.
 *
 * O dinheiro do fluxo não tem "R$" em todo lugar: compara os números lidos com o olho aberto
 * (`ignorarPercentuais`: poupança, paz financeira, inflação e "% da receita" continuam visíveis).
 * Sempre julho (FLUXO_MES_PADRAO), nunca o mês corrente. Roda no projeto `chromium` a 390 e 320
 * com isMobile.
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
      // sem storage: o aviso de cookies aparece, mas não cobre a lista
    }
  });
});

const VARIANTES = [
  { nome: 'celular 390', largura: 390 },
  { nome: 'celular 320', largura: 320 },
] as const;

const VISAO = '[data-mf-fluxo-mobile]';
const DIALOGO = '[role="dialog"]';
const OPCOES = { ignorarPercentuais: true } as const;

async function abrir(page: Page) {
  await gotoFluxo(page, { mes: FLUXO_MES_PADRAO });
  await waitFluxoMobileReady(page, { timeout: 120_000 });
  // O provider montou (o clique no olho antes da hidratação não faz nada).
  await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
}

/** Alturas das linhas, faixas e linhas calculadas (fechar o olho não pode mudar nenhuma). */
async function alturasDasLinhas(page: Page): Promise<number[]> {
  return page
    .locator('[data-mf-fluxo-row], [data-mf-fluxo-derived], [data-mf-fluxo-band]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
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

for (const variante of VARIANTES) {
  test.describe(`esconder valores — fluxo do mês (${variante.nome})`, () => {
    test.use({
      viewport: { width: variante.largura, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    test('lista do mês: nenhum valor com o olho fechado; % e nomes ficam; nada alarga', async ({
      page,
    }) => {
      await abrir(page);
      const numeros = await coletarNumerosDaPosicao(page, VISAO, OPCOES);
      expect(numeros.length).toBeGreaterThan(0);
      const antes = await tamanhoDoDocumento(page);
      const alturas = await alturasDasLinhas(page);
      const poupanca = await page.getByText(/^Poupança -?\d+%$/).count();

      await alternarOlho(page, true);
      await expect(page.locator(`${VISAO} .mf-sensivel`).first()).toBeVisible();
      await expectNumerosAusentes(page, numeros, VISAO, OPCOES);
      expect(await coletarValoresExpostos(page, VISAO)).toEqual([]);
      expect(await atributosComValor(page, VISAO)).toEqual([]);
      // Percentuais continuam (o índice de poupança do cartão, quando há entradas).
      expect(await page.getByText(/^Poupança -?\d+%$/).count()).toBe(poupanca);
      expect(await alturasDasLinhas(page)).toEqual(alturas);
      const depois = await tamanhoDoDocumento(page);
      expect(depois.largura).toBeLessThanOrEqual(antes.largura);
      // Nenhum rótulo quebra linha por causa da pílula (ex.: Saldo Conta Corrente do cartão).
      expect(depois.altura).toBe(antes.altura);

      // O SSR já sai oculto (cookie do aparelho) e abrir o olho devolve os números.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitFluxoMobileReady(page, { timeout: 120_000 });
      await expectNumerosAusentes(page, numeros, VISAO, OPCOES);
      await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
      await alternarOlho(page, false);
      await expect(page.locator(`${VISAO} .mf-sensivel`)).toHaveCount(0);
      expect(await coletarNumerosDaPosicao(page, VISAO, OPCOES)).toEqual(numeros);
    });

    test('"Escolher mês" e sheet da conta: saldos viram pílula, também no aria-label', async ({
      page,
    }) => {
      await abrir(page);
      const nomeDoMes = page.locator('[data-mf-month-stepper] button:has([data-mf-month-label])');

      await nomeDoMes.click();
      const escolher = page.getByRole('dialog', { name: 'Escolher mês' });
      await expect(escolher).toBeVisible();
      const saldos = await coletarNumerosDaPosicao(page, DIALOGO, OPCOES);
      expect(saldos.length).toBeGreaterThan(0);
      await page.keyboard.press('Escape');
      await expect(escolher).toBeHidden();

      await alternarOlho(page, true);
      await nomeDoMes.click();
      await expect(escolher).toBeVisible();
      await expectNumerosAusentes(page, saldos, DIALOGO, OPCOES);
      expect(await atributosComValor(page, DIALOGO)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(escolher).toBeHidden();

      // Linha calculada em R$ (Saldo do mês): sheet da conta com pílula.
      const saldoMes = page.locator('[data-mf-fluxo-derived="saldoMes"]').first();
      await saldoMes.scrollIntoViewIfNeeded();
      await saldoMes.click();
      const conta = page.getByRole('dialog', { name: /Saldo do mês/ });
      await expect(conta).toBeVisible();
      await expect(conta.locator('.mf-sensivel')).toHaveCount(1);
      expect(await coletarValoresExpostos(page, DIALOGO)).toEqual([]);
      await expect(conta).toContainText('Como é calculado');
    });

    test('sheet da célula: o campo mostra o número; o apoio vira pílula', async ({ page }) => {
      await abrir(page);
      await alternarOlho(page, true);
      const linha = page.locator('[data-mf-fluxo-row]').first();
      await linha.scrollIntoViewIfNeeded();
      await linha.click();
      const folha = page.locator('[data-mf-sheet]');
      await expect(folha).toBeVisible();
      // Formulário visível (decisão 3): o campo de valor continua com o número.
      const campo = folha.getByLabel(/^Valor de /);
      if (await campo.count()) {
        await expect(campo).toHaveValue(/\d/);
      } else {
        // Linha automática (Aporte/Resgate): o valor é só leitura e vira pílula.
        await expect(folha.locator('[data-mf-cell-readonly-value] .mf-sensivel')).toHaveCount(1);
      }
      // Mini gráfico do ano: totais de apoio em pílula e resumo mascarado.
      await expect(folha.getByText(/^No ano/)).toBeVisible();
      expect(await coletarValoresExpostos(page, '[data-mf-sheet]')).toEqual([]);
      expect(await atributosComValor(page, '[data-mf-sheet]')).toEqual([]);
      // Sai sem salvar.
      await page.keyboard.press('Escape');
      await expect(folha).toBeHidden();
    });
  });
}
