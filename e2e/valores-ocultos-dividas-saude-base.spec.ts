import { test, expect } from '@playwright/test';
import { alternarOlho, coletarNumerosDaPosicao } from './helpers/valoresOcultos';
import { DIVIDAS_FIXTURE, gotoDividas, ID_DIVIDA, mockarDividas } from './helpers/dividas';
import { gotoSaude, mockarSaude } from './helpers/saude';

/**
 * Esconder valores — Fase 4 (Dívidas e Saúde Financeira), preparo: /dividas e /saude-financeira
 * são telas cobertas e as fixtures de helpers/dividas.ts e helpers/saude.ts chegam à tela. Exige o
 * app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura: as APIs são respondidas por
 * `mockarDividas`/`mockarSaude` e nenhuma escrita chega ao banco. As fatias medem as pílulas nas
 * specs próprias.
 */

const FAIXA = 'Nesta tela os valores ainda aparecem.';
const COBERTO = '[data-mf-content][data-mf-cobre-ocultos]';

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

test.describe('esconder valores — Dívidas e Saúde Financeira (preparo da Fase 4)', () => {
  test('Dívidas: lista e detalhe da fixture, tela coberta e sem escrita', async ({ page }) => {
    test.setTimeout(120_000);
    const { escritas } = await mockarDividas(page);
    await gotoDividas(page);

    for (const d of DIVIDAS_FIXTURE.dividas) {
      await expect(page.getByText(d.nome, { exact: true }).first()).toBeVisible();
    }
    await expect(page.locator(COBERTO)).toBeAttached();

    await alternarOlho(page, true);
    await expect(page.getByText(FAIXA)).toHaveCount(0);

    // Detalhe pelo deep link (?divida=), também coberto.
    await gotoDividas(page, ID_DIVIDA.imovel);
    await expect(page.locator(COBERTO)).toBeAttached();
    await expect(page.getByText(FAIXA)).toHaveCount(0);
    expect(escritas).toEqual([]);
  });

  test('Saúde Financeira: fixture na tela, tela coberta e sem escrita', async ({ page }) => {
    test.setTimeout(120_000);
    const { escritas } = await mockarSaude(page);
    await gotoSaude(page);

    // Reserva de emergência da fixture (15.432,19) aparece com o olho aberto.
    expect(await coletarNumerosDaPosicao(page, COBERTO, { ignorarPercentuais: true })).toContain(
      '15.432,19',
    );
    await expect(page.getByText('Seguro de vida').first()).toBeVisible();

    await alternarOlho(page, true);
    await expect(page.getByText(FAIXA)).toHaveCount(0);
    expect(escritas).toEqual([]);
  });
});
