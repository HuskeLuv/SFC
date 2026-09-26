import { test, expect, type Page } from '@playwright/test';
import {
  AUTH_STATIC_ROUTES,
  DYNAMIC_ROUTES,
  FLAGGED_ROUTES,
  PUBLIC_ROUTES,
} from './helpers/routes';
import { waitForContent } from './helpers/waitForContent';
import { expectFitsWithoutClip } from './helpers/mobileFit';

/**
 * Transbordo horizontal a 390px (projeto `mobile`: isMobile + hasTouch).
 *
 * ATENÇÃO: com isMobile o Chromium estica a viewport de LAYOUT até caber o conteúdo — um
 * `window.innerWidth` vira 482 numa página de 482px. Por isso a comparação é SEMPRE com a largura
 * FIXA do viewport configurado (390), nunca com innerWidth.
 *
 * KNOWN_OVERFLOW: rotas que transbordam hoje, com a largura medida e a fase que conserta.
 * Cada uma roda com `test.fail` — quando o conserto chegar, o "passou inesperadamente" obriga a
 * tirar a rota da lista. Qualquer rota fora da lista que transborde derruba a suíte.
 */
// Vazia desde a fase 0 (set/2026): /carteira, /calendario e /historico-alteracoes foram
// consertadas porque o transbordo tirava a barra de abas da tela.
const KNOWN_OVERFLOW: Record<string, string> = {};

interface Measure {
  sw: number;
  cw: number;
  bw: number;
  /** scrollWidth do contêiner do conteúdo da casca, que corta o transbordo abaixo de lg. */
  ct: number;
}

const measure = (page: Page): Promise<Measure> =>
  page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    bw: document.body.scrollWidth,
    ct: document.querySelector('[data-mf-content]')?.scrollWidth ?? 0,
  }));

/**
 * Até 10 culpados: elementos com right > W+1 que não têm filho também passando (o mais fundo),
 * ignorando o que está dentro de um contêiner com rolagem/corte horizontal próprio.
 */
const findOffenders = (page: Page, W: number) =>
  page.evaluate((limit) => {
    const overflows = (el: Element) => el.getBoundingClientRect().right > limit + 1;
    const clippedByAncestor = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        // o corte de segurança da casca não conta: o que ele esconde ainda é transbordo
        if (p.hasAttribute('data-mf-content')) continue;
        const ox = getComputedStyle(p).overflowX;
        if (ox !== 'visible') return true;
      }
      return false;
    };
    // `fixed`: elemento fixo (ex.: banner de cookies) — costuma ser CONSEQUÊNCIA (a viewport de
    // layout esticou), não a causa.
    const out: { tag: string; className: string; width: number; right: number; fixed: boolean }[] =
      [];
    const inFixed = (el: Element) => {
      for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).position === 'fixed') return true;
      }
      return false;
    };
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (out.length >= 10) break;
      if (!overflows(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (Array.from(el.children).some(overflows)) continue;
      if (clippedByAncestor(el)) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        className: String((el as HTMLElement).className ?? '').slice(0, 200),
        width: Math.round(rect.width),
        right: Math.round(rect.right),
        fixed: inFixed(el),
      });
    }
    return out;
  }, W);

const overflowsViewport = (m: Measure, page: Page) =>
  Math.max(m.sw, m.bw, m.ct) > page.viewportSize()!.width;

async function expectNoHorizontalOverflow(page: Page, route: string) {
  const W = page.viewportSize()!.width; // 390 — largura FIXA, nunca innerWidth
  const m = await measure(page);
  const widest = Math.max(m.sw, m.bw, m.ct);

  if (widest > W || m.cw > W) {
    const offenders = await findOffenders(page, W);
    await test.info().attach(`transbordo ${route}`, {
      body: JSON.stringify({ viewport: W, ...m, offenders }, null, 2),
      contentType: 'application/json',
    });
  }

  expect(widest, `${route}: conteúdo com ${widest}px numa tela de ${W}px`).toBeLessThanOrEqual(W);
  expect(m.cw, `${route}: clientWidth ${m.cw}px > ${W}px`).toBeLessThanOrEqual(W);
}

test.describe('Mobile 390px: sem transbordo horizontal (autenticado)', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const route of AUTH_STATIC_ROUTES) {
    test(`${route}`, async ({ page }) => {
      test.fail(route in KNOWN_OVERFLOW, KNOWN_OVERFLOW[route]);
      await waitForContent(page, route);
      await expectNoHorizontalOverflow(page, route);
      // PWA fase 1: na /carteira mede também com o corte da casca desligado (um conteúdo largo
      // demais seria escondido pelo overflow-x: clip do [data-mf-content]).
      if (route === '/carteira') await expectFitsWithoutClip(page, route, { width: 390 });
    });
  }

  for (const route of FLAGGED_ROUTES) {
    test(`${route} (atrás de flag)`, async ({ page }) => {
      // A /comunidade responde 200 com a flag desligada (página client); a flag vem da API.
      if (route === '/comunidade') {
        const cfg = await page.request.get('/api/comunidade/config');
        const habilitada = cfg.ok() && ((await cfg.json()) as { habilitada?: boolean }).habilitada;
        test.skip(!habilitada, 'flag desligada: COMUNIDADE_HABILITADA');
      }
      const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
      const landed = new URL(page.url()).pathname;
      test.skip(
        !res || res.status() !== 200 || landed !== route,
        `flag desligada: status ${res?.status()} em ${landed}`,
      );
      test.fail(route in KNOWN_OVERFLOW, KNOWN_OVERFLOW[route]);
      await waitForContent(page, route);
      await expectNoHorizontalOverflow(page, route);
    });
  }

  for (const dyn of DYNAMIC_ROUTES) {
    test(`${dyn.name} (dinâmica)`, async ({ page }) => {
      // Duas páginas lentas em sequência (origem + destino) e, na carteira, cliques em abas.
      test.setTimeout(240_000);
      await waitForContent(page, dyn.from, { settleMs: 0 });
      const link = page.locator(dyn.linkSelector).first();
      const findHref = (timeout: number) =>
        link.getAttribute('href', { timeout }).catch(() => null);
      let href = await findHref(5_000);
      for (const name of dyn.reveal ?? []) {
        if (href) break;
        const btn = page.getByRole('button', { name, exact: true }).first();
        if ((await btn.count()) === 0) continue;
        await btn.click();
        href = await findHref(10_000);
      }
      if (!href) {
        test.info().annotations.push({
          type: 'sem link',
          description: `${dyn.from} não tem ${dyn.linkSelector} para o usuário demo`,
        });
        test.skip(true, `sem link ${dyn.linkSelector} em ${dyn.from}`);
        return;
      }
      const route = dyn.toRoute ? dyn.toRoute(href) : href;
      test.info().annotations.push({ type: 'rota', description: route });
      test.fail(dyn.name in KNOWN_OVERFLOW, KNOWN_OVERFLOW[dyn.name]);
      // Rota escolhida em runtime: se o destino não carregar (ex.: /ativos/{id} de um ativo que fica
      // em "Carregando detalhes do ativo…" no banco de dev), pula com anotação em vez de medir o
      // spinner ou derrubar a suíte por dado de ambiente.
      const loaded = await waitForContent(page, route, { readyTimeout: 90_000 }).then(
        () => true,
        (e: unknown) => {
          test.info().annotations.push({
            type: 'destino não carregou',
            description: `${route}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`,
          });
          return false;
        },
      );
      test.skip(!loaded, `${route} não carregou a tempo`);
      await expectNoHorizontalOverflow(page, route);
    });
  }

  // Prova negativa permanente: uma div de 500px TEM de reprovar a medição. Se a medição regredir
  // (ex.: voltar a comparar com innerWidth, que com isMobile estica junto), este teste falha.
  test('prova negativa: div de 500px injetada é detectada', async ({ page }) => {
    await waitForContent(page, '/profile', { settleMs: 0 });
    test.skip(overflowsViewport(await measure(page), page), '/profile já transborda sem a div');
    await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.id = 'mf-overflow-probe';
      probe.style.width = '500px';
      probe.style.height = '10px';
      document.body.appendChild(probe);
    });
    const error = await expectNoHorizontalOverflow(page, '/profile + div 500px').then(
      () => null,
      (e: unknown) => e,
    );
    expect(error, 'a div de 500px passou despercebida pela medição').not.toBeNull();
    expect(String((error as Error).message)).toMatch(/conteúdo com (\d+)px numa tela de 390px/);
  });
});

test.describe('Mobile 390px: sem transbordo horizontal (público)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 120_000 });

  for (const route of PUBLIC_ROUTES) {
    test(`${route}`, async ({ page }) => {
      test.fail(route in KNOWN_OVERFLOW, KNOWN_OVERFLOW[route]);
      await waitForContent(page, route);
      await expectNoHorizontalOverflow(page, route);
    });
  }
});
