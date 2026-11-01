import { test, expect, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { FLUXO_MES_PADRAO, gotoFluxo } from './helpers/fluxo';

/**
 * Esconder valores — Orçamento v1 (Orçamento vs Real, aba de /fluxodecaixa), Fase 2 fatia 3.
 * Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura: a preferência é um
 * cookie do contexto (cada teste começa com o olho aberto) e a meta aberta para edição sai no Esc.
 *
 * O usuário demo vê o v1 (não está no beta do v2). Mês fixo em julho (o seed tem o ano corrente);
 * nunca o mês corrente. O dinheiro do orçamento vem SEM símbolo só nos números: os % (consumo) ficam
 * e são ignorados na comparação.
 */

const NUMEROS = { ignorarPercentuais: true } as const;
/** Valor em R$ dentro de atributo (title/aria-label) do escopo. */
const ATRIBUTOS_COM_VALOR = (escopo: string) =>
  `${escopo} [title*="R$"], ${escopo} [aria-label*="R$"]`;

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
      // sem storage: o aviso de cookies aparece, mas não muda o que é medido
    }
  });
});

/** Atributos title/aria-label do escopo que ainda trazem um número em R$. */
async function atributosComValor(page: Page, escopo: string): Promise<string[]> {
  return page.evaluate((seletor) => {
    const re = /R\$\s?-?\d/;
    return Array.from(document.querySelectorAll(seletor))
      .flatMap((el) => [el.getAttribute('title') ?? '', el.getAttribute('aria-label') ?? ''])
      .filter((v) => re.test(v));
  }, ATRIBUTOS_COM_VALOR(escopo));
}

test.describe('computador 1280', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  const ESCOPO = '[data-mf-content]';

  async function abrir(page: Page) {
    await gotoFluxo(page, { modo: 'orcamento', mes: FLUXO_MES_PADRAO });
    await expect(page.getByRole('heading', { name: 'Resumo por Categoria' })).toBeVisible({
      timeout: 60_000,
    });
    // O desktop não lê ?mes=: escolhe julho no seletor.
    await page.getByLabel('Mês', { exact: true }).selectOption(String(FLUXO_MES_PADRAO - 1));
    await expect(page.locator(`${ESCOPO} table tbody tr`).first()).toBeVisible();
  }

  const alturasDasLinhas = (page: Page) =>
    page
      .locator(`${ESCOPO} table tbody tr`)
      .evaluateAll((trs) => trs.map((tr) => Math.round(tr.getBoundingClientRect().height)));

  test('tabela e gráfico: dinheiro some, % fica, meta em edição mostra o número', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await abrir(page);

    const nums = await coletarNumerosDaPosicao(page, ESCOPO, NUMEROS);
    expect(nums.length).toBeGreaterThan(0);
    const alturas = await alturasDasLinhas(page);
    const antes = await tamanhoDoDocumento(page);

    await alternarOlho(page, true);
    await expectNumerosAusentes(page, nums, ESCOPO, NUMEROS);
    expect(await coletarValoresExpostos(page, ESCOPO)).toEqual([]);
    expect(await atributosComValor(page, ESCOPO)).toEqual([]);
    expect(await page.locator(`${ESCOPO} table .mf-sensivel`).count()).toBeGreaterThan(0);
    // Altura das linhas igual (decisão 6) e nenhuma rolagem lateral nova.
    expect(await alturasDasLinhas(page)).toEqual(alturas);
    expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(antes.largura);

    // Tooltip do gráfico: pílula no lugar do valor.
    const svg = page.locator(`${ESCOPO} .apexcharts-svg`).first();
    await svg.scrollIntoViewIfNeeded();
    const caixa = (await svg.boundingBox())!;
    const tooltip = page.locator(`${ESCOPO} .apexcharts-tooltip`).first();
    await expect(async () => {
      await page.mouse.move(caixa.x + caixa.width * 0.3, caixa.y + caixa.height * 0.55);
      await page.mouse.move(caixa.x + caixa.width * 0.32, caixa.y + caixa.height * 0.6);
      await expect(tooltip).toHaveClass(/apexcharts-active/, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await expect(tooltip.locator('.mf-pilula-grafico').first()).toBeAttached();
    expect(await coletarValoresExpostos(page, ESCOPO)).toEqual([]);
    await expectNumerosAusentes(page, nums, ESCOPO, NUMEROS);

    if (!process.env.CI) {
      await page.screenshot({ path: test.info().outputPath('orcamento-v1-1280-oculto.png') });
    }

    // Formulário visível (decisão 3): a meta em edição mostra o número; Esc sai sem gravar.
    const meta = page.getByTitle(/Meta mensal em R\$/).first();
    await meta.scrollIntoViewIfNeeded();
    await meta.click();
    const campo = page.getByRole('textbox', { name: /^Meta de / });
    await expect(campo).toBeVisible();
    await campo.press('Escape');
    await expect(campo).toBeHidden();

    // Reabre o olho: os mesmos números voltam.
    await alternarOlho(page, false);
    expect(await coletarNumerosDaPosicao(page, ESCOPO, NUMEROS)).toEqual(nums);
    expect(await page.locator(`${ESCOPO} .mf-sensivel`).count()).toBe(0);
  });
});

for (const largura of [390, 320]) {
  test.describe(`celular ${largura}`, () => {
    test.use({
      viewport: { width: largura, height: largura === 320 ? 640 : 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });
    const ESCOPO = '[data-mf-orcamento-mobile]';

    test('resumo, avisos e cartões: dinheiro some, % e selos ficam', async ({ page }) => {
      test.setTimeout(180_000);
      await gotoFluxo(page, { modo: 'orcamento', mes: FLUXO_MES_PADRAO });
      await expect(page.locator(ESCOPO)).toBeVisible({ timeout: 60_000 });
      await expect(page.locator(`${ESCOPO} [data-mf-orcamento-card]`).first()).toBeVisible();

      const nums = await coletarNumerosDaPosicao(page, ESCOPO, NUMEROS);
      expect(nums.length).toBeGreaterThan(0);
      const antes = await tamanhoDoDocumento(page);

      await alternarOlho(page, true);
      await expectNumerosAusentes(page, nums, ESCOPO, NUMEROS);
      expect(await coletarValoresExpostos(page, ESCOPO)).toEqual([]);
      expect(await atributosComValor(page, ESCOPO)).toEqual([]);
      expect(await page.locator(`${ESCOPO} .mf-sensivel`).count()).toBeGreaterThan(0);
      // O selo continua com texto (não só cor).
      for (const texto of await page
        .locator(`${ESCOPO} [data-mf-orcamento-selo]`)
        .allTextContents()) {
        expect(texto.trim()).not.toBe('');
      }
      expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(antes.largura);
      expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(largura);

      if (!process.env.CI) {
        await page.screenshot({
          path: test.info().outputPath(`orcamento-v1-${largura}-oculto.png`),
          fullPage: true,
        });
      }

      await alternarOlho(page, false);
      expect(await coletarNumerosDaPosicao(page, ESCOPO, NUMEROS)).toEqual(nums);
    });
  });
}
