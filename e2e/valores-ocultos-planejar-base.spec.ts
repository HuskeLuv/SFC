import { test, expect } from '@playwright/test';
import { alternarOlho, coletarValoresExpostos } from './helpers/valoresOcultos';
import { gotoPlanejar, mockarPlanejar } from './helpers/planejar';

/**
 * Esconder valores — Fase 3 (Planejar), preparo: o /planejamento-financeiro é tela coberta e as
 * fixtures de helpers/planejar.ts chegam à tela. Exige o app com VALORES_OCULTOS_HABILITADO=true
 * (job e2e do CI). Só leitura: as APIs do Planejar são respondidas por `mockarPlanejar` e nenhuma
 * escrita chega ao banco. As fatias medem as pílulas nas specs próprias.
 */

const FAIXA = 'Nesta tela os valores ainda aparecem.';

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

test.describe('esconder valores — Planejar (preparo da Fase 3)', () => {
  test('Sonhos: fixtures na tela, tela coberta e sem escrita', async ({ page }) => {
    test.setTimeout(120_000);
    const { escritas } = await mockarPlanejar(page);
    await gotoPlanejar(page, 'sonhos');

    await expect(page.getByText('Viagem ao Japão').first()).toBeVisible();
    await expect(page.locator('[data-mf-content][data-mf-cobre-ocultos]')).toBeAttached();
    // Os cartões usam o formato compacto (meta 87.654,32 → "R$ 88 K"): quem pega é o
    // coletarValoresExpostos (R$), não o coletarNumerosDaPosicao (só milhar/centavos).
    const expostos = (await coletarValoresExpostos(page)).map((v) => v.trim());
    expect(expostos).toContain('R$ 88 K');

    await alternarOlho(page, true);
    await expect(page.getByText(FAIXA)).toHaveCount(0);
    expect(escritas).toEqual([]);
  });

  test('Aposentadoria: plano da fixture (sem PUT do seed) e tela coberta', async ({ page }) => {
    test.setTimeout(120_000);
    const { escritas } = await mockarPlanejar(page);
    await gotoPlanejar(page, 'aposentadoria');

    // O painel lateral mostra o patrimônio da fixture no campo (formulário visível).
    await expect(page.locator('[data-mf-content] aside').first()).toBeVisible();
    const campos = await page
      .locator('[data-mf-content] aside input')
      .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value).join(' '));
    expect(campos.replace(/\D/g, ' ')).toMatch(/234\s*567/);

    await alternarOlho(page, true);
    await expect(page.getByText(FAIXA)).toHaveCount(0);
    // Acumulação: os dois campos lado a lado seguem alinhados com as pílulas no cabeçalho.
    const painel = page.locator('[data-mf-content] aside').first();
    await expect(painel.locator('.mf-sensivel').first()).toBeVisible();
    const topo = async (rotulo: string) =>
      Math.round((await painel.getByLabel(rotulo, { exact: true }).boundingBox())!.y);
    expect(await topo('Aportes mensais')).toBe(await topo('Patrimônio inicial'));
    // Espera o debounce do autosave: com os campos travados, nada é gravado.
    await page.waitForTimeout(2_000);
    expect(escritas).toEqual([]);
  });
});
