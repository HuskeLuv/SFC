import { test, expect, type Page } from '@playwright/test';

/**
 * Relatório financeiro (/relatorios/financeiro, ticket 86e3yg90z) — SÓ LEITURA.
 *
 * Precisa de RELATORIO_FINANCEIRO_HABILITADO=true no servidor; o modo demonstração
 * (?fixture=exemplo) também de RELATORIO_PLANO_FORCADO_PERMITIDO=1 no build de produção (os dois
 * entram só no env do job e2e). Sem a chave, a página dá 404 e o arquivo inteiro pula.
 *
 * - dados reais do usuário demo em 1 e 12 meses, a 1280 e a 390 px, sem rolagem horizontal;
 * - PDF A4 (page.pdf): uma folha por .page/.cover (break-after: page), sem a barra do app;
 * - Basic pelo modo demonstração: HTML e JS baixados sem PGBL, dedução nem aporte;
 * - retratos de estrutura do modo demonstração (classes e contagens, sem texto).
 *
 * Não toca nas baselines da /relatorios de hoje.
 */

const ROTA = '/relatorios/financeiro';
const PRONTO = '.mf-rel section.cover h1';
const PROIBIDAS = /PGBL|dedu[cç]|aporte/i;
// Nos JS, a mesma regra de scripts/checar-chunks-relatorio.mjs: PGBL só em maiúsculas
// ('pgbl'/'irSimulacaoPgbl' são identificadores do queryKeys compartilhado) e os escapes
// \xNN/\uNNNN do minificador desfeitos antes ('dedu\xe7\xe3o').
const PROIBIDAS_JS = /PGBL|[Dd][Ee][Dd][Uu][CcÇç]|[Aa][Pp][Oo][Rr][Tt][Ee]/;
const semEscapes = (js: string) =>
  js.replace(/\\(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4}))/g, (_, x?: string, u?: string) =>
    String.fromCharCode(parseInt(x ?? u ?? '', 16)),
  );

async function abrir(page: Page, rota: string) {
  const res = await page.goto(rota, { waitUntil: 'domcontentloaded', timeout: 150_000 });
  return res;
}

async function esperarDocumento(page: Page) {
  await page.locator(PRONTO).waitFor({ timeout: 120_000 });
  await expect(page.locator('.mf-rel main.doc[aria-busy="true"]')).toHaveCount(0);
  // os corpos por next/dynamic montam logo depois
  await page.waitForTimeout(1_000);
}

async function semRolagemHorizontal(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw - cw).toBeLessThanOrEqual(0);
  const largura = page.viewportSize()!.width;
  const larguraDoc = await page.locator('.mf-rel').evaluate((el) => el.scrollWidth);
  expect(larguraDoc).toBeLessThanOrEqual(largura);
}

test.beforeAll(async ({ request }) => {
  const res = await request.get('/api/relatorios/financeiro/config');
  const habilitado = res.ok() && ((await res.json()) as { habilitado?: boolean }).habilitado;
  test.skip(!habilitado, 'RELATORIO_FINANCEIRO_HABILITADO desligada');
});

test.describe('dados reais do usuário demo', () => {
  for (const meses of [1, 12]) {
    for (const largura of [1280, 390]) {
      test(`${meses} ${meses === 1 ? 'mês' : 'meses'} a ${largura}px`, async ({ page }) => {
        test.setTimeout(180_000);
        await page.setViewportSize({ width: largura, height: 900 });
        const res = await abrir(page, `${ROTA}?meses=${meses}`);
        expect(res?.status()).toBe(200);
        await esperarDocumento(page);
        await expect(page.locator('.mf-rel section.cover')).toHaveCount(1);
        await expect(page.locator('.mf-rel section.page .sec-num').first()).toHaveText('1');
        const pressionado = page
          .getByRole('group', { name: 'Período' })
          .locator('[aria-pressed="true"]');
        await expect(pressionado).toHaveText(meses === 1 ? 'Mês atual' : '12 meses');
        await semRolagemHorizontal(page);
      });
    }
  }

  test('trocar o período atualiza a URL e o documento', async ({ page }) => {
    test.setTimeout(180_000);
    await abrir(page, ROTA);
    await esperarDocumento(page);
    await page
      .getByRole('group', { name: 'Período' })
      .getByRole('button', { name: '6 meses' })
      .click();
    await expect(page).toHaveURL(/meses=6/);
    await expect(page.locator('.mf-rel .ph span').first()).toContainText('6 meses');
  });

  test('PDF A4: uma folha por página do relatório, sem a barra do app', async ({ page }) => {
    test.setTimeout(180_000);
    await abrir(page, `${ROTA}?meses=12`);
    await esperarDocumento(page);
    await page.emulateMedia({ media: 'print' });
    const folhas = page.locator('.mf-rel section.cover, .mf-rel section.page');
    const n = await folhas.count();
    // Capa + as 9 seções (as 4 a 8 também, bloqueadas ou não).
    expect(n).toBeGreaterThanOrEqual(10);
    const quebras = await folhas.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).breakAfter),
    );
    expect(quebras.every((q) => q === 'page')).toBe(true);
    await expect(page.locator('.print-hidden').first()).toBeHidden();
    await expect(page.locator('aside').first()).toBeHidden();
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    // Cada folha do relatório começa numa página nova (seções longas podem ocupar mais de uma).
    expect(paginas).toBeGreaterThanOrEqual(n);
  });
});

test.describe('modo demonstração (exemplo do Pedro)', () => {
  test.beforeEach(async ({ page }) => {
    const res = await abrir(page, `${ROTA}?fixture=exemplo&plano=basic&meses=1`);
    const demo = await page
      .getByText('Modo demonstração · dados de exemplo')
      .waitFor({ timeout: 120_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!demo || res?.status() !== 200, 'modo demonstração indisponível neste build');
  });

  test('Basic: HTML e JS baixados sem PGBL, dedução nem aporte', async ({ page }) => {
    test.setTimeout(180_000);
    const scripts: Promise<string>[] = [];
    page.on('response', (r) => {
      if (/\.js(\?|$)/.test(r.url()) && r.url().includes('/_next/')) {
        scripts.push(r.text().catch(() => ''));
      }
    });
    const res = await abrir(page, `${ROTA}?fixture=exemplo&plano=basic&meses=12`);
    const html = (await res?.text()) ?? '';
    await esperarDocumento(page);
    expect(html).not.toMatch(PROIBIDAS);
    expect(await page.locator('.mf-rel').innerHTML()).not.toMatch(PROIBIDAS);
    const corpos = await Promise.all(scripts);
    expect(corpos.length).toBeGreaterThan(0);
    const achados = corpos
      .map((c, i) => [i, semEscapes(c).match(PROIBIDAS_JS)?.[0]] as const)
      .filter(([, m]) => m);
    expect(achados).toEqual([]);
  });

  // Só as folhas da casca (capa e seções 1, 2, 3 e 9) e planos sem os corpos Advanced: o
  // retrato não muda quando as seções 4–8 e os componentes adv/ ganham corpo.
  for (const [plano, meses] of [
    ['basic', 1],
    ['pro', 6],
    ['basic', 12],
  ] as const) {
    test(`estrutura ${plano} · ${meses} ${meses === 1 ? 'mês' : 'meses'}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: 1280, height: 900 });
      await abrir(page, `${ROTA}?fixture=exemplo&plano=${plano}&meses=${meses}`);
      await esperarDocumento(page);
      const estrutura = await page.locator('.mf-rel main.doc').evaluate((doc) => {
        const assinatura = (el: Element): string => {
          const cls = [...el.classList].sort().join('.');
          return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
        };
        return [...doc.children]
          .filter((folha) =>
            ['capa', '1', '2', '3', '9'].includes(
              folha.querySelector('.sec-num')?.textContent ?? 'capa',
            ),
          )
          .map((folha) => ({
            folha: assinatura(folha),
            secao: folha.querySelector('.sec-num')?.textContent ?? 'capa',
            filhos: [...folha.children].map(assinatura),
            kpis: folha.querySelectorAll('.kpi').length,
            kpisBloqueados: folha.querySelectorAll('.kpi.lockt').length,
            linhas: folha.querySelectorAll('tbody tr').length,
            barras: folha.querySelectorAll('.hb-row').length,
            graficos: folha.querySelectorAll('svg[role="img"]').length,
            cadeados: folha.querySelectorAll('.locked, .toc .lk').length,
            destaques: folha.querySelectorAll('.insights li').length,
          }));
      });
      expect(JSON.stringify(estrutura, null, 1)).toMatchSnapshot(
        `relatorio-financeiro-${plano}-${meses}.structure.json`,
      );
    });
  }
});
