import { test, expect, type Page } from '@playwright/test';
import { openCarteiraTab, waitCarteiraReady, waitForIdle } from './helpers/mobileFit';

/**
 * Cobertura FGC por banco emissor (ClickUp 86e2xqh69). Só leitura: a resposta de
 * /api/analises/cobertura-fgc é trocada por uma fixture com os cenários do protótipo (Banco XP
 * por duas corretoras, fallback da corretora, corretora gravada como emissor, Open Finance sem
 * casamento, debênture gravada como CDB e dois bancos do mesmo conglomerado), então o teste não
 * depende da carteira do banco do seed e nada é gravado.
 *
 * Confere: linha "via", pills, aviso de conglomerado, "Informar emissor" com 44px ou mais e
 * link para /ativos/{id}/editar?editar=emissor, nenhum link em quem não aceita emissor e nenhuma
 * rolagem lateral — a 1280 e a 390 (isMobile), claro e escuro.
 */

const ativo = (over: Record<string, unknown>) => ({
  produto: 'CDB',
  vencimento: '2028-10-16T00:00:00.000Z',
  coberto: true,
  isentoIR: false,
  corretoraNome: 'BTG Pactual',
  fonteInstituicao: 'emissor',
  aceitaEmissor: true,
  origem: 'manual',
  emissorInformadoTexto: null,
  editarEmissorHref: null,
  ...over,
});

const grupo = (over: Record<string, unknown>) => ({
  cnpj: null,
  totalNaoCoberto: 0,
  limiteFgc: 250_000,
  excedente: 0,
  corretoras: [{ id: 'btg', nome: 'BTG Pactual' }],
  ativosSemEmissor: 0,
  usaCorretoraComoEmissor: false,
  titularNaoEmissor: false,
  conglomerado: null,
  temOpenFinance: false,
  cnpjCalculado: false,
  ...over,
});

const FIXTURE = {
  resumo: {
    totalEfetivamenteCoberto: 840_640,
    totalNaoCoberto: 0,
    totalExcedente: 60_730,
    totalValorRendaFixa: 901_370,
    percentualCoberto: 93.26,
    limiteGlobal: 1_000_000,
    limitePorInstituicao: 250_000,
    totalAtivos: 8,
    totalInstituicoes: 6,
  },
  instituicoes: [
    grupo({
      instituicaoId: 'bxp',
      instituicaoNome: 'Banco XP S.A.',
      cnpj: '33264668000103',
      cnpjCalculado: true,
      chave: '33264668',
      corretoras: [
        { id: 'btg', nome: 'BTG Pactual' },
        { id: 'xp', nome: 'XP Investimentos' },
      ],
      totalCoberto: 310_730,
      totalValor: 310_730,
      percentualUtilizado: 124.29,
      excedente: 60_730,
      ativos: [
        ativo({
          id: 'e2e-bxp-1',
          nome: 'CDB Banco XP 2028',
          valorAtual: 186_420,
          valorInvestido: 180_000,
        }),
        ativo({
          id: 'e2e-bxp-2',
          nome: 'CDB Banco XP 2027',
          valorAtual: 124_310,
          valorInvestido: 120_000,
          corretoraNome: 'XP Investimentos',
        }),
      ],
    }),
    grupo({
      instituicaoId: 'btg',
      instituicaoNome: 'BTG Pactual',
      cnpj: '30306294000145',
      chave: '30306294',
      totalCoberto: 245_400,
      totalValor: 245_400,
      percentualUtilizado: 98.16,
      ativosSemEmissor: 1,
      usaCorretoraComoEmissor: true,
      ativos: [
        ativo({
          id: 'e2e-fb-1',
          nome: 'CDB BTG 2026',
          valorAtual: 95_000,
          valorInvestido: 90_000,
          fonteInstituicao: 'corretora',
          editarEmissorHref: '/ativos/e2e-fb-1/editar?editar=emissor',
        }),
        ativo({
          id: 'e2e-deb-1',
          nome: 'Debênture XYZ (gravada como CDB)',
          valorAtual: 150_400,
          valorInvestido: 150_000,
          fonteInstituicao: 'nao-se-aplica',
          aceitaEmissor: false,
        }),
      ],
    }),
    grupo({
      instituicaoId: 'safra',
      instituicaoNome: 'Banco Safra',
      cnpj: '58160789000128',
      chave: '58160789',
      conglomerado: 'C0080109',
      totalCoberto: 162_400,
      totalValor: 162_400,
      percentualUtilizado: 64.96,
      ativos: [
        ativo({
          id: 'e2e-safra',
          nome: 'LCA Safra 2028',
          produto: 'LCA',
          valorAtual: 162_400,
          valorInvestido: 155_000,
          isentoIR: true,
        }),
      ],
    }),
    grupo({
      instituicaoId: 'jsafra',
      instituicaoNome: 'Banco J. Safra',
      cnpj: '03017677000120',
      chave: '03017677',
      conglomerado: 'C0080109',
      corretoras: [{ id: 'xp', nome: 'XP Investimentos' }],
      totalCoberto: 118_900,
      totalValor: 118_900,
      percentualUtilizado: 47.56,
      ativos: [
        ativo({
          id: 'e2e-jsafra',
          nome: 'CDB J. Safra 2027',
          valorAtual: 118_900,
          valorInvestido: 115_000,
          corretoraNome: 'XP Investimentos',
        }),
      ],
    }),
    grupo({
      instituicaoId: 'nuinv',
      instituicaoNome: 'NuInvest Corretora',
      cnpj: '62169875000179',
      chave: '62169875',
      corretoras: [{ id: 'nuinv', nome: 'NuInvest Corretora' }],
      titularNaoEmissor: true,
      totalCoberto: 52_340,
      totalValor: 52_340,
      percentualUtilizado: 20.94,
      ativos: [
        ativo({
          id: 'e2e-n2',
          nome: 'CDB 110% CDI 2027',
          valorAtual: 52_340,
          valorInvestido: 50_000,
          corretoraNome: 'NuInvest Corretora',
          fonteInstituicao: 'emissor-nao-emissor',
          editarEmissorHref: '/ativos/e2e-n2/editar?editar=emissor',
        }),
      ],
    }),
    grupo({
      instituicaoId: 'desconhecida',
      instituicaoNome: 'Emissor não identificado',
      chave: 'desconhecida',
      corretoras: [],
      ativosSemEmissor: 1,
      temOpenFinance: true,
      totalCoberto: 32_150,
      totalValor: 32_150,
      percentualUtilizado: 12.86,
      ativos: [
        ativo({
          id: 'e2e-arbi',
          nome: 'CDB ARBI 2028',
          valorAtual: 32_150,
          valorInvestido: 30_000,
          corretoraNome: null,
          fonteInstituicao: 'desconhecida',
          origem: 'openFinance',
          emissorInformadoTexto: 'ARBI',
          editarEmissorHref: '/ativos/e2e-arbi/editar?editar=emissor',
        }),
      ],
    }),
  ],
  avisosConglomerado: [
    {
      conglomerado: 'C0080109',
      chaves: ['58160789', '03017677'],
      nomes: ['Banco Safra', 'Banco J. Safra'],
    },
  ],
  semCobertura: {
    classes: [],
    total: 0,
    totalSemProtecao: 60_730,
    totalInvestimentos: 901_370,
    percentualSemProtecao: 6.74,
  },
};

const COM_LINK = ['e2e-fb-1', 'e2e-n2', 'e2e-arbi'];

async function prepare(page: Page, scheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: scheme });
  await page.addInitScript((theme) => {
    const style = document.createElement('style');
    style.textContent =
      '.tsqd-parent-container, .tsqd-open-btn-container { display: none !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
      localStorage.setItem('theme', theme);
    } catch {
      // sem storage: segue com o tema do sistema
    }
  }, scheme);
  await page.route('**/api/analises/cobertura-fgc', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) }),
  );
}

async function abrirCobertura(page: Page) {
  await page.goto('/carteira', { waitUntil: 'domcontentloaded' });
  await waitCarteiraReady(page);
  await openCarteiraTab(page, 'Análise');
  await openCarteiraTab(page, 'Cobertura FGC');
  await expect(page.getByRole('heading', { name: 'Cobertura por banco emissor' })).toBeVisible({
    timeout: 30_000,
  });
}

async function abrirTodosOsGrupos(page: Page) {
  const heads = page.locator('[data-fgc-grupo] > button[aria-expanded]');
  const n = await heads.count();
  for (let i = 0; i < n; i += 1) {
    const h = heads.nth(i);
    if ((await h.getAttribute('aria-expanded')) === 'false') await h.click();
  }
  await waitForIdle(page, { settleMs: 300 });
}

async function semRolagemLateral(page: Page, width: number) {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw, `documento com ${sw}px`).toBeLessThanOrEqual(width);
}

async function conferir(page: Page, width: number) {
  const bxp = page.locator('[data-fgc-grupo="33264668"]');
  await expect(bxp.locator('[data-fgc-via]')).toHaveText(
    'CNPJ 33.264.668 · via BTG Pactual e XP Investimentos',
  );
  await expect(bxp).toContainText('somando 2 títulos de 2 corretoras');

  await expect(
    page.locator('[data-fgc-grupo="30306294"] [data-fgc-pill="usando-corretora"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-fgc-grupo="62169875"] [data-fgc-pill="confira-emissor"]'),
  ).toBeVisible();
  const unk = page.locator('[data-fgc-grupo="desconhecida"]');
  await expect(unk.locator('[data-fgc-pill="emissor-a-confirmar"]')).toBeVisible();
  await expect(unk.locator('[data-fgc-pill="open-finance"]')).toBeVisible();
  await expect(page.locator('[data-fgc-aviso-conglomerado]')).toContainText(
    'Banco Safra e Banco J. Safra são do mesmo grupo financeiro',
  );
  await expect(page.locator('[data-fgc-pill="conglomerado"]')).toHaveCount(2);

  await abrirTodosOsGrupos(page);
  await expect(unk).toContainText('O Open Finance informou “ARBI”.');

  const links = page.locator('a[data-fgc-informar-emissor]');
  await expect(links).toHaveCount(COM_LINK.length);
  const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs.sort()).toEqual(COM_LINK.map((id) => `/ativos/${id}/editar?editar=emissor`).sort());

  const alvos = page.locator('a[data-fgc-informar-emissor], button[data-fgc-abrir-grupo]');
  const alturas = await alvos.evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().height)),
  );
  expect(alturas.length).toBeGreaterThan(0);
  for (const h of alturas)
    expect(h, 'alvo "Informar emissor" com menos de 44px').toBeGreaterThanOrEqual(44);

  await semRolagemLateral(page, width);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`1280 (${scheme})`, () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test(`grupos por emissor, pills e "Informar emissor" @1280 ${scheme}`, async ({ page }) => {
      test.setTimeout(180_000);
      await prepare(page, scheme);
      await abrirCobertura(page);
      await conferir(page, 1280);
      // Coluna "Via" na tabela; Open Finance sem corretora mostra "—".
      await expect(page.locator('th', { hasText: 'Via' }).first()).toBeVisible();
      if (!process.env.CI) {
        await page.screenshot({
          path: test.info().outputPath(`fgc-emissor-1280-${scheme}.png`),
          fullPage: true,
        });
      }
    });
  });

  test.describe(`390 (${scheme})`, () => {
    test.use({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    test(`grupos por emissor, pills e "Informar emissor" @390 ${scheme}`, async ({ page }) => {
      test.setTimeout(180_000);
      await prepare(page, scheme);
      await abrirCobertura(page);
      await conferir(page, 390);
      if (!process.env.CI) {
        await page.screenshot({
          path: test.info().outputPath(`fgc-emissor-390-${scheme}.png`),
          fullPage: true,
        });
      }
    });
  });
}

test('o link leva à edição do ativo com ?editar=emissor', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await prepare(page, 'light');
  await abrirCobertura(page);
  await page.locator('[data-fgc-grupo="30306294"] > button[aria-expanded]').click();
  const link = page.locator('a[data-fgc-informar-emissor][href*="e2e-fb-1"]');
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/ativos\/e2e-fb-1\/editar\?editar=emissor$/);
});
