import { expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * Esconder valores nos e2e (fatia 0). O app precisa estar com VALORES_OCULTOS_HABILITADO=true (o
 * job e2e do CI liga; localmente, passe a variável ao subir o servidor).
 *
 * - ligarValoresOcultos(context, baseURL): grava o cookie do aparelho ANTES de abrir a página —
 *   o SSR já sai oculto (é o caminho do anti-flash).
 * - coletarValoresExpostos(page, escopo): R$/US$ visíveis (innerText fora de [data-mf-valor-visivel]
 *   e dentro dos rótulos/tooltip do Apex). Com o olho fechado tem de dar [].
 * - coletarNumerosDaPosicao(page, escopo) + expectNumerosAusentes(page, numeros, escopo): lê com o
 *   olho ABERTO os números que a tela mostra (o "sentinela" do e2e — o usuário demo tem dados fixos)
 *   e confere que nenhum deles aparece depois de fechar o olho.
 */

/** Mesmos valores de src/utils/valoresOcultos.ts (o e2e não importa o src). */
export const COOKIE_VALORES_OCULTOS = 'mf_valores_ocultos';
export const ROTA_PREFERENCIA_VALORES_OCULTOS = '/api/preferencias/valores-ocultos';
const REGEX_VALOR_MONETARIO =
  /-?\s?(?:R\$|US\$)\s?-?\d[\d.]*(?:,\d+)?(?:\s?(?:mil|mi|bi|[KMB])(?![A-Za-zÀ-ÿ]))?/g;

/** Número pt-BR com decimais ou milhar (1.234 · 12,50 · 9.876.543,21) — não pega ano nem dia. */
const REGEX_NUMERO_POSICAO = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d{2}/g;

/** Rótulos do Apex que podem levar valores (eixo Y, data labels, rosca e tooltip). */
const SELETORES_APEX =
  '.apexcharts-yaxis-label, .apexcharts-datalabel, .apexcharts-datalabel-value, .apexcharts-pie-label, .apexcharts-tooltip';

export async function ligarValoresOcultos(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: COOKIE_VALORES_OCULTOS, value: '1', url: baseURL, sameSite: 'Lax' },
  ]);
}

/** Botão do olho visível na largura atual (rodapé da sidebar ou MobileHeader). */
export function olhoValores(page: Page) {
  return page.getByRole('button', { name: 'Esconder valores' }).filter({ visible: true });
}

/** Texto visível do escopo sem os trechos permitidos ([data-mf-valor-visivel]) + rótulos do Apex. */
async function textoVisivel(page: Page, escopo: string): Promise<string> {
  return page.evaluate(
    ({ escopo, apex }) => {
      const raiz = document.querySelector<HTMLElement>(escopo) ?? document.body;
      const clone = raiz.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[data-mf-valor-visivel], .mf-sensivel__valor').forEach((el) => {
        el.remove();
      });
      // innerText só funciona em nó renderizado: mede no clone fora da tela.
      clone.style.position = 'absolute';
      clone.style.left = '-99999px';
      document.body.appendChild(clone);
      const texto = clone.innerText;
      clone.remove();
      const rotulos = Array.from(raiz.querySelectorAll<HTMLElement>(apex))
        .filter((el) => !el.closest('[data-mf-valor-visivel]'))
        .map((el) => el.textContent ?? '');
      return [texto, ...rotulos].join('\n');
    },
    { escopo, apex: SELETORES_APEX },
  );
}

export async function coletarValoresExpostos(
  page: Page,
  escopo = '[data-mf-content]',
): Promise<string[]> {
  const texto = await textoVisivel(page, escopo);
  return [...new Set(texto.match(new RegExp(REGEX_VALOR_MONETARIO)) ?? [])];
}

export async function coletarNumerosDaPosicao(
  page: Page,
  escopo = '[data-mf-content]',
): Promise<string[]> {
  const texto = await textoVisivel(page, escopo);
  return [...new Set(texto.match(new RegExp(REGEX_NUMERO_POSICAO)) ?? [])];
}

/** Nenhum dos números lidos com o olho aberto pode aparecer com o olho fechado. */
export async function expectNumerosAusentes(
  page: Page,
  numeros: readonly string[],
  escopo = '[data-mf-content]',
) {
  const texto = await textoVisivel(page, escopo);
  const expostos = numeros.filter((n) => texto.includes(n));
  expect(expostos, 'números da posição ainda visíveis com o olho fechado').toEqual([]);
}

/**
 * Tamanho do documento (scrollWidth/scrollHeight). Fechar o olho não pode alargar a página (o
 * "valor oculto" do leitor de tela escapava das tabelas com rolagem e criava rolagem horizontal;
 * no celular o viewport de layout passava de 390px e a barra de baixo saía da tela).
 */
export async function tamanhoDoDocumento(page: Page): Promise<{ largura: number; altura: number }> {
  return page.evaluate(() => ({
    largura: document.documentElement.scrollWidth,
    altura: document.documentElement.scrollHeight,
  }));
}
