import { test, expect } from '@playwright/test';
import { apiDelete, apiPost, uniqueName, writesAllowed } from './helpers/api';
import { gotoMobile, prepareMobilePage } from './helpers/mobileFit';

/**
 * PWA fase 3, fatia D: Desfazer do Histórico no celular (projeto `escrita`, GRAVA).
 *
 * Só com `E2E_ALLOW_WRITES=1`. Cria um evento da Agenda via API ("evento.criar" é desfazível e é
 * a entrada mais recente dele), desfaz pelo cartão do Histórico (sheet → Desfazer), confere o aviso
 * "Alteração desfeita", o selo "Desfeita" e que o evento sumiu. Se sobrar, o finally apaga.
 */

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

test.describe.configure({ mode: 'serial' });

test.describe('Histórico no celular: Desfazer grava', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');

  test.beforeEach(async ({ page }) => {
    await prepareMobilePage(page);
  });

  test('evento criado via API → Desfazer no sheet → "Desfeita" e o evento some', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const titulo = uniqueName('histórico');
    const { evento } = await apiPost<{ evento: { id: string } }>(page, '/api/calendar', {
      titulo,
      data: '2030-01-15',
    });
    let desfeito = false;
    try {
      await gotoMobile(page, '/historico-alteracoes', {
        readySelector: 'h2:has-text("Histórico de alterações")',
      });
      // A entrada da criação (depois do Desfazer, a do "Desfez: …" também cita o título).
      const card = page
        .locator('[data-historico-card]')
        .filter({ hasText: titulo })
        .filter({ hasNotText: 'Desfez' })
        .first();
      await expect(card).toBeVisible({ timeout: 60_000 });

      await card.getByRole('button', { name: 'Desfazer' }).click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(titulo);
      await dialog.getByRole('button', { name: 'Desfazer' }).click();
      await expect(dialog).toBeHidden({ timeout: 30_000 });
      desfeito = true;

      await expect(
        page.locator('[data-mf-save-toast]').filter({ hasText: 'Alteração desfeita' }),
      ).toBeVisible();
      // O selo vem do refetch do histórico.
      await expect(card.getByText('Desfeita', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(card.getByRole('button', { name: 'Desfazer' })).toHaveCount(0);

      const res = await page.request.get('/api/calendar?de=2030-01-01&ate=2030-01-31');
      expect(res.ok()).toBe(true);
      const { eventos } = (await res.json()) as { eventos: { titulo?: string }[] };
      expect(eventos.some((e) => e.titulo === titulo)).toBe(false);
    } finally {
      if (!desfeito) await apiDelete(page, `/api/calendar/${evento.id}`).catch(() => {});
    }
  });
});
