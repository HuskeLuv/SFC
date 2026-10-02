import { test, expect, type Page } from '@playwright/test';
import {
  expectFitsWithoutClip,
  expectMinTarget,
  gotoMobile,
  prepareMobilePage,
} from './helpers/mobileFit';

/**
 * Análise de Ativos — Fase 1, fatia A: Quadro no celular (projeto `mobile`, SÓ LEITURA).
 * Crítica 6 do revisor: o trilho de chips numa linha própria, sem sobrepor a linha "Ordem" +
 * Resumo|Detalhado; chips e pílulas com 44px; sem rolagem horizontal a 390 e a 320.
 */

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
  const cfg = await page.request.get('/api/analise-ativos/config');
  const habilitada = cfg.ok() && ((await cfg.json()) as { habilitada?: boolean }).habilitada;
  test.skip(!habilitada, 'Análise de Ativos desligada ou usuário fora do beta');
});

const READY = '[data-quadro-cartoes] li, [data-quadro-estado]';

async function abrir(page: Page, width: number) {
  await gotoMobile(page, '/analise-ativos', {
    width,
    height: width === 320 ? 640 : 844,
    readySelector: READY,
  });
}

for (const width of [390, 320]) {
  test(`Quadro @ ${width}: cabe, alvos de 44px, chips sem sobrepor a linha de ordem`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await abrir(page, width);
    await expectFitsWithoutClip(page, `quadro-${width}`, { width });

    const chips = page.locator('[data-quadro-chips]');
    const ordemLinha = page.locator('[data-quadro-ordem-linha]');
    for (const b of await chips.getByRole('button').all()) {
      if (await b.isVisible()) {
        const box = await b.boundingBox();
        // só os que estão dentro da tela (o trilho rola para o lado)
        if (box && box.x >= 0 && box.x + box.width <= width) await expectMinTarget(b);
      }
    }
    for (const b of await page.locator('[data-quadro-modos] button').all())
      await expectMinTarget(b);
    await expectMinTarget(page.getByRole('button', { name: /Ordem:/ }));
    // (o segmentado Ações|FIIs é o ResponsiveTabNav do app: 38px + 3px de borda = 44 de toque)

    const a = await chips.boundingBox();
    const b = await ordemLinha.boundingBox();
    expect(a && b, 'trilho e linha de ordem visíveis').toBeTruthy();
    expect(a!.y + a!.height, 'chips terminam antes da linha de ordem').toBeLessThanOrEqual(
      b!.y + 0.5,
    );

    // cartão abre a página do ativo (alvo grande)
    const cartao = page.locator('[data-quadro-cartoes] li a').first();
    await expectMinTarget(cartao, 72);
  });
}

test('sheet de ordem: rádios de 52px, direção e "sem dado no fim"', async ({ page }) => {
  test.setTimeout(120_000);
  await abrir(page, 390);
  await page.getByRole('button', { name: /Ordem:/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Ordenar ações' });
  await expect(sheet).toBeVisible();
  const radios = sheet.getByRole('radio');
  expect(await radios.count()).toBeGreaterThan(3);
  await expectMinTarget(radios.first(), 52);
  await expect(sheet.getByRole('radio', { name: /Índice MF/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(
    sheet.getByText('Ativos sem dado para a ordem escolhida ficam no fim da lista.'),
  ).toBeVisible();
  await sheet.getByRole('radio', { name: /^P\/L/ }).click();
  await sheet.getByRole('button', { name: 'Ver resultado' }).click();
  await expect(page).toHaveURL(/ordem=pl&dir=asc/);
  await expect(page.getByRole('button', { name: /Ordem: P\/L/ })).toBeVisible();
});

test('busca em tela cheia com campo de 16px', async ({ page }) => {
  test.setTimeout(120_000);
  await abrir(page, 390);
  await page.getByRole('button', { name: 'Buscar ativo' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Buscar ativo' });
  const campo = dialogo.getByRole('combobox');
  await expect(campo).toBeVisible();
  const fonte = await campo.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fonte).toBeGreaterThanOrEqual(16);
  await campo.fill('hglg');
  await expect(dialogo.getByRole('option', { name: /HGLG11/ })).toBeVisible({ timeout: 30_000 });
});
