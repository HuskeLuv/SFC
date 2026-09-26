import { test, type Page } from '@playwright/test';
import { readySelectorFor } from './routes';

/**
 * Seletores de "ainda carregando" (skeleton, spinner, aria-busy). Procurados dentro de <main> quando existir; senão no body
 * (o layout atual não tem <main>).
 */
const LOADING_SELECTOR = '.animate-pulse, .animate-spin, [aria-busy="true"]';

export interface WaitForContentOptions {
  /** Timeout para o skeleton sumir (padrão 30s — a /carteira é lenta). */
  skeletonTimeout?: number;
  /** Folga final para gráficos/medidas assentarem (padrão 1500ms). */
  settleMs?: number;
  /** Timeout para o conteúdo aparecer (padrão 60s — o dev server compila sob demanda e a /carteira
   * e /ativos/{id} levam 20–40s com o banco de dev). */
  readyTimeout?: number;
  /** Sobrescreve o READY_SELECTOR da rota (ex.: visão de desktop de uma página). */
  readySelector?: string;
}

/**
 * Navega e espera o CONTEÚDO real, não o skeleton — medir o skeleton faz o teste de transbordo
 * passar por engano. Se o skeleton persistir além do timeout, anota "skeleton persistente" no
 * relatório e segue (a medida fica visível como suspeita, em vez de derrubar o teste).
 */
export async function waitForContent(
  page: Page,
  route: string,
  {
    skeletonTimeout = 30_000,
    settleMs = 1_500,
    readySelector,
    readyTimeout = 60_000,
  }: WaitForContentOptions = {},
) {
  const response = await page.goto(route, { waitUntil: 'domcontentloaded' });

  await page
    .locator(readySelector ?? readySelectorFor(route))
    .filter({ visible: true, hasText: /\S/ })
    .first()
    .waitFor({ state: 'visible', timeout: readyTimeout });

  try {
    await page.waitForFunction(
      (sel) => {
        const root = document.querySelector('main') ?? document.body;
        return root.querySelectorAll(sel).length === 0;
      },
      LOADING_SELECTOR,
      { timeout: skeletonTimeout },
    );
  } catch {
    test.info().annotations.push({
      type: 'skeleton persistente',
      description: `${route}: ainda havia ${LOADING_SELECTOR} após ${skeletonTimeout}ms`,
    });
  }

  await page.waitForTimeout(settleMs);
  return response;
}
