import { test, expect, type Page } from '@playwright/test';
import {
  COOKIE_VALORES_OCULTOS,
  ROTA_PREFERENCIA_VALORES_OCULTOS,
  olhoValores,
} from './helpers/valoresOcultos';

/**
 * Esconder valores — casca (fatia 0): olho e preferência por aparelho (a faixa das telas não
 * cobertas saiu no fechamento da Fase 6: o olho vale no app logado inteiro). Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura no banco:
 * a preferência é um cookie do contexto do navegador (cada teste começa sem ele).
 *
 * Roda no projeto `chromium` nas duas larguras: 1280 (olho no rodapé da sidebar) e 390 com
 * isMobile (olho no MobileHeader, antes do sino).
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

const html = (page: Page) => page.locator('html');

async function alternarEsperandoPost(page: Page, ocultos: boolean) {
  // O anúncio (portal) só existe depois que o provider montou: o clique antes da hidratação não
  // faz nada.
  await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
  const resposta = page.waitForResponse(
    (r) => r.url().includes(ROTA_PREFERENCIA_VALORES_OCULTOS) && r.request().method() === 'POST',
  );
  await olhoValores(page).click();
  const res = await resposta;
  expect(res.status()).toBe(200);
  // (o corpo da resposta não é lido: no Chromium o res.json() às vezes não resolve com o dev
  // server ocupado; confere-se o que foi enviado e os headers.)
  expect(res.request().postDataJSON()).toEqual({ ocultos });
  return res;
}

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

for (const variante of VARIANTES) {
  test.describe(`esconder valores — casca (${variante.nome})`, () => {
    test.use(variante.use);

    test('liga pelo servidor, sai no SSR, persiste, vale em outra tela e desliga', async ({
      page,
      context,
    }) => {
      test.setTimeout(120_000);
      await page.goto('/carteira', { waitUntil: 'domcontentloaded' });
      const olho = olhoValores(page);
      await expect(olho).toBeVisible({ timeout: 60_000 });
      await expect(olho).toHaveAttribute('aria-pressed', 'false');
      await expect(html(page)).not.toHaveAttribute('data-valores-ocultos');
      const box = await olho.boundingBox();
      expect(box?.width).toBe(44);
      expect(box?.height).toBe(44);

      // Liga: atributo na hora e cookie de 1 ano gravado pela RESPOSTA do servidor.
      const res = await alternarEsperandoPost(page, true);
      expect((await res.headerValue('set-cookie'))?.toLowerCase()).toContain('max-age=31536000');
      await expect(olho).toHaveAttribute('aria-pressed', 'true');
      await expect(html(page)).toHaveAttribute('data-valores-ocultos', '');
      expect((await context.cookies()).find((c) => c.name === COOKIE_VALORES_OCULTOS)?.value).toBe(
        '1',
      );

      // Anti-flash: o HTML do servidor já sai com o atributo.
      const ssr = await (await page.request.get('/carteira')).text();
      expect(ssr).toMatch(/<html[^>]*data-valores-ocultos/);

      // Recarregar mantém.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(olhoValores(page)).toHaveAttribute('aria-pressed', 'true', { timeout: 60_000 });

      // Outra tela (antes "não coberta"): o olho continua fechado.
      await page.goto('/educacao', { waitUntil: 'domcontentloaded' });
      await expect(olhoValores(page)).toHaveAttribute('aria-pressed', 'true', { timeout: 60_000 });

      // Desliga: atributo e cookie somem.
      await alternarEsperandoPost(page, false);
      await expect(html(page)).not.toHaveAttribute('data-valores-ocultos');
      const cookie = (await context.cookies()).find((c) => c.name === COOKIE_VALORES_OCULTOS);
      expect(cookie?.value ?? '').toBe('');
    });
  });
}
