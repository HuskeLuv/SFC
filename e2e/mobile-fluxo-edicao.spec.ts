import { test, expect, type Locator, type Page } from '@playwright/test';
import { fluxoMobileReadyOrSkip, gotoFluxo, rowByName } from './helpers/fluxo';

/**
 * PWA fase 2, fatia B: sheets de edição do Fluxo de caixa no celular.
 *
 * Roda no projeto `mobile` (390x844, isMobile). Depende da visão do mês (fatia A): enquanto
 * `[data-mf-fluxo-mobile]` não existir, `fluxoMobileReadyOrSkip` pula (worktrees). No CI (banco do
 * seed) roda de verdade.
 *
 * GRAVA no banco: só a célula Internet/julho, X → X+1 → X, com restauração em `finally` (serial).
 * Nenhum outro spec lê essa célula (convenção do helpers/fluxo.ts). Sem Desfazer nesta fase: a
 * restauração é outra edição pelo sheet. O resíduo é uma entrada 'valores.editar-lote' no histórico.
 */

test.describe.configure({ mode: 'serial' });

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
      // sem storage: o aviso de cookies aparece, mas não cobre o sheet
    }
  });
});

const LINHA = 'Internet';

/** '1.234,56' → 1234.56; '' → 0. */
function parseBR(text: string): number {
  const clean = text.replace(/[^\d,-]/g, '').replace(',', '.');
  return clean ? Number(clean) : 0;
}

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function openCellSheet(page: Page, row: Locator): Promise<Locator> {
  await row.scrollIntoViewIfNeeded();
  await row.click();
  const dialog = page.getByRole('dialog', { name: LINHA });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function saveAndWaitClose(dialog: Locator) {
  const salvar = dialog.getByRole('button', { name: 'Salvar', exact: true });
  await expect(salvar).toBeEnabled();
  await salvar.click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

test('valor com fórmula pela barra de teclas: X → X+1 → X', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoFluxo(page, { mes: 7 });
  await fluxoMobileReadyOrSkip(test, page);

  const row = await rowByName(page, LINHA);
  test.skip(!(await row.isVisible()), `linha ${LINHA} não existe neste banco`);

  let dialog = await openCellSheet(page, row);
  const field = page.getByLabel('Valor de Julho');
  const original = await field.inputValue();
  test.skip(original.startsWith('='), `${LINHA}/julho já tem fórmula — não mexe`);
  const x = parseBR(original);
  let gravou = false;

  try {
    await field.fill(original);
    await dialog.getByRole('button', { name: 'Começar fórmula' }).click();
    await dialog.getByRole('button', { name: 'Mais', exact: true }).click();
    await field.pressSequentially('1');
    await expect(field).toHaveValue(`=${original}+1`);
    await expect(dialog.getByText(`= R$ ${fmt(x + 1)}`.replace(' ', ' '))).toBeVisible();

    gravou = true;
    await saveAndWaitClose(dialog);
    await expect(row).toContainText(fmt(x + 1), { timeout: 30_000 });

    // Reabre: a célula guarda a fórmula.
    dialog = await openCellSheet(page, row);
    await expect(field).toHaveValue(`=${original}+1`);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  } finally {
    if (gravou) {
      // Restaura X (número puro limpa a fórmula), mesmo se algo acima falhou.
      const again = await rowByName(page, LINHA);
      const d = await openCellSheet(page, again);
      await field.fill(original);
      await saveAndWaitClose(d);
      if (x !== 0) await expect(again).toContainText(fmt(x), { timeout: 30_000 });
    }
  }
});

test('Mover: oferece "Mover para cima" (sem executar)', async ({ page }) => {
  await gotoFluxo(page, { mes: 7 });
  await fluxoMobileReadyOrSkip(test, page);

  const row = await rowByName(page, LINHA);
  test.skip(!(await row.isVisible()), `linha ${LINHA} não existe neste banco`);
  const dialog = await openCellSheet(page, row);

  await dialog.getByRole('button', { name: /^Mover\b/ }).click();
  const mover = page.getByRole('dialog', { name: 'Mover linha' });
  await expect(mover).toBeVisible();
  await expect(mover.getByRole('button', { name: /Mover para cima/ })).toBeVisible();
  await expect(mover.getByRole('button', { name: /Mover para outra seção/ })).toBeVisible();

  // Esc volta ao valor (não fecha o sheet); depois fecha.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: LINHA })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Aporte/Resgate abre só leitura (sem Salvar)', async ({ page }) => {
  await gotoFluxo(page, { mes: 7 });
  await fluxoMobileReadyOrSkip(test, page);

  const invest = page.locator('[data-mf-fluxo-row][data-item-id^="investimento-"]');
  if ((await invest.count()) === 0) {
    const mostrar = page.getByRole('button', { name: /^Mostrar \d+ linhas? sem valor$/ });
    for (let i = await mostrar.count(); i > 0; i--) {
      const botao = mostrar.first();
      if (!(await botao.isVisible())) break;
      await botao.click();
    }
  }
  test.skip((await invest.count()) === 0, 'sem linha de Aporte/Resgate neste banco');

  const row = invest.first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Calculado automaticamente da carteira/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Salvar', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
