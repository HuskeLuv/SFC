import { test, expect, type Page } from '@playwright/test';
import {
  expectFitsWithoutClip,
  expectInViewport,
  expectMinTarget,
  gotoMobile,
  prepareMobilePage,
} from './helpers/mobileFit';

/**
 * PWA fase 3, fatia E: Comunidade no celular (projeto `mobile`, SÓ LEITURA).
 *
 * A flag COMUNIDADE_HABILITADA fica DESLIGADA no CI e em produção (decisão 10): sem ela, tudo aqui
 * pula com anotação — a validação é no dev. Nada é publicado, curtido nem comentado.
 */

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

async function exigirFlagEMembro(page: Page) {
  const cfg = await page.request.get('/api/comunidade/config');
  const habilitada = cfg.ok() && ((await cfg.json()) as { habilitada?: boolean }).habilitada;
  test.skip(!habilitada, 'flag desligada: COMUNIDADE_HABILITADA (validação no dev)');
}

const READY = 'h1:has-text("Comunidade"), h2:has-text("Comunidade exclusiva"), form, button';

async function gotoFeed(page: Page, width = 390) {
  await gotoMobile(page, '/comunidade', {
    width,
    height: width === 320 ? 640 : 844,
    readySelector: READY,
  });
  const feed = page.locator('nav[aria-label="Categorias"]');
  const membro = await feed.isVisible().catch(() => false);
  test.skip(!membro, 'usuário sem acesso ou sem aceitar o termo da comunidade');
  // As publicações chegam depois do trilho (feed vazio também é um estado válido).
  await page
    .locator('article')
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
}

for (const width of [390, 320]) {
  test(`Comunidade @ ${width}: cabe sem corte, trilho de categorias`, async ({ page }) => {
    test.setTimeout(120_000);
    await exigirFlagEMembro(page);
    await gotoFeed(page, width);
    const trilho = page.locator('nav[aria-label="Categorias"]');
    await expect(trilho).toHaveAttribute('data-mf-scroll-x', '');
    await expectMinTarget(trilho.getByRole('button', { name: 'Todas' }));
    await expectFitsWithoutClip(page, `comunidade-${width}`, { width });
    if (!process.env.CI) {
      await page.screenshot({ path: test.info().outputPath(`comunidade-${width}.png`) });
    }
  });
}

test('Comunidade: ⋯ abre o action sheet e Esc fecha', async ({ page }) => {
  test.setTimeout(120_000);
  await exigirFlagEMembro(page);
  await gotoFeed(page);
  const mais = page.getByRole('button', { name: 'Ações da publicação' }).first();
  test.skip((await mais.count()) === 0, 'feed sem publicação com ações');
  await expectMinTarget(mais);
  await mais.click();
  await expect(page.locator('[data-mf-action-sheet]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-mf-action-sheet]')).toHaveCount(0);
});

test('Comunidade: compositor abre o sheet "Nova publicação" (sem publicar)', async ({ page }) => {
  test.setTimeout(120_000);
  await exigirFlagEMembro(page);
  await gotoFeed(page);
  const compor = page.locator('[data-mf-composer]');
  test.skip((await compor.count()) === 0, 'participação suspensa');
  await compor.click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog.getByRole('heading', { name: 'Nova publicação' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  // O sheet sobe animado: espera o rodapé assentar inteiro na tela.
  await expect(dialog.getByRole('button', { name: 'Publicar' })).toBeInViewport({ ratio: 1 });
  await page.waitForTimeout(400);
  await expectInViewport(dialog.getByRole('button', { name: 'Publicar' }));
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
});

test('Comunidade: post com o campo de comentário fixo na tela', async ({ page }) => {
  test.setTimeout(120_000);
  await exigirFlagEMembro(page);
  await gotoFeed(page);
  const comentarios = page.getByRole('button', { name: /Comentários?$/ }).first();
  test.skip((await comentarios.count()) === 0, 'feed vazio');
  await comentarios.click();
  await page.waitForURL(/\/comunidade\/[^/]+$/);
  const campo = page.getByLabel('Escreva um comentário');
  await expect(campo).toBeVisible({ timeout: 30_000 });
  await expectInViewport(page.locator('[data-mf-comment-bar]'));
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  await expectFitsWithoutClip(page, 'comunidade-post-390');
});
