import { test, expect, type Page } from '@playwright/test';
import { TEXTO_CONSENTIMENTO_ATUAL } from '../src/lib/openFinanceConsentimento';
import {
  expectFitsWithoutClip,
  expectInViewport,
  expectMinTarget,
  gotoMobile,
  prepareMobilePage,
} from './helpers/mobileFit';

/**
 * PWA fase 3, fatia D: Conexões bancárias no celular (projeto `mobile`, SÓ LEITURA).
 *
 * - Flag desligada (CI: PLUGGY_HABILITADO ausente → a API responde 503): só "cabe sem corte" a 390 e
 *   320; o resto pula com anotação.
 * - Flag ligada (dev): jornada até a ETAPA 2 — todos os títulos do termo vigente visíveis ao rolar,
 *   "Autorizar e continuar" visível SEM rolar (rodapé fixo) e desabilitado, "Não autorizo" fecha.
 *   NUNCA marca "Li e autorizo" nem autoriza (registraria consentimento).
 * - Com conexões: ⋯ abre o menu do banco (Esc fecha); o cartão da Caixa de entrada abre ?caixa=1 e o
 *   voltar do navegador volta às conexões. Nada é desconectado nem lançado.
 */

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

const ROUTE = '/conexoes-bancarias';
const READY = 'h2:has-text("Conexões bancárias")';

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

/** O sheet sobe animado: mede a caixa só depois da animação terminar. */
async function sheetParado(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.querySelectorAll('[role="dialog"]')).flatMap((el) =>
        el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined)),
      ),
    ),
  );
}

async function gotoConexoes(page: Page, width = 390) {
  await gotoMobile(page, ROUTE, {
    width,
    height: width === 320 ? 640 : 844,
    readySelector: READY,
  });
}

/** Flag ligada = o botão "Conectar banco" aparece (desligada: aviso "ainda não está disponível"). */
async function flagLigada(page: Page): Promise<boolean> {
  const conectar = page.getByRole('button', { name: 'Conectar banco', exact: true });
  const ligada = await conectar.isVisible().catch(() => false);
  if (!ligada) {
    test.info().annotations.push({
      type: 'conexoes',
      description: 'flag PLUGGY_HABILITADO desligada (503): só a medida de largura',
    });
  }
  return ligada;
}

for (const width of [390, 320]) {
  test(`Conexões @ ${width}: cabe sem corte`, async ({ page }) => {
    test.setTimeout(180_000);
    await gotoConexoes(page, width);
    await expectFitsWithoutClip(page, `conexoes@${width}`, { width });
    if (!(await flagLigada(page))) return;
    const conectar = page.getByRole('button', { name: 'Conectar banco', exact: true });
    await expectMinTarget(conectar);
    // Largura total no celular.
    const box = await conectar.boundingBox();
    expect(box!.width).toBeGreaterThan(width - 80);
  });

  test(`Jornada @ ${width}: etapa 2 com o termo inteiro e o avanço sem rolar (NUNCA autoriza)`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await gotoConexoes(page, width);
    test.skip(!(await flagLigada(page)), 'flag desligada');

    await page.getByRole('button', { name: 'Conectar banco', exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Etapa 1 de 3' });
    await expect(dialog).toBeVisible();
    // A casca some sob o sheet.
    await expect(page.locator('[data-mf-tabbar]')).toBeHidden();
    await sheetParado(page);
    const continuar = dialog.getByRole('button', { name: 'Continuar', exact: true });
    await expectInViewport(continuar);
    await continuar.click();

    const etapa2 = page.getByRole('dialog').filter({ hasText: 'Etapa 2 de 3' });
    await expect(etapa2).toBeVisible();
    await sheetParado(page);
    const autorizar = etapa2.getByRole('button', { name: 'Autorizar e continuar' });
    // Rodapé fixo: visível sem rolar e travado até "Li e autorizo".
    await expectInViewport(autorizar);
    await expect(autorizar).toBeDisabled();
    await expectMinTarget(autorizar);
    const naoAutorizo = etapa2.getByRole('button', { name: 'Não autorizo' });
    await expectInViewport(naoAutorizo);

    for (const s of TEXTO_CONSENTIMENTO_ATUAL.consentimento.secoes) {
      const titulo = etapa2.getByRole('heading', { name: s.titulo, exact: true });
      await titulo.scrollIntoViewIfNeeded();
      await expect(titulo).toBeVisible();
    }
    const aceite = etapa2.getByText(TEXTO_CONSENTIMENTO_ATUAL.consentimento.aceite);
    await aceite.scrollIntoViewIfNeeded();
    await expect(aceite).toBeVisible();
    // Depois de rolar até o fim, o avanço continua na tela e travado.
    await expectInViewport(autorizar);
    await expect(autorizar).toBeDisabled();

    await naoAutorizo.click();
    await expect(etapa2).toBeHidden();
  });
}

test('Com conexões: ⋯ abre o menu do banco e a Caixa de entrada abre com ?caixa=1', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await gotoConexoes(page);
  test.skip(!(await flagLigada(page)), 'flag desligada');

  const cards = page.locator('[data-conexao-card]');
  if ((await cards.count()) === 0) {
    test.info().annotations.push({ type: 'conexoes', description: 'usuário sem conexões' });
    return;
  }
  const mais = cards.first().getByRole('button', { name: /^Mais ações de / });
  await expectMinTarget(mais);
  await mais.click();
  const menu = page.locator('[data-mf-action-sheet]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Desconectar' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  const resumo = page.locator('[data-caixa-resumo]');
  if ((await resumo.count()) === 0) {
    test.info().annotations.push({ type: 'conexoes', description: 'caixa de entrada vazia' });
    return;
  }
  await resumo.click();
  await expect(page).toHaveURL(/[?&]caixa=1/);
  await expect(page.locator('[data-caixa-tela]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conexões', exact: true })).toBeVisible();
  await expectFitsWithoutClip(page, 'caixa@390', { width: 390 });
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]caixa=1/);
  await expect(resumo).toBeVisible();
});
