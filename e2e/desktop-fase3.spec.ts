import { test, expect, type Page } from '@playwright/test';
import { collectStructure } from './helpers/desktopStructure';
import { waitForIdle } from './helpers/mobileFit';
import {
  pdfPageCount,
  printDesktopLike,
  printPhoneLike,
  printSignature,
  printTreeSwapsFromWideWindow,
} from './helpers/print';
import { waitForContent } from './helpers/waitForContent';

/**
 * Guarda de desktop da PWA fase 3 (projeto `chromium`, SÓ LEITURA): Planejamento, Saúde, Dívidas,
 * Agenda, Relatórios, Histórico, Perfil, Educação, Conexões e Comunidade não podem mudar a partir
 * de lg — nem a IMPRESSÃO de /relatorios e /saude-financeira.
 *
 * Por cenário (mesmo desenho do desktop-carteira/desktop-fluxo):
 * (a) retrato estrutural `collectStructure(page, { extras: true })` — abas, tabelas e `controls`
 *     (títulos, botões, campos, links, diálogos) com classe normalizada, sem texto. Roda também no
 *     CI, com baseline própria (`*.ci.structure.json`, banco recém-semeado como o ci.yml) e a local
 *     (`*.local.structure.json`, banco de dev);
 * (b) screenshot da página inteira, só local, mascarando números e gráficos;
 * e nenhum artefato mobile visível.
 *
 * Impressão (CI e local): folha A4 (794px) + media print + matchMedia de desktop → assinatura do
 * layout computado e nº de páginas do PDF, com snapshot. A assinatura mede larguras em décimos da
 * folha, então depende da VERSÃO do Chromium (métrica de texto): as `*.print.ci` são gravadas com o
 * Chromium que o `npx playwright install` do CI baixa (headless shell do Playwright do package.json),
 * NUNCA com PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH — no WSL:
 * `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium-headless-shell`
 * e rodar com CI=true sem o override do executável.
 *
 * Nada aqui grava no banco: o que grava fica em desktop-fase3.escrita.spec.ts (projeto `escrita`).
 * Conexões param na etapa 1 da jornada (Cancelar), NUNCA "Autorizar".
 *
 * Baselines gravadas ANTES das fatias A–E da fase 3. Atualizar só quando a mudança de desktop for
 * intencional.
 */

const ENV = process.env.CI ? 'ci' : 'local';

/** Números, gráficos, a grade de dias da Agenda e o indicador do Next (dev). */
const FASE3_MASK = [
  'tbody td:not(:first-child)',
  'canvas',
  'svg.apexcharts-svg',
  '.apexcharts-canvas',
  '.tabular-nums',
  'nextjs-portal',
  '.fc-daygrid-body',
];

// Aviso de cookies aceito e Devtools do React Query escondido (só dev): o aviso é fixo no rodapé e
// intercepta cliques nas linhas de baixo.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent =
      '.tsqd-parent-container, .tsqd-open-btn-container { display: none !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
    } catch {
      // sem storage: o aviso aparece (e o teste que clicar embaixo dele reprova com o motivo)
    }
  });
});

/** O modal aberto (o Modal do app é role=dialog + aria-modal). */
const openModal = (page: Page) => page.locator('[role="dialog"][aria-modal="true"]');

interface Scenario {
  route: string;
  /** Seletor de "página montada" (visível e com texto). */
  ready: string;
}

/**
 * Espera a rede assentar (várias seções carregam sozinhas, sem skeleton: tabelas da Saúde, os
 * objetivos dos Sonhos, os botões de período dos Relatórios). Sem isso o retrato pega a página
 * pela metade.
 */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {
    test.info().annotations.push({ type: 'rede', description: 'networkidle não veio em 45s' });
  });
  await waitForIdle(page, { settleMs: 800 });
}

async function goto(page: Page, { route, ready }: Scenario, width: number) {
  await page.setViewportSize({ width, height: width === 1024 ? 768 : 800 });
  // Mouse fora da sidebar: o hover expande a sidebar recolhida e muda a margem.
  await page.mouse.move(900, 500);
  await waitForContent(page, route, { readySelector: ready, settleMs: 500 });
  await settle(page);
}

async function checkDesktop(page: Page, slug: string, exclude?: string) {
  await page.mouse.move(900, 500);
  await settle(page);
  const structure = await collectStructure(page, { extras: true, exclude });
  expect
    .soft(JSON.stringify(structure, null, 1), `${slug}: estrutura de desktop`)
    .toMatchSnapshot(`${slug}.${ENV}.structure.json`);
  expect.soft(structure.mobileArtifactsVisible, `${slug}: artefato mobile visível`).toBe(0);
  if (!process.env.CI) {
    await expect.soft(page, `${slug}: screenshot`).toHaveScreenshot(`${slug}.png`, {
      fullPage: true,
      mask: FASE3_MASK.map((sel) => page.locator(sel)),
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
      timeout: 30_000,
    });
  }
}

const APOSENTADORIA: Scenario = {
  route: '/planejamento-financeiro?modo=aposentadoria',
  ready: 'h2:has-text("Planejamento de Aposentadoria")',
};
const SONHOS: Scenario = {
  route: '/planejamento-financeiro?modo=sonhos',
  ready: 'h2:has-text("Planejamento de Sonhos")',
};
const SAUDE: Scenario = { route: '/saude-financeira', ready: 'h2:has-text("Saúde Financeira")' };
const DIVIDAS: Scenario = { route: '/dividas', ready: 'h2:has-text("Dívidas")' };
const AGENDA: Scenario = { route: '/calendario', ready: '.fc-daygrid-body' };
const RELATORIOS: Scenario = { route: '/relatorios', ready: 'h2:has-text("Resumo Executivo")' };
const HISTORICO: Scenario = {
  route: '/historico-alteracoes',
  ready: 'h2:has-text("Histórico de alterações")',
};
const PERFIL: Scenario = { route: '/profile', ready: 'h3:has-text("Informações pessoais")' };
const EDUCACAO: Scenario = { route: '/educacao', ready: 'h1:has-text("Educação")' };
const CONEXOES: Scenario = {
  route: '/conexoes-bancarias',
  ready: 'h2:has-text("Conexões bancárias")',
};
const COMUNIDADE: Scenario = { route: '/comunidade', ready: 'h1:has-text("Comunidade")' };

/**
 * Histórico: só a moldura (título e chips). A lista, o estado vazio e a paginação dependem do que
 * os outros testes gravaram (no CI o projeto `mobile` roda em paralelo e edita/restaura dados).
 * A fatia D põe `data-historico-lista`/`data-historico-vazio`; até lá o corte cai na tabela e no
 * que vem depois dela.
 */
const HISTORICO_EXCLUDE =
  'table, [data-historico-lista], [data-historico-vazio], div:has(> div > table) ~ *, ' +
  'div:has(table) ~ *, .sm\\:hidden';

/** Agenda: a grade de dias muda com a data (hoje/passado/futuro); fica de fora como na máscara. */
const AGENDA_EXCLUDE = '.fc-daygrid-body, .fc-scrollgrid-section-body';

test.describe('Fase 3: desktop inalterado (≥ lg)', () => {
  for (const width of [1280, 1024]) {
    test(`Aposentadoria: Projeção, Acompanhamento e Evolução @ ${width}`, async ({ page }) => {
      test.setTimeout(240_000);
      await goto(page, APOSENTADORIA, width);
      await checkDesktop(page, `aposentadoria-projecao-${width}`);
      await page.getByRole('button', { name: /Acompanhamento/ }).click();
      await checkDesktop(page, `aposentadoria-acompanhamento-${width}`);
      await page.getByRole('button', { name: /Evolução/ }).click();
      await checkDesktop(page, `aposentadoria-evolucao-${width}`);
    });
  }

  test('Sonhos: Cards, Tabela e detalhe do 1º objetivo @ 1280', async ({ page }) => {
    test.setTimeout(240_000);
    await goto(page, SONHOS, 1280);
    await checkDesktop(page, 'sonhos-cards-1280');
    const tabela = page.getByRole('button', { name: 'Tabela', exact: true });
    if ((await tabela.count()) === 0) {
      test.info().annotations.push({ type: 'sonhos', description: 'sem objetivos: só o vazio' });
      return;
    }
    await tabela.click();
    await checkDesktop(page, 'sonhos-tabela-1280');
    await page.locator('tbody tr.cursor-pointer').first().click();
    const voltar = page.getByRole('button', { name: '← Voltar' });
    await expect(voltar).toBeVisible();
    await checkDesktop(page, 'sonhos-detalhe-1280');
    await voltar.click();
    await expect(voltar).toBeHidden();
  });

  for (const width of [1280, 1024]) {
    test(`Saúde Financeira @ ${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await goto(page, SAUDE, width);
      await checkDesktop(page, `saude-${width}`);
    });

    test(`Dívidas @ ${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await goto(page, DIVIDAS, width);
      await checkDesktop(page, `dividas-${width}`);
    });

    test(`Relatórios @ ${width}`, async ({ page }) => {
      test.setTimeout(240_000);
      await goto(page, RELATORIOS, width);
      await checkDesktop(page, `relatorios-${width}`);
    });

    test(`Histórico de alterações (moldura) @ ${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      await goto(page, HISTORICO, width);
      await checkDesktop(page, `historico-${width}`, HISTORICO_EXCLUDE);
    });
  }

  test('Agenda: mês e modal "+ Novo evento" (Cancelar) @ 1280', async ({ page }) => {
    test.setTimeout(180_000);
    await goto(page, AGENDA, 1280);
    await checkDesktop(page, 'agenda-mes-1280', AGENDA_EXCLUDE);
    const novo = page.getByRole('button', { name: '+ Novo evento' });
    if ((await novo.count()) === 0) {
      test.info().annotations.push({ type: 'agenda', description: 'sem "+ Novo evento"' });
      return;
    }
    await novo.click();
    const dialog = openModal(page);
    await expect(dialog).toBeVisible();
    await checkDesktop(page, 'agenda-novo-evento-1280', AGENDA_EXCLUDE);
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test('Perfil @ 1280', async ({ page }) => {
    test.setTimeout(180_000);
    await goto(page, PERFIL, 1280);
    await checkDesktop(page, 'perfil-1280');
  });

  test('Educação e 1º curso @ 1280', async ({ page }) => {
    test.setTimeout(240_000);
    await goto(page, EDUCACAO, 1280);
    await checkDesktop(page, 'educacao-1280');
    const href = await page
      .locator('a[href^="/educacao/"]')
      .first()
      .getAttribute('href', { timeout: 5_000 })
      .catch(() => null);
    if (!href) {
      test.info().annotations.push({ type: 'educacao', description: 'sem curso publicado' });
      return;
    }
    const slug = href.split('?')[0];
    await goto(page, { route: slug, ready: 'h1, h2' }, 1280);
    await checkDesktop(page, 'educacao-curso-1280');
  });

  test('Conexões bancárias (estado da flag) @ 1280', async ({ page }) => {
    test.setTimeout(180_000);
    await goto(page, CONEXOES, 1280);
    await checkDesktop(page, `conexoes-1280`);
    const conectar = page.getByRole('button', { name: 'Conectar banco', exact: true }).first();
    if (!(await conectar.isVisible().catch(() => false))) {
      test.info().annotations.push({ type: 'conexoes', description: 'flag desligada (503)' });
      return;
    }
    // Etapa 1 da jornada e Cancelar. NUNCA "Autorizar" (registraria consentimento).
    await conectar.click();
    const dialog = openModal(page);
    await expect(dialog.getByText('Etapa 1 de 3')).toBeVisible();
    await checkDesktop(page, 'conexoes-jornada-etapa1-1280');
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test('Comunidade @ 1280 (só com a flag ligada)', async ({ page }) => {
    test.setTimeout(180_000);
    const cfg = await page.request.get('/api/comunidade/config');
    const habilitada = cfg.ok() && ((await cfg.json()) as { habilitada?: boolean }).habilitada;
    test.skip(!habilitada, 'flag desligada: COMUNIDADE_HABILITADA');
    await goto(page, COMUNIDADE, 1280);
    await checkDesktop(page, 'comunidade-1280');
  });
});

test.describe('Fase 3: impressão do desktop inalterada (A4)', () => {
  for (const [slug, scenario] of [
    ['relatorios', RELATORIOS],
    ['saude', SAUDE],
  ] as const) {
    test(`${scenario.route}: assinatura da impressão e nº de páginas`, async ({
      page,
      browser,
    }) => {
      test.setTimeout(240_000);
      await printDesktopLike(page, scenario.route, scenario.ready);
      const signature = await printSignature(page);
      expect
        .soft(
          signature.join('\n'),
          `${slug}: assinatura da impressão (Chromium ${browser.version()}; a baseline depende da versão)`,
        )
        .toMatchSnapshot(`${slug}.print.${ENV}.json`);
      const pages = await pdfPageCount(page);
      expect
        .soft(String(pages), `${slug}: páginas do PDF`)
        .toMatchSnapshot(`${slug}.pdf-pages.${ENV}.txt`);
    });

    // Sem stub: o Chromium faz a query de "abaixo de lg" casar durante o page.pdf numa janela de
    // 1280. A árvore de desktop não pode trocar (gráficos remontados saem vazios no PDF).
    test(`${scenario.route}: page.pdf de uma janela de 1280 não troca a árvore`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: 1280, height: 800 });
      await waitForContent(page, scenario.route, { readySelector: scenario.ready, settleMs: 500 });
      await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
      await page.waitForTimeout(1_500);
      const swap = await printTreeSwapsFromWideWindow(page);
      expect(swap.mobileNodesAdded, `${slug}: nós de celular montados na impressão`).toBe(0);
      expect(swap.chartsRemoved, `${slug}: gráficos desmontados na impressão`).toBe(0);
    });

    // Liga na fatia B: imprimir do celular dá a mesma assinatura do desktop (gráficos à parte) e
    // nenhum [data-mf-mobile] visível. Hoje o celular ainda imprime o layout de tela pequena.
    test.fixme(`${scenario.route}: impressão a partir do celular = desktop (liga na B)`, async ({
      page,
    }) => {
      await printPhoneLike(page, scenario.route, scenario.ready);
    });
  }
});
