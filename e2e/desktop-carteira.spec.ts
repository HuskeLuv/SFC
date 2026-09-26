import { test, expect, type Page } from '@playwright/test';
import { collectStructure } from './helpers/desktopStructure';
import { openCarteiraTab, waitCarteiraReady, waitForIdle } from './helpers/mobileFit';
import { DEFAULT_READY_SELECTOR, DYNAMIC_ROUTES } from './helpers/routes';
import { waitForContent } from './helpers/waitForContent';

/**
 * Guarda de desktop da PWA fase 1 (projeto `chromium`, sem isMobile): as fatias da Carteira mexem
 * no JSX das tabelas, abas e wizards, e NADA pode mudar a partir de lg.
 *
 * Duas camadas, por aba:
 * (a) retrato estrutural (`collectStructure`: abas, th, colunas e classes normalizadas) — roda
 *     também no CI, com baseline própria (`*.ci.structure.json`, gerada contra um banco recém-
 *     semeado, como o ci.yml) e a local (`*.local.structure.json`, banco de dev);
 * (b) screenshot da página inteira, só local, mascarando números e gráficos — a <table> NÃO é
 *     mascarada inteira, então a geometria das células continua comparada.
 * E nenhum artefato mobile (`data-mf-card`, `data-mf-edit`, `data-mf-section`,
 * `data-mf-wizard-footer`) visível.
 *
 * Baselines gravadas a partir do branch base da fase 1, ANTES das fatias A–D. Atualizar só quando
 * a mudança de desktop for intencional.
 */

const ENV = process.env.CI ? 'ci' : 'local';

/** As 14 abas do Resumo, pelo nome ATUAL (o mesmo no celular). */
const CLASS_TABS = [
  'Carteira Consolidada',
  'Reserva Emergência',
  'Reserva Oportunidade',
  'Renda Fixa',
  'Fundos',
  "FII's",
  'Ações',
  'Stocks',
  "REIT's",
  "ETF's",
  'Moedas, Criptomoedas & outros',
  'Previdência e Seguros',
  'Opções',
  'Imóveis & Bens',
] as const;

const ANALISE_TABS = [
  'Rentabilidade Geral',
  'Proventos',
  'Risco x Retorno',
  'Cobertura FGC',
  'Imposto de Renda',
] as const;

/** Números, gráficos e o indicador do Next (dev) — o resto da página é comparado. */
const CARTEIRA_MASK = [
  'tbody td:not(:first-child)',
  'canvas',
  'svg.apexcharts-svg',
  '.apexcharts-canvas',
  '.tabular-nums:not(table *)',
  // Valor dos cards de métrica (CARD_VALUE_CLASS), que não usa tabular-nums.
  '.text-xl.font-semibold:not(table *)',
  'nextjs-portal',
];

const slugify = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function gotoCarteira(page: Page, width: number) {
  await page.setViewportSize({ width, height: width === 1024 ? 768 : 800 });
  // Mouse fora da sidebar: o hover expande a sidebar recolhida e muda a margem.
  await page.mouse.move(900, 500);
  await page.goto('/carteira', { waitUntil: 'domcontentloaded' });
  await waitCarteiraReady(page);
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
      mask: CARTEIRA_MASK.map((sel) => page.locator(sel)),
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
      timeout: 30_000,
    });
  }
}

test.describe('Carteira: desktop inalterado (≥ lg)', () => {
  test('Resumo e as 14 abas @ 1280', async ({ page }) => {
    test.setTimeout(900_000);
    await gotoCarteira(page, 1280);
    for (const label of CLASS_TABS) {
      await openCarteiraTab(page, label);
      await checkDesktop(page, `resumo-${slugify(label)}-1280`);
    }
  });

  test('Análise e sub-abas @ 1280', async ({ page }) => {
    test.setTimeout(600_000);
    await gotoCarteira(page, 1280);
    await openCarteiraTab(page, 'Análise');
    for (const label of ANALISE_TABS) {
      await openCarteiraTab(page, label);
      await checkDesktop(page, `analise-${slugify(label)}-1280`);
    }
  });

  test('Resumo e Ações @ 1024', async ({ page }) => {
    test.setTimeout(300_000);
    await gotoCarteira(page, 1024);
    for (const label of ['Carteira Consolidada', 'Ações']) {
      await openCarteiraTab(page, label);
      await checkDesktop(page, `resumo-${slugify(label)}-1024`);
    }
  });

  test('wizard de cadastro, passo 1 @ 1280', async ({ page }) => {
    test.setTimeout(180_000);
    await gotoCarteira(page, 1280);
    await page.getByRole('button', { name: 'Adicionar Investimento', exact: true }).click();
    const wizard = page.getByRole('dialog', { name: 'Adicionar Ativo à Carteira' });
    await expect(wizard).toBeVisible();
    // Deixa a mola do drawer assentar. Nunca avança: só o passo 1.
    await page.waitForTimeout(800);
    await waitForIdle(page);
    await checkDesktop(page, 'wizard-passo1-1280');
    await page.keyboard.press('Escape');
    await expect(wizard).toBeHidden();
  });

  test('página do ativo e edição @ 1280', async ({ page }) => {
    test.setTimeout(300_000);
    await gotoCarteira(page, 1280);
    const dyn = DYNAMIC_ROUTES.find((r) => r.name === '/ativos/{id}')!;
    let href: string | null = null;
    for (const name of dyn.reveal ?? []) {
      const btn = page.getByRole('button', { name, exact: true }).first();
      if ((await btn.count()) === 0) continue;
      await openCarteiraTab(page, name);
      href = await page
        .locator(dyn.linkSelector)
        .first()
        .getAttribute('href', { timeout: 2_000 })
        .catch(() => null);
      if (href) break;
    }
    // O usuário do seed (CI) não tem ativos: sem link não há o que medir.
    test.skip(!href, `sem link ${dyn.linkSelector} na /carteira`);

    const base = href!.split('?')[0].replace(/\/$/, '');
    await page.mouse.move(900, 500);
    await waitForContent(page, base, { readySelector: DEFAULT_READY_SELECTOR });
    await checkDesktop(page, 'ativo-1280');
    await waitForContent(page, `${base}/editar`, { readySelector: DEFAULT_READY_SELECTOR });
    await checkDesktop(page, 'ativo-editar-1280');
  });
});
