import { test, expect, type Page } from '@playwright/test';
import {
  expectFitsWithoutClip,
  expectInViewport,
  expectMinTarget,
  gotoMobile,
  prepareMobilePage,
} from './helpers/mobileFit';

/**
 * PWA fase 3 · fatia C — Agenda no celular (projeto `mobile`).
 *
 * Decisão do Wellington: abaixo de 768px a Agenda é a LISTA do mês com cabeçalho próprio (‹ mês ›,
 * Hoje, Filtros, + Novo); de 768 a 1023 o tablet mantém a GRADE de mês. SÓ LEITURA: o "+ Novo" abre
 * e fecha sem salvar; os filtros alternados são desfeitos (preferência local do navegador).
 */
test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

const titulo = (page: Page) => page.locator('[data-mf-agenda-titulo]');

async function abrir(page: Page, width = 390, height = 844) {
  await gotoMobile(page, '/calendario', { width, height });
  await expect(titulo(page)).not.toHaveText(/^\s*$/);
}

test('lista do mês (sem a grade) com o cabeçalho próprio de 44px', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('.fc-list-event, .fc-list-empty').first()).toBeVisible();
  await expect(page.locator('.fc-daygrid-body')).toHaveCount(0);
  // A toolbar do FullCalendar dá lugar ao nosso cabeçalho.
  await expect(page.locator('.fc-header-toolbar')).toHaveCount(0);
  // Painel lateral (Mostrar / Próximos 30 dias) não aparece no celular.
  await expect(page.getByRole('heading', { name: /Próximos 30 dias/ })).toHaveCount(0);

  for (const name of ['Mês anterior', 'Próximo mês', 'Hoje']) {
    await expectMinTarget(page.getByRole('button', { name, exact: true }));
  }
  await expectMinTarget(page.getByRole('button', { name: /^Filtros/ }));
  await expectMinTarget(page.getByRole('button', { name: 'Novo', exact: true }));
  await expectMinTarget(page.getByRole('button', { name: 'Mais ações da Agenda' }));
  // No mês corrente o "Hoje" fica desabilitado (como o do FullCalendar).
  await expect(page.getByRole('button', { name: 'Hoje', exact: true })).toBeDisabled();
});

test('› muda o mês do título e Hoje volta', async ({ page }) => {
  await abrir(page);
  const antes = (await titulo(page).textContent())?.trim();
  await page.getByRole('button', { name: 'Próximo mês' }).click();
  await expect(titulo(page)).not.toHaveText(antes ?? '');
  const hoje = page.getByRole('button', { name: 'Hoje', exact: true });
  await expect(hoje).toBeEnabled();
  await hoje.click();
  await expect(titulo(page)).toHaveText(antes ?? '');
});

test('Filtros abre o sheet com role=checkbox; Esc fecha', async ({ page }) => {
  await abrir(page);
  await page.getByRole('button', { name: /^Filtros/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Mostrar na agenda' });
  await expect(sheet).toBeVisible();
  const boxes = sheet.getByRole('checkbox');
  expect(await boxes.count()).toBeGreaterThanOrEqual(7);
  // Alterna e desfaz (a preferência fica igual à de antes).
  const primeiro = boxes.first();
  const estado = await primeiro.getAttribute('aria-checked');
  await primeiro.click();
  await expect(primeiro).not.toHaveAttribute('aria-checked', estado ?? '');
  await primeiro.click();
  await expect(primeiro).toHaveAttribute('aria-checked', estado ?? '');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('+ Novo abre o evento em sheet com data nativa e rodapé à vista; Cancelar fecha', async ({
  page,
}) => {
  await abrir(page);
  await page.getByRole('button', { name: 'Novo', exact: true }).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dialog.getByText('Novo evento')).toBeVisible();
  // O sheet sobe com animação (mf-sheet-in, 260ms): mede depois de assentar.
  await page.waitForTimeout(500);
  await expect(dialog.locator('#agenda-data')).toHaveAttribute('type', 'date');
  await expect(dialog.getByRole('radiogroup')).toBeVisible();
  const adicionar = dialog.getByRole('button', { name: 'Adicionar' });
  await expectInViewport(adicionar);

  // Sem título: a mensagem de hoje, no campo.
  await adicionar.click();
  const campo = dialog.locator('#agenda-titulo');
  await expect(campo).toHaveAttribute('aria-invalid', 'true');
  await expect(campo).toBeFocused();
  await expect(dialog.getByText('Dê um título ao evento.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});

for (const [width, height] of [
  [390, 844],
  [320, 640],
] as const) {
  test(`cabe sem corte a ${width}px`, async ({ page }) => {
    await abrir(page, width, height);
    await expectFitsWithoutClip(page, `/calendario@${width}`, { width });
  });
}

test('tablet (800px) mantém a grade de mês, sem o cabeçalho do celular', async ({ page }) => {
  await gotoMobile(page, '/calendario', {
    width: 800,
    height: 1100,
    readySelector: '.fc-daygrid-body',
  });
  await expect(page.locator('.fc-daygrid-body')).toBeVisible();
  await expect(page.locator('[data-mf-agenda-barra]')).toHaveCount(0);
  await expect(page.locator('.fc-header-toolbar')).toBeVisible();
});
