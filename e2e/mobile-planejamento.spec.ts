import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  expectChartsFit,
  expectFitsWithoutClip,
  expectInViewport,
  expectMinTarget,
  gotoMobile,
  prepareMobilePage,
  waitForIdle,
} from './helpers/mobileFit';

/**
 * PWA fase 3, fatia A: Planejar (/planejamento-financeiro) no celular (projeto `mobile`, SÓ
 * LEITURA).
 *
 * Nada aqui grava: o sheet de premissas abre e fecha SEM digitar (o simulador tem autosave), o
 * "Registrar mês" fecha sem salvar e o cadastro de objetivo fecha no Cancelar. No CI o banco do
 * seed não tem objetivos: os Sonhos caem no estado vazio ("Criar primeiro objetivo").
 */

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

const APOSENTADORIA = '/planejamento-financeiro?modo=aposentadoria';
const SONHOS = '/planejamento-financeiro?modo=sonhos';

const sheet = (page: Page) => page.locator('[data-mf-sheet][role="dialog"]').last();

/** Espera o sheet terminar de subir (animação de entrada) antes de medir posições. */
async function settled(dlg: Locator) {
  await expect(dlg).toBeVisible();
  await dlg.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return dlg;
}

async function gotoPlanejar(page: Page, route: string, width: number) {
  await gotoMobile(page, route, { width, height: width === 320 ? 640 : 844 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await waitForIdle(page);
}

for (const width of [390, 320]) {
  test(`Aposentadoria @ ${width}: segmentado, premissas, sub-abas e acompanhamento`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await gotoPlanejar(page, APOSENTADORIA, width);

    // (a) Aposentadoria | Meus Sonhos: segmentado de 44px que muda a URL (aria-current).
    const ferramenta = page.getByRole('button', { name: 'Aposentadoria', exact: true });
    await expect(ferramenta).toHaveAttribute('aria-current', 'page');
    await expectMinTarget(ferramenta);
    await expectMinTarget(page.getByRole('button', { name: 'Meus Sonhos', exact: true }));

    // O painel lateral do desktop não existe no celular; o cartão de premissas sim.
    await expect(page.locator('[data-mf-content] aside')).toHaveCount(0);
    const premissas = page.locator('[data-premissa]');
    await expect(premissas).toHaveCount(9);
    for (const btn of await premissas.all()) await expectMinTarget(btn);

    await expectFitsWithoutClip(page, `aposentadoria-${width}`, { width });

    // (b) Cartão → sheet "Premissas" com o resumo ao vivo e campos decimais. NÃO digita.
    await page.locator('[data-premissa="rentNom"]').click();
    const dlg = await settled(sheet(page));
    await expect(dlg.getByRole('heading', { name: 'Premissas' })).toBeVisible();
    await expect(dlg.locator('[data-premissas-resumo]')).toContainText(/Aos \d+|expectativa/);
    await expect(dlg.locator('#premissa-rentNom')).toBeFocused();
    await expect(dlg.locator('#premissa-rentNom')).toHaveAttribute('inputmode', 'decimal');
    await expect(dlg.locator('#premissa-patrimonio')).toHaveAttribute('inputmode', 'decimal');
    await expect(dlg.locator('input[type="range"], input[type="number"]')).toHaveCount(0);
    await expectInViewport(dlg.getByRole('button', { name: 'Pronto' }));
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();

    // (c) Sub-abas Projeção | Acompanhamento | Evolução (role=tab, sem emoji), gráficos cabem.
    const tabs = page.getByRole('tablist', { name: 'Visão do simulador' });
    await expect(tabs.getByRole('tab')).toHaveText(['Projeção', 'Acompanhamento', 'Evolução']);
    for (const name of ['Projeção', 'Acompanhamento', 'Evolução']) {
      const tab = tabs.getByRole('tab', { name });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expectMinTarget(tab);
      await waitForIdle(page, { settleMs: 1200 });
      await expectChartsFit(page);
      await expectFitsWithoutClip(page, `aposentadoria-${name}-${width}`, { width });

      if (name === 'Projeção') {
        await expect(page.locator('[data-mf-mobile] dt').first()).toBeVisible();
      }

      if (name === 'Acompanhamento') {
        // (d) cartões por mês (ou vazio) e "Registrar mês" em sheet, fechado sem salvar.
        await expect(page.locator('table')).toHaveCount(0);
        expect(await page.locator('[data-mf-card]').count()).toBeGreaterThan(0);
        const registrar = page.getByRole('button', { name: 'Registrar mês', exact: true });
        await expectMinTarget(registrar);
        await registrar.click();
        const reg = await settled(sheet(page));
        await expect(reg.getByRole('heading', { name: 'Registrar mês' })).toBeVisible();
        await expect(reg.getByLabel('Mês de referência')).toHaveAttribute('type', 'month');
        await expect(reg.getByLabel('Patrimônio final do mês')).toHaveAttribute(
          'inputmode',
          'decimal',
        );
        await expectInViewport(reg.getByRole('button', { name: 'Salvar' }));
        await reg.getByRole('button', { name: 'Fechar' }).click();
        await expect(reg).toBeHidden();
      }
    }
  });

  test(`Meus Sonhos @ ${width}: chips, cartões/vazio, detalhe e cadastro em sheet`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await gotoPlanejar(page, SONHOS, width);

    await expect(page.getByRole('button', { name: 'Meus Sonhos', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // (e) no celular não há alternância Cards/Tabela nem tabela.
    await expect(page.getByRole('button', { name: 'Tabela', exact: true })).toHaveCount(0);
    await expect(page.locator('table')).toHaveCount(0);
    await expectFitsWithoutClip(page, `sonhos-${width}`, { width });

    const cards = page.locator('[data-mf-card]');
    const vazio = page.getByRole('button', { name: 'Criar primeiro objetivo' });

    if ((await cards.count()) === 0) {
      test.info().annotations.push({ type: 'sonhos', description: 'sem objetivos: estado vazio' });
      await expect(vazio).toBeVisible();
      await expectMinTarget(vazio);
      await vazio.click();
    } else {
      // Chips de prazo com rolagem própria.
      await expect(page.locator('[data-mf-scroll-x]').first()).toBeVisible();
      await expect(page.getByRole('button', { name: /^Todos \(\d+\)$/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      // Todo cartão tem o selo em texto (ponto + palavra).
      await expect(cards.first().locator('[data-mf-status]')).not.toHaveText('');

      // 1º cartão → detalhe → "Mais ações" → menu → Esc → Voltar.
      await cards.first().locator('button').first().click();
      const voltar = page.getByRole('button', { name: '← Voltar' });
      await expect(voltar).toBeVisible();
      await expectMinTarget(voltar);
      await waitForIdle(page, { settleMs: 1200 });
      await expectChartsFit(page);
      await expectFitsWithoutClip(page, `sonhos-detalhe-${width}`, { width });
      await page.getByRole('button', { name: 'Mais ações' }).click();
      await expect(page.locator('[data-mf-action-sheet]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-mf-action-sheet]')).toBeHidden();
      await voltar.click();
      await expect(voltar).toBeHidden();

      await page.getByRole('button', { name: '+ Adicionar objetivo' }).click();
    }

    // Cadastro em sheet alto com o rodapé visível; Cancelar fecha sem gravar.
    const dlg = await settled(sheet(page));
    await expect(dlg.getByRole('heading', { name: 'Novo objetivo' })).toBeVisible();
    await expect(dlg.getByRole('radiogroup', { name: 'Prioridade' })).toBeVisible();
    await expect(dlg.getByLabel('Meta', { exact: true })).toHaveAttribute('inputmode', 'decimal');
    const cancelar = dlg.getByRole('button', { name: 'Cancelar' });
    await expectInViewport(cancelar);
    await expectInViewport(dlg.getByRole('button', { name: 'Criar objetivo' }));
    await cancelar.click();
    await expect(dlg).toBeHidden();
  });
}

test('Planejar @ 390: screenshots locais', async ({ page }) => {
  test.skip(!!process.env.CI, 'screenshots só locais');
  test.setTimeout(240_000);
  await gotoPlanejar(page, APOSENTADORIA, 390);
  await page.screenshot({ path: 'test-results/mobile-planejamento-aposentadoria.png' });
  await gotoPlanejar(page, SONHOS, 390);
  await page.screenshot({ path: 'test-results/mobile-planejamento-sonhos.png' });
});
