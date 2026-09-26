import { test, expect, type Page } from '@playwright/test';
import {
  expectFitsWithoutClip,
  openCarteiraTab,
  waitCarteiraReady,
  waitForIdle,
} from './helpers/mobileFit';

/**
 * PWA fase 1 — fatia C: Renda Fixa, Imóveis & Bens, as duas Reservas e a Análise inteira no
 * celular. Projeto `mobile` (390px, isMobile). Mede a 390 e a 320: nada pode rolar na horizontal
 * fora de `[data-mf-scroll-x]` (trilhos de chips).
 *
 * Roda contra o banco do seed no CI: nada aqui depende da carteira do usuário demo do dev — a
 * abertura de um cartão da Renda Fixa só acontece se houver título; sem título, fica anotado.
 * Nenhuma edição é salva (o sheet é aberto e fechado).
 */

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

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
      // sem storage: o aviso aparece por cima, mas não muda a largura
    }
  });
});

const ABAS_CARTEIRA = [
  'Renda Fixa',
  'Imóveis & Bens',
  'Reserva Emergência',
  'Reserva Oportunidade',
] as const;

const SUB_ABAS_ANALISE = [
  'Rentabilidade Geral',
  'Proventos',
  'Risco x Retorno',
  'Cobertura FGC',
  'Imposto de Renda',
] as const;

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();

async function screenshotLocal(page: Page, name: string) {
  if (process.env.CI) return;
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}

async function abrirCarteira(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/carteira', { waitUntil: 'domcontentloaded' });
  await waitCarteiraReady(page);
}

for (const width of [390, 320] as const) {
  test.describe(`${width}px`, () => {
    test(`abas Renda Fixa, Imóveis e Reservas cabem sem rolagem lateral (${width}px)`, async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await abrirCarteira(page, width);
      for (const aba of ABAS_CARTEIRA) {
        await openCarteiraTab(page, aba);
        await expectFitsWithoutClip(page, `${aba} @${width}`, { width });
        await screenshotLocal(page, `${slug(aba)}-${width}`);
      }
    });

    test(`Análise e todas as sub-abas cabem sem rolagem lateral (${width}px)`, async ({ page }) => {
      test.setTimeout(420_000);
      await abrirCarteira(page, width);
      await openCarteiraTab(page, 'Análise');
      for (const sub of SUB_ABAS_ANALISE) {
        await openCarteiraTab(page, sub);
        await expectFitsWithoutClip(page, `Análise/${sub} @${width}`, { width });
        await screenshotLocal(page, `analise-${slug(sub)}-${width}`);

        if (sub === 'Proventos') {
          await openCarteiraTab(page, 'Agenda');
          await expectFitsWithoutClip(page, `Proventos/Agenda @${width}`, { width });
          await openCarteiraTab(page, 'Consolidado');
        }
        if (sub === 'Imposto de Renda') {
          for (const ir of ['Mensal — RV BR', 'Stocks US', 'Cripto', 'Come-cotas']) {
            await openCarteiraTab(page, ir);
            await expectFitsWithoutClip(page, `IR/${ir} @${width}`, { width });
          }
        }
      }
    });
  });
}

test('Renda Fixa: cartão abre e mostra o detalhe; sheet de edição abre e fecha sem salvar', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await abrirCarteira(page, 390);
  await openCarteiraTab(page, 'Renda Fixa');

  const card = page.locator('[data-mf-card] [data-mf-card-toggle]').first();
  if ((await card.count()) === 0) {
    test.info().annotations.push({
      type: 'sem dados',
      description: 'Nenhum título de renda fixa na carteira deste banco — cartão não testado.',
    });
    return;
  }
  await expect(card).toHaveAttribute('aria-expanded', 'false');
  await card.click();
  await expect(card).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-mf-card-body]').first()).toBeVisible();

  const editObs = page.locator('[data-mf-card-body] [data-mf-edit="observacoes"]').first();
  await editObs.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('textarea')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await expectFitsWithoutClip(page, 'Renda Fixa com cartão aberto @390');
});

test('Rentabilidade: chip "Personalizado" abre o sheet com datas nativas e fecha', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await abrirCarteira(page, 390);
  await openCarteiraTab(page, 'Análise');
  await waitForIdle(page);

  const chip = page.getByRole('button', { name: 'Personalizado', exact: true });
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  const dialog = page.getByRole('dialog', { name: 'Período personalizado' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[type="date"]')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});
