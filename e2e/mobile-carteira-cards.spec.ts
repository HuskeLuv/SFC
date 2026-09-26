import { test, expect, type Locator, type Page } from '@playwright/test';
import { expectFitsWithoutClip, openCarteiraTab, waitCarteiraReady } from './helpers/mobileFit';

/**
 * PWA fase 1, fatia B: as 9 abas do GenericAssetTable (+ Previdência) em CARTÕES abaixo de lg.
 *
 * Roda no projeto `mobile` (390x844, isMobile). No CI o banco é o do seed: nada aqui depende da
 * carteira do usuário demo do dev — aba sem ativo pula a parte que precisa de cartão (anotado).
 * A edição do objetivo restaura o valor original no fim (sempre, mesmo se falhar no meio).
 * Não há Desfazer nesta fase (decisão de 25/09/2026): a restauração é outra edição pelo sheet.
 */

const ABAS = [
  'Ações',
  "FII's",
  "ETF's",
  'Stocks',
  "REIT's",
  'Fundos',
  'Moedas, Criptomoedas & outros',
  'Opções',
  'Previdência e Seguros',
] as const;

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

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
      // sem storage: o aviso de cookies aparece, mas não cobre os cartões testados
    }
  });
});

/** Espera a aba sair do "Carregando dados…" (spinner do GenericAssetTable). */
async function waitTabLoaded(page: Page) {
  await page
    .waitForFunction(() => !document.body.innerText.includes('Carregando dados'), null, {
      timeout: 60_000,
    })
    .catch(() => {
      test.info().annotations.push({ type: 'aba', description: 'carregamento persistente' });
    });
}

async function gotoCarteira(page: Page) {
  await page.goto('/carteira');
  await waitCarteiraReady(page);
}

async function openTab(page: Page, label: string) {
  await openCarteiraTab(page, label);
  await waitTabLoaded(page);
}

/** Primeiro cartão com posição (não planejado) da aba aberta, ou null. */
async function firstPositionCard(page: Page): Promise<Locator | null> {
  const card = page.locator('li[data-mf-card]:not([data-planejado="true"])').first();
  return (await card.count()) > 0 ? card : null;
}

async function openCard(card: Locator) {
  const toggle = card.locator('[data-mf-card-toggle]');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

test.describe('Carteira em cartões (fatia B)', () => {
  test.setTimeout(240_000);

  for (const width of [390, 320]) {
    test(`as 9 abas cabem a ${width}px com o corte desligado`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await gotoCarteira(page);
      for (const aba of ABAS) {
        await openTab(page, aba);
        // Abaixo de lg nenhuma <table> de ativos: só cartões (ou o estado vazio).
        await expect(
          page.locator('[data-mf-asset-cards], [data-mf-empty-tab]').first(),
        ).toBeVisible();
        await expectFitsWithoutClip(page, `${aba}@${width}`, { width });
      }
    });
  }

  test('cartão abre com o corpo visível (Ações, ou FII)', async ({ page }) => {
    await gotoCarteira(page);
    let card: Locator | null = null;
    for (const aba of ['Ações', "FII's"]) {
      await openTab(page, aba);
      card = await firstPositionCard(page);
      if (card) break;
    }
    test.skip(!card, 'sem ativo com posição em Ações/FII neste banco');
    const toggle = card!.locator('[data-mf-card-toggle]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(card!.locator('[data-mf-card-body]')).toBeVisible();
    await expect(card!.getByRole('link', { name: /Ver detalhes do ativo/ })).toBeVisible();
  });

  test('editar objetivo pelo sheet (vírgula) e restaurar', async ({ page }) => {
    await gotoCarteira(page);
    let card: Locator | null = null;
    for (const aba of ['Ações', "FII's", "ETF's"]) {
      await openTab(page, aba);
      card = await firstPositionCard(page);
      if (card) break;
    }
    test.skip(!card, 'sem ativo com posição para editar neste banco');
    await openCard(card!);

    const row = card!.locator('[data-mf-edit-row="objetivo"]');
    const editar = row.locator('[data-mf-edit="objetivo"]');
    const valorTexto = async () => {
      const txt = (await row.textContent()) ?? '';
      return txt.match(/-?[\d.]+,\d+%/)?.[0] ?? '';
    };
    const original = await valorTexto(); // ex.: '3,50%'
    const originalNum = Number(original.replace('%', '').replace(/\./g, '').replace(',', '.'));
    expect(Number.isFinite(originalNum)).toBe(true);
    const novoNum =
      Math.min(100, originalNum + 0.5) === originalNum ? originalNum - 0.5 : originalNum + 0.5;
    const toInput = (n: number) => n.toFixed(2).replace('.', ',');

    const salvarPeloSheet = async (valor: string) => {
      await editar.click();
      const dialog = page.getByRole('dialog', { name: /^Objetivo de / });
      await expect(dialog).toBeVisible();
      const input = dialog.getByRole('textbox');
      await input.fill(valor);
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
    };

    let alterado = false;
    try {
      await salvarPeloSheet(toInput(novoNum));
      alterado = true;
      // Cada MobileEditSheet (cartões, Caixa para Investir…) tem sua região de aviso; vale a que tem texto.
      await expect(page.locator('[data-mf-save-toast]').filter({ hasText: 'salvo' })).toBeVisible();
      await expect(row).toContainText(`${toInput(novoNum)}%`);
    } finally {
      if (alterado) {
        await salvarPeloSheet(toInput(originalNum));
        await expect(row).toContainText(original);
      }
    }
  });

  test('ativo planejado mostra selo e Remover (sem clicar)', async ({ page }) => {
    await gotoCarteira(page);
    let planejado: Locator | null = null;
    for (const aba of ABAS) {
      await openTab(page, aba);
      const li = page.locator('li[data-mf-card][data-planejado="true"]').first();
      if ((await li.count()) > 0) {
        planejado = li;
        break;
      }
    }
    test.skip(!planejado, 'nenhum ativo planejado neste banco');
    await expect(planejado!).toContainText('Planejado');
    await openCard(planejado!);
    await expect(planejado!.getByRole('button', { name: /Remover do planejamento/ })).toBeVisible();
  });
});
