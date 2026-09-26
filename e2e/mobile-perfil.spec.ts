import { test, expect } from '@playwright/test';
import {
  expectFitsWithoutClip,
  expectInViewport,
  expectMinTarget,
  gotoMobile,
  prepareMobilePage,
} from './helpers/mobileFit';

/**
 * PWA fase 3, fatia E: Perfil no celular (projeto `mobile`, SÓ LEITURA).
 *
 * Lista de ajustes; cada linha abre o formulário de hoje num sheet. "Sair de todos" vai só até a
 * confirmação e CANCELA (nunca executa: derrubaria as sessões dos outros testes). O 2FA não é
 * configurado (o POST grava um segredo pendente): só abre o sheet.
 */

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

const READY = '[data-mf-perfil-mobile]';
const itens = (page: import('@playwright/test').Page) => page.locator('[data-perfil-item]');
const sheet = (page: import('@playwright/test').Page) =>
  page.locator('[role="dialog"][aria-modal="true"]');

for (const width of [390, 320]) {
  test(`Perfil @ ${width}: cabe sem corte e tem 7 linhas de 44px+`, async ({ page }) => {
    test.setTimeout(120_000);
    await gotoMobile(page, '/profile', {
      width,
      height: width === 320 ? 640 : 844,
      readySelector: READY,
    });
    await expect(itens(page)).toHaveCount(7);
    for (let i = 0; i < 7; i++) {
      await itens(page).nth(i).scrollIntoViewIfNeeded();
      await expectMinTarget(itens(page).nth(i));
    }
    // Excluir minha conta por último, isolada.
    await expect(itens(page).last()).toHaveAttribute('data-perfil-item', 'excluir');
    await expectFitsWithoutClip(page, `perfil-${width}`, { width });
    if (!process.env.CI) {
      await page.screenshot({ path: test.info().outputPath(`perfil-${width}.png`) });
    }
  });
}

test('Perfil: Sessões ativas → Sair de todos → confirmação → Cancelar (não executa)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await gotoMobile(page, '/profile', { readySelector: READY });
  let sessoesDelete = 0;
  page.on('request', (req) => {
    if (req.method() === 'DELETE' && req.url().includes('/api/profile/sessoes')) sessoesDelete++;
  });
  await page.locator('[data-perfil-item="sessoes"]').click();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByRole('heading', { name: 'Sessões ativas' })).toBeVisible();
  await sheet(page)
    .getByRole('button', { name: 'Sair de todos os dispositivos', exact: true })
    .click();
  await expect(sheet(page).getByRole('alertdialog')).toBeVisible();
  const cancelar = sheet(page).getByRole('button', { name: 'Cancelar' });
  await expect(cancelar).toBeFocused();
  await expectMinTarget(cancelar);
  await expectInViewport(sheet(page).getByRole('button', { name: 'Sim, sair de todos' }));
  await cancelar.click();
  await expect(sheet(page).getByRole('alertdialog')).toHaveCount(0);
  expect(sessoesDelete).toBe(0);
});

test('Perfil: Verificação em duas etapas abre o sheet do 2FA', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoMobile(page, '/profile', { readySelector: READY });
  await page.locator('[data-perfil-item="2fa"]').click();
  await expect(sheet(page)).toBeVisible();
  await expect(
    sheet(page).getByRole('heading', { name: 'Verificação em duas etapas' }),
  ).toBeVisible();
  await expect(
    sheet(page).getByRole('button', { name: /Configurar 2FA|Desativar 2FA/ }),
  ).toBeVisible({ timeout: 15_000 });
  // O código só aparece depois de Configurar (que grava): se já estiver na tela, confere o atributo.
  const codigo = sheet(page).getByLabel('Digite o código de 6 dígitos');
  if (await codigo.isVisible().catch(() => false)) {
    await expect(codigo).toHaveAttribute('autocomplete', 'one-time-code');
  }
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
});

test('Perfil: Alterar senha abre o formulário com autocomplete do gerenciador', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await gotoMobile(page, '/profile', { readySelector: READY });
  await page.locator('[data-perfil-item="senha"]').click();
  await expect(sheet(page).getByLabel('Senha atual')).toHaveAttribute(
    'autocomplete',
    'current-password',
  );
  await expect(sheet(page).getByLabel('Nova senha (mín. 8 caracteres)')).toHaveAttribute(
    'autocomplete',
    'new-password',
  );
  await expectMinTarget(sheet(page).getByLabel('Senha atual'));
});
