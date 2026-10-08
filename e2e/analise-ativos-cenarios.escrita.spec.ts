import { test, expect, type Locator, type Page } from '@playwright/test';
import { csrfHeaders, writesAllowed } from './helpers/api';
import { exigirRecursoBlocoD } from './fixtures/analise-bloco-d';

/**
 * Análise de Ativos — Bloco D, fatia B: Valuation · Meus cenários. GRAVA (projeto `escrita`,
 * desktop 1280) e DESFAZ: o cenário salvo é apagado pelo "Restaurar" (e de novo no `finally`, pela
 * API); o objetivo criado no Planejamento é apagado pela API.
 *
 * - yield 4% → Salvar → recarregar ⇒ 4% → Restaurar (sem confirmação) ⇒ 6% e registro apagado;
 * - slider da margem por teclado (passos de 5); "vs. cotação" com cor neutra;
 * - DOM do card sem palavras proibidas fora do rodapé literal;
 * - MXRF11: "Criar objetivo no Planejamento" ⇒ o objetivo aparece no Planejamento.
 *
 * Só com E2E_ALLOW_WRITES=1 e com config.recursos.cenarios (ANALISE_ATIVOS_CENARIOS_HABILITADO).
 */

test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
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
      // sem storage
    }
  });
});

async function abrirCenarios(page: Page, ticker: string): Promise<Locator> {
  await page.goto(`/analise-ativos/${ticker}`, { waitUntil: 'load' });
  const card = page.locator(`section[aria-labelledby="valuation-${ticker}"]`);
  // o card fica numa SecaoPreguicosa (monta perto do viewport): rola até o marcador da seção
  const marcador = page.locator('[aria-label^="Valuation"]').first();
  await marcador.waitFor({ state: 'attached', timeout: 90_000 });
  await marcador.scrollIntoViewIfNeeded();
  await card.waitFor({ timeout: 90_000 });
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: 'Meus cenários', exact: true }).click();
  await expect(card.locator('[data-meus-cenarios]')).toBeVisible({ timeout: 90_000 });
  return card;
}

async function apagarCenario(page: Page, ticker: string) {
  await page.request.delete(`/api/analise-ativos/cenarios/${ticker}`, {
    headers: await csrfHeaders(page),
  });
}

const PROIBIDAS = [
  /\bbarat[oa]s?\b/i,
  /\bcar[oa]s?\b/i,
  /preço justo/i,
  /preço-alvo/i,
  /recomend/i,
  /\bnotas?\b/i,
  /\bmelhor\b/i,
  /\bpior\b/i,
  /margem de segurança/i,
];

test.describe('Meus cenários grava e desfaz', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');

  test('WEGE3: salvar, recarregar, restaurar sem confirmação', async ({ page }) => {
    await page.goto('/analise-ativos', { waitUntil: 'load' });
    await exigirRecursoBlocoD(page, 'cenarios');
    await apagarCenario(page, 'WEGE3');
    try {
      let card = await abrirCenarios(page, 'WEGE3');
      const barra = card.locator('[data-barra-salvamento]');
      await expect(barra).toHaveAttribute('data-barra-salvamento', 'padrao');
      const yieldCampo = () => card.getByLabel('Yield desejado (Bazin)', { exact: true });
      await expect(yieldCampo()).toHaveValue('6,0');
      await yieldCampo().fill('4');
      await expect(barra).toHaveAttribute('data-barra-salvamento', 'naoSalvo');
      await card.locator('[data-cenario-salvar]').click();
      await expect(barra).toHaveAttribute('data-barra-salvamento', 'salvo', { timeout: 30_000 });

      card = await abrirCenarios(page, 'WEGE3');
      await expect(yieldCampo()).toHaveValue('4,0');
      await expect(card.locator('[data-barra-salvamento]')).toHaveAttribute(
        'data-barra-salvamento',
        'salvo',
      );

      await card.locator('[data-cenario-restaurar]').click();
      await expect(page.locator('[data-toast-cenarios]')).toContainText('Desfazer');
      await expect(yieldCampo()).toHaveValue('6,0');
      await expect
        .poll(
          async () =>
            (await (await page.request.get('/api/analise-ativos/cenarios/WEGE3')).json()).salvo,
        )
        .toBeNull();
    } finally {
      await apagarCenario(page, 'WEGE3');
    }
  });

  test('slider por teclado, vs. cotação neutro e sem palavras proibidas', async ({ page }) => {
    await page.goto('/analise-ativos', { waitUntil: 'load' });
    await exigirRecursoBlocoD(page, 'cenarios');
    const card = await abrirCenarios(page, 'WEGE3');
    const slider = card.locator('[data-slider-margem]');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('25');
    await expect(slider).toHaveAttribute('aria-valuetext', '25%');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveValue('15');

    const cor = await card
      .locator('[data-vs-cotacao]')
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    const [r, g, b] = (cor.match(/\d+/g) ?? []).map(Number);
    // cinza/azul-acinzentado neutro: nunca vermelho nem verde dominantes
    expect(r - Math.min(g, b)).toBeLessThan(40);
    expect(g - Math.max(r, b)).toBeLessThan(20);

    const texto = await card.evaluate((el) => {
      const c = el.cloneNode(true) as HTMLElement;
      c.querySelector('[data-rodape-cenarios]')?.remove();
      return c.innerText;
    });
    for (const re of PROIBIDAS) expect(texto, String(re)).not.toMatch(re);
    await expect(card.locator('[data-rodape-cenarios]')).toContainText(
      "O My Finance não calcula 'preço justo' nem preço-alvo",
    );
  });

  test('MXRF11: criar objetivo no Planejamento a partir da Meta de renda', async ({ page }) => {
    await page.goto('/analise-ativos', { waitUntil: 'load' });
    await exigirRecursoBlocoD(page, 'cenarios');
    const antes = await page.request.get('/api/planejamento-sonhos');
    const ids = new Set(
      ((await antes.json()) as { objetivos: Array<{ id: string }> }).objetivos.map((o) => o.id),
    );
    const criados: string[] = [];
    try {
      const card = await abrirCenarios(page, 'MXRF11');
      await card.getByLabel('Renda mensal desejada', { exact: true }).fill('1234');
      const botao = card.locator('[data-criar-objetivo]');
      test.skip((await botao.count()) === 0, 'posição do demo já cobre a meta');
      await botao.click();
      const dialogo = page.getByRole('dialog');
      await expect(dialogo).toContainText('O objetivo também aparece no seu Fluxo de Caixa.');
      await dialogo.locator('[data-objetivo-confirmar]').click();
      await expect(page.locator('[data-toast-cenarios]')).toContainText(
        'Objetivo criado no Planejamento.',
      );
      const depois = await page.request.get('/api/planejamento-sonhos');
      const novos = (
        (await depois.json()) as {
          objetivos: Array<{ id: string; name: string; target: number; months: number }>;
        }
      ).objetivos.filter((o) => !ids.has(o.id));
      criados.push(...novos.map((o) => o.id));
      expect(novos).toHaveLength(1);
      expect(novos[0].name).toBe('Renda de R$ 1.234/mês com MXRF11');
      expect(novos[0].target).toBeGreaterThan(0);
      expect(novos[0].months).toBe(60);
    } finally {
      const headers = await csrfHeaders(page);
      for (const id of criados) {
        await page.request.delete(`/api/planejamento-sonhos/${id}`, { headers });
      }
    }
  });
});
