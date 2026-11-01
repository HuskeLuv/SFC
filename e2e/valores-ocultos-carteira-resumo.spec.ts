import { test, expect, type Page } from '@playwright/test';
import {
  ROTA_PREFERENCIA_VALORES_OCULTOS,
  coletarValoresExpostos,
  expectNumerosAusentes,
  olhoValores,
} from './helpers/valoresOcultos';

/**
 * Esconder valores — Carteira › Resumo consolidado (fatia 2, a tela do print do Pedro): hero,
 * Histórico de patrimônio, Tipos de investimento, Alocação e Mercado hoje. Exige o app com
 * VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura: a preferência é um cookie do
 * contexto do navegador (cada teste começa com o olho aberto).
 *
 * Roda no projeto `chromium` nas duas larguras: 1280 e 390 com isMobile.
 */

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
      // sem storage: o aviso aparece e o teste falha de forma visível
    }
  });
});

const VARIANTES = [
  { nome: 'computador 1280', use: { viewport: { width: 1280, height: 800 } } },
  {
    nome: 'celular 390',
    use: {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    },
  },
] as const;

const grafico = (page: Page) => page.locator('#chartPatrimonio');

async function alternarOlho(page: Page, ocultos: boolean) {
  const resposta = page.waitForResponse(
    (r) => r.url().includes(ROTA_PREFERENCIA_VALORES_OCULTOS) && r.request().method() === 'POST',
  );
  await olhoValores(page).click();
  expect((await resposta).status()).toBe(200);
  if (ocultos) await expect(page.locator('html')).toHaveAttribute('data-valores-ocultos', '');
  else await expect(page.locator('html')).not.toHaveAttribute('data-valores-ocultos');
}

/** Passa o ponteiro no meio do gráfico até o tooltip do Apex aparecer. */
async function abrirTooltip(page: Page, toque: boolean) {
  await grafico(page).scrollIntoViewIfNeeded();
  const caixa = (await grafico(page).locator('.apexcharts-svg').boundingBox())!;
  const tooltip = grafico(page).locator('.apexcharts-tooltip');
  await expect(async () => {
    await page.mouse.move(caixa.x + caixa.width * 0.6, caixa.y + caixa.height * 0.5);
    await page.mouse.move(caixa.x + caixa.width * 0.62, caixa.y + caixa.height * 0.55);
    if (toque) {
      // Celular: o Apex abre o tooltip no arrastar do dedo (touchstart + touchmove).
      const cdp = await page.context().newCDPSession(page);
      const ponto = (f: number) => [
        { x: caixa.x + caixa.width * f, y: caixa.y + caixa.height / 2 },
      ];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: ponto(0.5) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: ponto(0.6) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: ponto(0.62) });
    }
    await expect(tooltip).toHaveClass(/apexcharts-active/, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  return tooltip;
}

for (const variante of VARIANTES) {
  test.describe(`esconder valores — Carteira › Resumo (${variante.nome})`, () => {
    test.use(variante.use);

    test('olho fechado: hero, gráficos e alocação sem valores; Mercado hoje visível', async ({
      page,
    }) => {
      test.setTimeout(150_000);
      await page.goto('/carteira', { waitUntil: 'domcontentloaded' });
      await expect(grafico(page).locator('.apexcharts-svg')).toBeVisible({ timeout: 90_000 });
      await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
      // Mercado hoje carregado (o dólar em R$).
      await expect(page.getByText(/R\$\s?\d/).first()).toBeVisible();

      // Olho aberto: lê os valores da tela (o "sentinela" do e2e — dados fixos do seed).
      const valores = await coletarValoresExpostos(page);
      expect(valores.length).toBeGreaterThan(3);
      const numeros = valores
        .map((v) => v.replace(/^.*?(?:R\$|US\$)\s?-?/, '').trim())
        .filter((n) => /[1-9]/.test(n) && n.length >= 4);
      expect(numeros.length).toBeGreaterThan(0);
      const rotulosEixo = grafico(page).locator('.apexcharts-yaxis-label');
      await expect(rotulosEixo.first()).toHaveText(/R\$/);
      const alturaAntes = (await grafico(page).boundingBox())!.height;
      const areaAntes = (await grafico(page).locator('.apexcharts-grid').boundingBox())!;

      // Período 1A: tem de continuar selecionado depois de alternar.
      const periodo1A = page.getByRole('button', { name: '1A', exact: true });
      await periodo1A.click();
      await expect(periodo1A).toHaveAttribute('aria-pressed', 'true');

      // Marca na janela: alternar não pode recarregar a página.
      await page.evaluate(() => {
        (window as unknown as { __mfSemReload?: boolean }).__mfSemReload = true;
      });

      await alternarOlho(page, true);

      // Nenhum R$ nem os números lidos antes (inclusive rótulos do eixo e rosca).
      await expect.poll(() => coletarValoresExpostos(page)).toEqual([]);
      await expectNumerosAusentes(page, numeros);
      await expect(page.locator('[data-mf-content] .mf-sensivel').first()).toBeVisible();
      // Eixo Y sem rótulo (largura reservada), altura do gráfico igual, período mantido.
      for (const texto of await rotulosEixo.allTextContents()) expect(texto.trim()).toBe('');
      expect((await grafico(page).boundingBox())!.height).toBe(alturaAntes);
      // Sem pulo: a área das séries fica no mesmo lugar (o eixo vazio reserva a largura de hoje).
      await expect(async () => {
        const area = (await grafico(page).locator('.apexcharts-grid').boundingBox())!;
        expect(Math.abs(area.x - areaAntes.x)).toBeLessThanOrEqual(2);
        expect(Math.abs(area.height - areaAntes.height)).toBeLessThanOrEqual(2);
      }).toPass({ timeout: 10_000 });
      await expect(periodo1A).toHaveAttribute('aria-pressed', 'true');
      await expect(grafico(page).locator('.apexcharts-series path').first()).toBeVisible();

      // Tooltip com o mês e pílulas no lugar dos R$.
      const tooltip = await abrirTooltip(page, 'isMobile' in variante.use);
      await expect(tooltip.locator('.mf-pilula-grafico').first()).toBeAttached();
      expect(await tooltip.textContent()).not.toMatch(/R\$|US\$/);
      await expect.poll(() => coletarValoresExpostos(page)).toEqual([]);

      // Mercado hoje continua com R$ (exceção explícita).
      await expect(
        page
          .locator('[data-mf-valor-visivel]')
          .filter({ hasText: /R\$\s?\d/ })
          .first(),
      ).toBeVisible();

      // Desligar mostra de novo, sem recarregar.
      await alternarOlho(page, false);
      await expect(rotulosEixo.first()).toHaveText(/R\$/);
      await expect(page.locator('[data-mf-content] .mf-sensivel')).toHaveCount(0);
      expect(await coletarValoresExpostos(page)).toEqual(expect.arrayContaining([valores[0]]));
      await expect(periodo1A).toHaveAttribute('aria-pressed', 'true');
      expect(
        await page.evaluate(() => (window as unknown as { __mfSemReload?: boolean }).__mfSemReload),
      ).toBe(true);
    });
  });
}
