import { test, expect, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { gotoFluxo } from './helpers/fluxo';

/**
 * Esconder valores — Fase 2, fatia 1: planilha anual do Fluxo de caixa no computador. Exige o app
 * com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura: a preferência é um cookie do
 * contexto (cada teste começa com o olho aberto) e o modo edição é sempre CANCELADO.
 *
 * O dinheiro da planilha sai sem "R$" (formatCurrency deprecated): o "sentinela" são os números
 * lidos com o olho aberto, ignorando os % (índice de poupança, paz financeira, inflação, % da
 * receita), que continuam visíveis. Escopo: só a tabela da planilha (a fatia 3 mede o orçamento).
 */

const TABELA = 'table[aria-label="Planilha de fluxo de caixa"]';
const OPC = { ignorarPercentuais: true } as const;

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
      // sem storage: o aviso aparece e o teste falha de forma visível
    }
  });
});

test.use({ viewport: { width: 1280, height: 800 } });

async function abrirPlanilha(page: Page) {
  await page.mouse.move(900, 500);
  await gotoFluxo(page, { modo: 'planilha', mes: 7 });
  await page.locator(`${TABELA} tbody tr`).first().waitFor({ state: 'visible', timeout: 60_000 });
  // Proventos e evolução chegam por queries próprias: espera as linhas de resumo.
  await expect(page.getByText('Evolução do Patrimônio').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

/** Alturas das linhas da planilha (não podem mudar ao fechar o olho). */
const alturasDasLinhas = (page: Page) =>
  page
    .locator(`${TABELA} tbody tr`)
    .evaluateAll((trs) =>
      trs.map((tr) => Math.round((tr as HTMLElement).getBoundingClientRect().height)),
    );

test.describe('esconder valores — Fluxo de caixa › planilha (computador 1280)', () => {
  test('olho fechado: nenhum valor em dinheiro na planilha; % e nomes ficam', async ({ page }) => {
    test.setTimeout(180_000);
    await abrirPlanilha(page);

    const nums = await coletarNumerosDaPosicao(page, TABELA, OPC);
    expect(nums.length).toBeGreaterThan(0);
    const tamanhoAntes = await tamanhoDoDocumento(page);
    const alturasAntes = await alturasDasLinhas(page);
    const pctAntes = (await page.locator(TABELA).innerText()).match(/\d+,\d{2}\s?%/g) ?? [];

    await alternarOlho(page, true);

    await expectNumerosAusentes(page, nums, TABELA, OPC);
    expect(await coletarValoresExpostos(page, TABELA)).toEqual([]);
    expect(await page.locator(`${TABELA} .mf-sensivel`).count()).toBeGreaterThan(0);
    // Atributos title/aria-label da planilha sem números de dinheiro.
    const atributos = await page
      .locator(`${TABELA} [title], ${TABELA} [aria-label]`)
      .evaluateAll((els) =>
        els.map((el) => `${el.getAttribute('title') ?? ''} ${el.getAttribute('aria-label') ?? ''}`),
      );
    const expostos = nums.filter((n) => atributos.some((a) => a.includes(n)));
    expect(expostos).toEqual([]);

    // % continuam visíveis (índices, inflação, % da receita) e os nomes também.
    const pctDepois = (await page.locator(TABELA).innerText()).match(/\d+,\d{2}\s?%/g) ?? [];
    expect(pctDepois).toEqual(pctAntes);
    await expect(page.locator(TABELA).getByText('Saldo do mês (Lucro Líquido)')).toBeVisible();

    // Sem rolagem lateral nova e altura das linhas igual.
    const tamanhoDepois = await tamanhoDoDocumento(page);
    expect(tamanhoDepois.largura).toBeLessThanOrEqual(tamanhoAntes.largura);
    expect(await alturasDasLinhas(page)).toEqual(alturasAntes);

    if (!process.env.CI) {
      await page.screenshot({ path: test.info().outputPath('planilha-oculta.png') });
    }

    // Olho aberto de novo: os números voltam.
    await alternarOlho(page, false);
    expect(await coletarNumerosDaPosicao(page, TABELA, OPC)).toEqual(nums);
    expect(await page.locator(`${TABELA} .mf-sensivel`).count()).toBe(0);
  });

  test('modo edição: célula parada é pílula, em edição o input mostra o número', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await abrirPlanilha(page);
    await alternarOlho(page, true);

    const editar = page
      .locator(TABELA)
      .getByRole('button', { name: /^Editar/ })
      .first();
    await editar.scrollIntoViewIfNeeded();
    await editar.click();
    const cancelar = page
      .locator(TABELA)
      .getByRole('button', { name: /Cancelar/ })
      .first();
    await expect(cancelar).toBeVisible();

    // Formulário visível: os inputs de valor mostram o número cru.
    const inputs = page.locator(`${TABELA} td[data-cf-month] input`);
    expect(await inputs.count()).toBeGreaterThan(0);
    const valores = await inputs.evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement).value),
    );
    expect(valores.some((v) => /\d/.test(v))).toBe(true);

    await cancelar.click();
    await expect(inputs).toHaveCount(0);
  });
});
