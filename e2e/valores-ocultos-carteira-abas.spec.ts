import { test, expect, type Page } from '@playwright/test';
import { COOKIE_VALORES_OCULTOS } from './helpers/valoresOcultos';
import { waitCarteiraReady, waitForIdle } from './helpers/mobileFit';

/**
 * Esconder valores — fatia 1: as 13 abas de classe da Carteira (tabelas, cartões do celular,
 * Caixa da aba). Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura: a
 * preferência é o cookie do contexto do navegador.
 *
 * Por aba, com o olho ABERTO lê os números que a tela mostra (o "sentinela" do e2e — o usuário
 * demo tem dados fixos; os %, que ficam visíveis pela decisão 2, saem da conta) e confere que não há pílula; com o olho FECHADO (cookie antes do
 * carregamento: o SSR já sai oculto) nenhum R$/US$ nem nenhum daqueles números pode aparecer no
 * texto visível nem em title/aria-label, e há pílulas onde havia números.
 *
 * Os gráficos das abas (roscas de FII/ETF/Stocks/REIT) são da fatia 2: o texto dentro de
 * `.apexcharts-canvas` fica fora desta conferência. A cotação atual é dado de mercado e fica
 * visível ([data-mf-valor-visivel], decisão 1).
 */

const ABAS = [
  'reserva-emergencia',
  'reserva-oportunidade',
  'renda-fixa',
  'fim-fia',
  'fiis',
  'acoes',
  'stocks',
  'reit',
  'etf',
  'moedas-criptos',
  'previdencia',
  'opcoes',
  'imoveis',
] as const;

/** Número pt-BR com decimais ou milhar (1.234 · 12,50) — o mesmo do helper da fatia 0. */
const REGEX_NUMERO_POSICAO = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d{2}/g;
/** Percentuais ficam visíveis (decisão 2): saem do texto antes de procurar números. */
const REGEX_PERCENTUAL = /[-−+]?\d[\d.,]*\s?%/g;

const REGEX_VALOR_MONETARIO =
  /-?\s?(?:R\$|US\$)\s?-?\d[\d.]*(?:,\d+)?(?:\s?(?:mil|mi|bi|[KMB])(?![A-Za-zÀ-ÿ]))?/g;

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

/** Abre a aba pela URL e espera os dados (sem "Carregando…" no conteúdo). */
async function abrirAba(page: Page, aba: string) {
  await page.goto(`/carteira?aba=${aba}`, { waitUntil: 'domcontentloaded' });
  await waitCarteiraReady(page, { timeout: 90_000 });
  await expect(page.locator('[data-mf-content]')).not.toContainText('Carregando', {
    timeout: 90_000,
  });
  // Celular: abre os cartões (os detalhes também têm de esconder).
  const fechados = page.locator('[data-mf-card-toggle][aria-expanded="false"]');
  for (let i = 0; i < 4 && (await fechados.count()) > 0; i += 1) {
    await fechados.first().click();
  }
  await waitForIdle(page);
}

/** Texto visível + title/aria do conteúdo, sem os trechos escondidos/permitidos e sem gráficos. */
async function textoExposto(page: Page): Promise<string> {
  return page.evaluate(() => {
    const raiz = document.querySelector<HTMLElement>('[data-mf-content]') ?? document.body;
    const clone = raiz.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll('[data-mf-valor-visivel], .mf-sensivel__valor, .apexcharts-canvas')
      .forEach((el) => el.remove());
    const atributos: string[] = [];
    clone.querySelectorAll('[title], [aria-label], [aria-description]').forEach((el) => {
      for (const a of ['title', 'aria-label', 'aria-description']) {
        const v = el.getAttribute(a);
        if (v) atributos.push(v);
      }
    });
    clone.style.position = 'absolute';
    clone.style.left = '-99999px';
    document.body.appendChild(clone);
    const texto = clone.innerText;
    clone.remove();
    return [texto, ...atributos].join('\n');
  });
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
  test.describe(`esconder valores — abas de classe da Carteira (${variante.nome})`, () => {
    test.use(variante.use);

    for (const aba of ABAS) {
      test(`?aba=${aba}: olho fechado não mostra valor, quantidade nem preço médio`, async ({
        page,
        context,
        baseURL,
      }) => {
        test.setTimeout(240_000);

        // Olho aberto: o de sempre (sem pílula) e os números da posição.
        await context.clearCookies({ name: COOKIE_VALORES_OCULTOS });
        await abrirAba(page, aba);
        await expect(page.locator('[data-mf-content] [data-mf-sensivel]')).toHaveCount(0);
        const textoAberto = (await textoExposto(page)).replace(REGEX_PERCENTUAL, ' ');
        const numeros = [...new Set(textoAberto.match(new RegExp(REGEX_NUMERO_POSICAO)) ?? [])];

        // Olho fechado: cookie antes de abrir a página.
        await context.addCookies([
          {
            name: COOKIE_VALORES_OCULTOS,
            value: '1',
            url: baseURL ?? 'http://localhost:3000',
            sameSite: 'Lax',
          },
        ]);
        await abrirAba(page, aba);
        await expect(page.locator('html')).toHaveAttribute('data-valores-ocultos', '');

        const texto = await textoExposto(page);
        const monetarios = [...new Set(texto.match(new RegExp(REGEX_VALOR_MONETARIO)) ?? [])];
        expect(monetarios, 'R$/US$ visíveis com o olho fechado').toEqual([]);
        const semPercentuais = texto.replace(REGEX_PERCENTUAL, ' ');
        const expostos = numeros.filter((n) => semPercentuais.includes(n));
        expect(expostos, 'números da posição ainda visíveis com o olho fechado').toEqual([]);
        if (numeros.length > 0) {
          expect(
            await page.locator('[data-mf-content] [data-mf-sensivel]').count(),
          ).toBeGreaterThan(0);
        }
      });
    }
  });
}
