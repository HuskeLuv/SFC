import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Helpers de e2e do Fluxo de caixa no celular (PWA fase 2).
 *
 * Contratos de DOM que a visão do mês (fatia A) expõe:
 * - `[data-mf-fluxo-mobile]`: raiz da visão do mês (só abaixo de lg);
 * - `[data-mf-fluxo-ready]`: visão montada, com os dados do ano;
 * - `[data-mf-month-label]`: nome do mês no MonthStepper;
 * - `[data-mf-fluxo-row]`: uma linha (item) do mês;
 * - botão "Mostrar N linhas sem valor" em cada grupo (as linhas sem valor ficam escondidas).
 */

export type FluxoModo = 'planilha' | 'orcamento';

/** Mês fixo com dados no seed (julho): o teste não depende do mês corrente. */
export const FLUXO_MES_PADRAO = 7;

const MOSTRAR_SEM_VALOR = /^Mostrar \d+ linhas? sem valor$/;

/**
 * Abre a /fluxodecaixa SEMPRE com `?mes=` (1..12, padrão julho) e, se pedido, `?modo=orcamento`.
 */
export async function gotoFluxo(
  page: Page,
  { modo = 'planilha', mes = FLUXO_MES_PADRAO }: { modo?: FluxoModo; mes?: number } = {},
) {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`gotoFluxo: mes fora de 1..12 (${mes})`);
  }
  const params = new URLSearchParams();
  if (modo === 'orcamento') params.set('modo', 'orcamento');
  params.set('mes', String(mes));
  await page.goto(`/fluxodecaixa?${params.toString()}`, { waitUntil: 'domcontentloaded' });
}

/** Visão do mês montada (raiz + dados). */
export async function waitFluxoMobileReady(page: Page, { timeout = 60_000 } = {}) {
  await expect(page.locator('[data-mf-fluxo-mobile]').first()).toBeVisible({ timeout });
  await expect(page.locator('[data-mf-fluxo-ready]').first()).toBeVisible({ timeout });
}

/** Texto do nome do mês no MonthStepper (ex.: "Julho 2026"). */
export async function monthLabel(page: Page): Promise<string> {
  const label = page.locator('[data-mf-month-label]').first();
  await expect(label).toBeVisible();
  return ((await label.textContent()) ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * A linha do mês com o nome exato. Se ela ainda não está visível (linha sem valor, escondida),
 * toca em "Mostrar N linhas sem valor" dos grupos até ela aparecer.
 */
export async function rowByName(page: Page, nome: string): Promise<Locator> {
  const row = page
    .locator('[data-mf-fluxo-row]')
    .filter({ has: page.getByText(nome, { exact: true }) })
    .first();
  if (await row.isVisible()) return row;

  const botoes = page.getByRole('button', { name: MOSTRAR_SEM_VALOR });
  const total = await botoes.count();
  for (let i = 0; i < total; i++) {
    // Cada toque troca o botão por "Esconder…": pega sempre o primeiro que sobrou.
    const botao = botoes.first();
    if (!(await botao.isVisible())) break;
    await botao.scrollIntoViewIfNeeded();
    await botao.click();
    if (await row.isVisible()) return row;
  }
  return row;
}
