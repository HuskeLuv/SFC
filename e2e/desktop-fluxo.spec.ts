import { test, expect, type Page } from '@playwright/test';
import { collectStructure } from './helpers/desktopStructure';
import { waitForIdle } from './helpers/mobileFit';

/**
 * Guarda de desktop da PWA fase 2 (projeto `chromium`, sem isMobile): as fatias do Fluxo de caixa
 * extraem hooks e regras do DataTableTwo e das linhas da planilha, e NADA pode mudar a partir de lg.
 *
 * Mesmo desenho do desktop-carteira.spec:
 * (a) retrato estrutural (`collectStructure`) — roda também no CI, com baseline própria
 *     (`*.ci.structure.json`, gerada contra um banco recém-semeado, como o ci.yml) e a local
 *     (`*.local.structure.json`, banco de dev);
 * (b) screenshot da página inteira, só local, mascarando números, gráficos e o cabeçalho do mês
 *     atual (a coluna destacada anda com o calendário);
 * e nenhum artefato mobile visível.
 *
 * Cenários: planilha @1280/@1024, "Recolher tudo" e "Expandir tudo", modo edição do primeiro grupo
 * (Editar → retrato → Cancelar; NUNCA Salvar), modal "Importar planilha" (fechado pelo botão
 * Cancelar — o modal não trata Esc) e o Orçamento nas visões Mês, Acumulado do ano e Consolidado.
 *
 * Baselines gravadas ANTES das extrações da fatia 0. Atualizar só quando a mudança de desktop for
 * intencional.
 */

const ENV = process.env.CI ? 'ci' : 'local';

/** Números, gráficos, o cabeçalho do mês atual e o indicador do Next (dev). */
const FLUXO_MASK = [
  'tbody td:not(:first-child)',
  'thead th[title="Mês atual"]',
  'canvas',
  'svg.apexcharts-svg',
  '.apexcharts-canvas',
  '.tabular-nums',
  'nextjs-portal',
];

async function gotoFluxo(page: Page, width: number, modo?: 'orcamento') {
  await page.setViewportSize({ width, height: width === 1024 ? 768 : 800 });
  // Mouse fora da sidebar: o hover expande a sidebar recolhida e muda a margem.
  await page.mouse.move(900, 500);
  await page.goto(modo ? `/fluxodecaixa?modo=${modo}` : '/fluxodecaixa', {
    waitUntil: 'domcontentloaded',
  });
  if (modo === 'orcamento') {
    await expect(page.getByRole('heading', { name: 'Resumo por Categoria' })).toBeVisible({
      timeout: 60_000,
    });
  } else {
    await page
      .locator('table[aria-label="Planilha de fluxo de caixa"] tbody tr')
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 });
  }
  await waitForIdle(page);
}

async function checkDesktop(page: Page, slug: string) {
  await page.mouse.move(900, 500);
  const structure = await collectStructure(page);
  expect
    .soft(JSON.stringify(structure, null, 1), `${slug}: estrutura de desktop`)
    .toMatchSnapshot(`${slug}.${ENV}.structure.json`);
  expect.soft(structure.mobileArtifactsVisible, `${slug}: artefato mobile visível`).toBe(0);
  if (!process.env.CI) {
    await expect.soft(page, `${slug}: screenshot`).toHaveScreenshot(`${slug}.png`, {
      fullPage: true,
      mask: FLUXO_MASK.map((sel) => page.locator(sel)),
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
      timeout: 30_000,
    });
  }
}

test.describe('Fluxo de caixa: desktop inalterado (≥ lg)', () => {
  for (const width of [1280, 1024]) {
    test(`planilha @ ${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await gotoFluxo(page, width);
      await checkDesktop(page, `planilha-${width}`);
    });
  }

  test('Recolher tudo e Expandir tudo @ 1280', async ({ page }) => {
    test.setTimeout(180_000);
    await gotoFluxo(page, 1280);
    await page.getByRole('button', { name: 'Recolher tudo', exact: true }).click();
    await waitForIdle(page, { settleMs: 400 });
    await checkDesktop(page, 'planilha-recolhida-1280');
    await page.getByRole('button', { name: 'Expandir tudo', exact: true }).click();
    await waitForIdle(page, { settleMs: 400 });
    await checkDesktop(page, 'planilha-expandida-1280');
  });

  test('modo edição do primeiro grupo @ 1280 (cancela, nunca salva)', async ({ page }) => {
    test.setTimeout(180_000);
    await gotoFluxo(page, 1280);
    await page.getByRole('button', { name: 'Editar grupo' }).first().click();
    const cancelar = page.getByRole('button', { name: 'Cancelar edição' });
    await expect(cancelar).toBeVisible();
    await waitForIdle(page, { settleMs: 400 });
    await checkDesktop(page, 'planilha-edicao-1280');
    await cancelar.click();
    await expect(cancelar).toBeHidden();
  });

  test('modal Importar planilha @ 1280', async ({ page }) => {
    test.setTimeout(180_000);
    await gotoFluxo(page, 1280);
    await page.getByRole('button', { name: 'Importar planilha', exact: true }).click();
    const titulo = page.getByRole('heading', { name: 'Importar planilha FLC' });
    await expect(titulo).toBeVisible();
    await waitForIdle(page, { settleMs: 400 });
    await checkDesktop(page, 'importar-planilha-1280');
    // O modal não trata Esc: fecha pelo próprio botão.
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(titulo).toBeHidden();
  });

  for (const width of [1280, 1024]) {
    test(`Orçamento: Mês, Acumulado do ano e Consolidado @ ${width}`, async ({ page }) => {
      test.setTimeout(240_000);
      await gotoFluxo(page, width, 'orcamento');
      await checkDesktop(page, `orcamento-mes-${width}`);
      await page.getByRole('button', { name: 'Acumulado do ano', exact: true }).click();
      await waitForIdle(page);
      await checkDesktop(page, `orcamento-acumulado-${width}`);
      await page.getByRole('button', { name: 'Mês', exact: true }).click();
      await page.getByRole('button', { name: 'Consolidado', exact: true }).click();
      await waitForIdle(page);
      await checkDesktop(page, `orcamento-consolidado-${width}`);
    });
  }
});
