import { test, expect, type Page } from '@playwright/test';
import {
  expectFitsWithoutClip,
  expectInViewport,
  expectMinTarget,
  gotoMobile,
  prepareMobilePage,
} from './helpers/mobileFit';
import { mockConexoesDestinos } from './helpers/destinosMock';

/**
 * Escolher o destino na importação Open Finance (fatia D) — celular 390 (projeto `mobile`), SÓ
 * LEITURA. Como no desktop, todo o /api/pluggy/* é respondido por page.route
 * (e2e/helpers/destinosMock.ts): roda no CI com as chaves desligadas no servidor.
 *
 * - Chave desligada (payload de hoje): sem cartão "para conferir" e sem "Na Carteira em".
 * - Chave ligada: cartão com "Conferir destinos (N)" de largura total e 44px; "Na Carteira em"
 *   com link "Ver" de 44px; a revisão (RevisarDestinos, fatia C) abre em tela cheia sem corte,
 *   com o rodapé fixo visível sem rolar; "Trocar" (44px) abre o sheet "Onde <ticker> vai entrar".
 * - Escuro: a mesma tela com prefers-color-scheme dark, sem corte.
 */

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

const ROUTE = '/conexoes-bancarias';
const READY = 'h3:has-text("Investimentos e empréstimos do banco")';
const REVISAO = 'Confira onde seus investimentos entraram';

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

async function gotoConexoes(page: Page) {
  await gotoMobile(page, ROUTE, { width: 390, height: 844, readySelector: READY });
}

/** O sheet/tela cheia sobe animado: mede só depois da animação terminar. */
async function animacoesParadas(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.querySelectorAll('[role="dialog"]')).flatMap((el) =>
        el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined)),
      ),
    ),
  );
}

test('chave desligada: sem cartão "para conferir" nem "Na Carteira em"', async ({ page }) => {
  test.setTimeout(120_000);
  await mockConexoesDestinos(page, { comDestinos: false });
  await gotoConexoes(page);
  await expectFitsWithoutClip(page, 'conexoes-destinos-desligada@390');
  await expect(page.locator('[data-destinos-aviso]')).toHaveCount(0);
  await expect(page.getByText('Na Carteira em')).toHaveCount(0);
  await expect(page.getByText('Novo · conferir')).toHaveCount(0);
});

for (const tema of ['light', 'dark'] as const) {
  test(`chave ligada (${tema}): cartão, link "Ver" e alvos de 44px sem corte`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: tema });
    await mockConexoesDestinos(page, { comDestinos: true });
    await gotoConexoes(page);
    await expectFitsWithoutClip(page, `conexoes-destinos-${tema}@390`);

    const aviso = page.locator('[data-destinos-aviso]');
    await expect(aviso).toContainText('4 investimentos novos chegaram');
    const conferir = aviso.getByRole('button', { name: 'Conferir destinos (4)' });
    await expectMinTarget(conferir);
    expect((await conferir.boundingBox())!.width).toBeGreaterThan(390 - 100);

    const ver = page.getByRole('link', { name: "Ver FII's › Tijolo na Carteira" });
    await ver.scrollIntoViewIfNeeded();
    await expectMinTarget(ver);
    await expect(ver).toHaveAttribute('href', '/carteira?aba=fiis');
    await expect(page.getByText('Novo · conferir')).toHaveCount(4);

    if (!process.env.CI) {
      await page.screenshot({
        path: `test-results/mobile-conexoes-destinos-${tema}.png`,
        fullPage: true,
      });
    }
  });
}

test('revisão no celular: tela cheia sem corte, rodapé fixo, Trocar abre o sheet', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await mockConexoesDestinos(page, { comDestinos: true });
  await gotoConexoes(page);
  await page.getByRole('button', { name: 'Conferir destinos (4)' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: REVISAO });
  await expect(dialog).toBeVisible();
  await animacoesParadas(page);
  await expectFitsWithoutClip(page, 'revisao-destinos@390');

  // Rodapé fixo: os dois botões visíveis sem rolar.
  const depois = dialog.getByRole('button', { name: 'Conferir depois' });
  const primario = dialog.getByRole('button', { name: /Está tudo certo|Salvar \d+ mudanç/ });
  await expectInViewport(depois);
  await expectInViewport(primario);
  await expectMinTarget(primario);

  const trocar = dialog.getByRole('button', { name: /Trocar/ }).first();
  await expectMinTarget(trocar);
  await trocar.click();
  const sheet = page.getByRole('dialog').filter({ hasText: /Onde .+ vai entrar/ });
  await expect(sheet).toBeVisible();
  await animacoesParadas(page);
  await expectFitsWithoutClip(page, 'revisao-destinos-sheet@390');
});
