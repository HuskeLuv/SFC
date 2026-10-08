import { test, expect, type Page } from '@playwright/test';
import { expectMinTarget, prepareMobilePage } from './helpers/mobileFit';
import { TICKERS_BLOCO_D_CI as T, exigirRecursoBlocoD } from './fixtures/analise-bloco-d';

/**
 * Análise de Ativos · Bloco D · fatia C — Comparador no celular (projeto `mobile`). Slots
 * empilhados, "Adicionar" em BottomSheet, critérios em cartões; sem rolagem horizontal a 390 e a
 * 320; alvos ≥ 44px. SÓ LEITURA.
 */
test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

async function abrir(page: Page, tickers: string[], width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/analise-ativos/comparador', { waitUntil: 'load' });
  await exigirRecursoBlocoD(page, 'comparador');
  await page.goto(`/analise-ativos/comparador?t=${tickers.join(',')}`, { waitUntil: 'load' });
  await expect(page.locator('[data-cartoes-comparador]')).toBeVisible({ timeout: 90_000 });
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const width of [390, 320]) {
  test(`4 ações a ${width}: sem overflow, cartões com grade e alvos de 44px`, async ({ page }) => {
    await abrir(page, [T.acao, T.banco, T.acaoPetro, T.lpaNegativo], width);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expect(page.locator('[data-slot]')).toHaveCount(4);
    for (const t of [T.acao, T.banco]) {
      await expectMinTarget(page.getByRole('button', { name: `Remover ${t} da comparação` }));
      await expectMinTarget(page.getByRole('link', { name: `Abrir a página de ${t}` }));
    }
    await expectMinTarget(page.getByRole('button', { name: 'Copiar link' }));
    await expectMinTarget(page.locator('[data-comparador] nav button').first());
    await expect(page.locator('table')).toHaveCount(0);
  });
}

// Nada nos cartões passa da própria coluna (chip "Na carteira", chip "em conferência", números
// longos): o demo do seed tem posição em MXRF11 — no último slot, o chip ficaria cortado pelo card.
const invasoes = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    for (const grid of document.querySelectorAll('[data-cartoes-comparador] .grid')) {
      for (const col of Array.from(grid.children)) {
        const c = col.getBoundingClientRect();
        for (const d of Array.from(col.querySelectorAll('*'))) {
          const b = d.getBoundingClientRect();
          if (b.width > 0 && (b.right > c.right + 0.5 || b.left < c.left - 0.5)) {
            out.push(`${(col.textContent ?? '').slice(0, 30)}: ${Math.round(b.right - c.right)}px`);
            break;
          }
        }
      }
    }
    return out;
  });

for (const width of [390, 320]) {
  test(`FIIs a ${width} com posição no último slot: nada invade a coluna vizinha`, async ({
    page,
  }) => {
    for (const t of [
      [T.fiiTijolo, T.fiiPapel, T.fiiPapel2, T.fiiTijolo2],
      [T.fiiTijolo, T.fiiPapel, T.fiiTijolo2, T.fiiPapel2],
    ]) {
      await abrir(page, t, width);
      await page.waitForTimeout(3_000);
      expect(await invasoes(page)).toEqual([]);
    }
  });
}

test('Adicionar abre o BottomSheet com a busca da classe; voltar fecha', async ({ page }) => {
  await abrir(page, [T.fiiTijolo, T.fiiTijolo2]);
  const botao = page.getByRole('button', { name: /Adicionar FII/ });
  await expectMinTarget(botao);
  await botao.click();
  const sheet = page.getByRole('dialog', { name: 'Adicionar FII' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('combobox').fill(T.acao.slice(0, 4));
  // o índice da busca chega no 1º uso (pode demorar no servidor frio)
  await expect(sheet.getByRole('option', { name: new RegExp(T.acao) })).toContainText(
    'outra classe',
    { timeout: 60_000 },
  );
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`t=${T.fiiTijolo},${T.fiiTijolo2}`));
});

test('captura local', async ({ page }) => {
  test.skip(!!process.env.CI, 'screenshots só locais');
  await abrir(page, [T.acao, T.banco, T.acaoPetro]);
  await page.screenshot({ path: 'test-results/mobile-comparador.png', fullPage: true });
});
