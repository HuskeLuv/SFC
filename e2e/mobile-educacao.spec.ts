import { test, expect } from '@playwright/test';
import {
  expectFitsWithoutClip,
  expectMinTarget,
  gotoMobile,
  prepareMobilePage,
} from './helpers/mobileFit';

/**
 * PWA fase 3, fatia E: Educação no celular (projeto `mobile`, SÓ LEITURA).
 *
 * Nada é tocado no player (sem play) e nenhuma aula é marcada. Sem curso publicado (banco do CI
 * sem conteúdo), os testes da aula pulam com anotação.
 */

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

const READY = 'h1:has-text("Educação")';

for (const width of [390, 320]) {
  test(`Educação @ ${width}: cabe sem corte, módulos em lista`, async ({ page }) => {
    test.setTimeout(120_000);
    await gotoMobile(page, '/educacao', {
      width,
      height: width === 320 ? 640 : 844,
      readySelector: READY,
    });
    await expectFitsWithoutClip(page, `educacao-${width}`, { width });
    const modulos = page.locator('[data-mf-edu-modulos] a');
    if ((await modulos.count()) === 0) {
      test.info().annotations.push({ type: 'educacao', description: 'sem curso publicado' });
      return;
    }
    // Cartão de "continuar" todo clicável e módulos com alvo confortável.
    await expect(page.locator('[data-mf-edu-hero]').first()).toBeVisible();
    await expectMinTarget(modulos.first());
    if (!process.env.CI) {
      await page.screenshot({ path: test.info().outputPath(`educacao-${width}.png`) });
    }
  });

  test(`Aula @ ${width}: título inteiro, player de ponta a ponta e fixo, aulas de 44px+`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await gotoMobile(page, '/educacao', {
      width,
      height: width === 320 ? 640 : 844,
      readySelector: READY,
    });
    const href = await page
      .locator('[data-mf-edu-modulos] a')
      .first()
      .getAttribute('href', { timeout: 5_000 })
      .catch(() => null);
    test.skip(!href, 'sem curso publicado');
    await gotoMobile(page, href!, {
      width,
      height: width === 320 ? 640 : 844,
      readySelector: '[data-mf-edu-aulas]',
    });

    // h1 sem cortar com reticências (até 2 linhas).
    const h1 = page.locator('h1').first();
    const cortado = await h1.evaluate((el) => getComputedStyle(el).whiteSpace === 'nowrap');
    expect(cortado, 'h1 truncado no celular').toBe(false);

    const player = page.locator('[data-mf-edu-player]');
    if ((await player.count()) === 0) {
      test.info().annotations.push({ type: 'educacao', description: 'módulo sem aula' });
    } else {
      const box = await player.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.abs(box!.x)).toBeLessThan(1);
      expect(Math.abs(box!.width - width)).toBeLessThan(1);
      // Fixo sob o cabeçalho ao rolar.
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.waitForTimeout(300);
      const { top, headerH, scrollY } = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.height = 'var(--mf-header-h, 0px)';
        document.body.appendChild(probe);
        const h = probe.getBoundingClientRect().height;
        probe.remove();
        return {
          top: document.querySelector('[data-mf-edu-player]')!.getBoundingClientRect().top,
          headerH: h,
          scrollY: window.scrollY,
        };
      });
      if (scrollY >= 100) expect(Math.abs(top - headerH)).toBeLessThan(2);
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    const aulas = page.locator('[data-mf-edu-aulas] li button');
    const total = Math.min(await aulas.count(), 6);
    for (let i = 0; i < total; i++) {
      if (!(await aulas.nth(i).isVisible())) continue;
      await aulas.nth(i).scrollIntoViewIfNeeded();
      await expectMinTarget(aulas.nth(i));
    }
    await expectFitsWithoutClip(page, `educacao-aula-${width}`, { width });
    if (!process.env.CI) {
      await page.screenshot({ path: test.info().outputPath(`educacao-aula-${width}.png`) });
    }
  });
}
