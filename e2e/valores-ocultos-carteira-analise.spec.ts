import { test, expect, type Page } from '@playwright/test';
import {
  ROTA_PREFERENCIA_VALORES_OCULTOS,
  coletarValoresExpostos,
  olhoValores,
} from './helpers/valoresOcultos';
import { openCarteiraTab, waitCarteiraReady, waitForIdle } from './helpers/mobileFit';

/**
 * Esconder valores — Carteira › Análise (fatia 3): Rentabilidade, Proventos (Consolidado e
 * Agenda, com o tooltip do gráfico de histórico), Risco x Retorno, Cobertura FGC e as 6 telas de
 * IR. Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI).
 *
 * Em cada tela: lê com o olho ABERTO os números da posição (o sentinela do e2e — o banco do seed
 * tem dados fixos) e os percentuais; fecha o olho; nenhum R$/US$ nem número da posição pode
 * aparecer (innerText, rótulos e tooltip do Apex) e todos os % continuam. Só leitura no banco: a
 * preferência é um cookie do contexto (o POST não toca no banco).
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
      // sem storage: o aviso aparece por cima, mas não muda o texto lido
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

/** Número pt-BR de valor (1.234 · 12,50 · 9.876.543,21) que NÃO é percentual. */
const REGEX_NUMERO = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d{2}/g;
const REGEX_PERCENTUAL = /-?\+?\d+(?:[.,]\d+)?\s?%/g;

interface Leitura {
  numeros: string[];
  percentuais: string[];
  texto: string;
}

/**
 * Texto visível do conteúdo (sem os trechos [data-mf-valor-visivel] — regras públicas como o
 * limite do FGC — nem os valores escondidos) e, dele, os números que não são % e os %.
 */
async function ler(page: Page): Promise<Leitura> {
  const texto = await page.evaluate(() => {
    const raiz = document.querySelector<HTMLElement>('[data-mf-content]') ?? document.body;
    const clone = raiz.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll('[data-mf-valor-visivel], .mf-sensivel__valor, script, style')
      .forEach((el) => el.remove());
    clone.style.position = 'absolute';
    clone.style.left = '-99999px';
    document.body.appendChild(clone);
    const t = clone.innerText;
    clone.remove();
    return t;
  });
  const numeros = new Set<string>();
  for (const m of texto.matchAll(new RegExp(REGEX_NUMERO))) {
    const depois = texto.slice((m.index ?? 0) + m[0].length).trimStart();
    if (!depois.startsWith('%')) numeros.add(m[0]);
  }
  return {
    numeros: [...numeros],
    percentuais: [...new Set(texto.match(new RegExp(REGEX_PERCENTUAL)) ?? [])],
    texto,
  };
}

async function alternar(page: Page, ocultos: boolean) {
  const olho = olhoValores(page);
  await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
  const resposta = page.waitForResponse(
    (r) => r.url().includes(ROTA_PREFERENCIA_VALORES_OCULTOS) && r.request().method() === 'POST',
  );
  await olho.click();
  expect((await resposta).status()).toBe(200);
  await expect(olho).toHaveAttribute('aria-pressed', String(ocultos));
  // Gráficos: o Apex aplica as opções novas no próximo quadro.
  await page.waitForTimeout(400);
}

async function screenshotLocal(page: Page, nome: string) {
  if (process.env.CI) return;
  await page.screenshot({ path: test.info().outputPath(`${nome}.png`), fullPage: true });
}

/** Passa o mouse (ou toca) numa barra do histórico de proventos e devolve o texto do tooltip. */
async function tooltipProventos(page: Page, isMobile: boolean): Promise<string | null> {
  const barra = page.locator('#chartProventosHistorico .apexcharts-bar-area').first();
  if ((await barra.count()) === 0) return null;
  await barra.scrollIntoViewIfNeeded();
  if (isMobile) await barra.tap({ force: true });
  else await barra.hover({ force: true });
  const tooltip = page.locator('#chartProventosHistorico .apexcharts-tooltip');
  await expect(tooltip)
    .toContainText(/\S/, { timeout: 5_000 })
    .catch(() => {});
  return (await tooltip.textContent()) ?? '';
}

/**
 * Telas da Análise: sub-aba e aba interna. `semValores`: a tela só tem %, índices e estatísticas
 * de mercado (beta, correlação, Sharpe) — nada some e nenhuma pílula aparece.
 */
const TELAS: Array<{ nome: string; abas: string[]; semValores?: boolean }> = [
  { nome: 'rentabilidade', abas: ['Rentabilidade Geral'], semValores: true },
  { nome: 'proventos-consolidado', abas: ['Proventos', 'Consolidado'] },
  { nome: 'proventos-agenda', abas: ['Proventos', 'Agenda'] },
  { nome: 'risco-retorno', abas: ['Risco x Retorno'], semValores: true },
  { nome: 'cobertura-fgc', abas: ['Cobertura FGC'] },
  { nome: 'ir-resumo-anual', abas: ['Imposto de Renda', 'Resumo Anual'] },
  { nome: 'ir-mensal-rv', abas: ['Imposto de Renda', 'Mensal — RV BR'] },
  { nome: 'ir-stocks-us', abas: ['Imposto de Renda', 'Stocks US'] },
  { nome: 'ir-cripto', abas: ['Imposto de Renda', 'Cripto'] },
  { nome: 'ir-come-cotas', abas: ['Imposto de Renda', 'Come-cotas'] },
  // Aba PGBL (nov/2026): o nome acessível inclui a pílula "Novo".
  { nome: 'ir-pgbl', abas: ['Imposto de Renda', 'PGBL Novo'] },
];

for (const variante of VARIANTES) {
  test.describe(`esconder valores — Carteira › Análise (${variante.nome})`, () => {
    test.use(variante.use);
    const isMobile = 'isMobile' in variante.use;

    test('5 sub-abas sem valores com o olho fechado; % continuam', async ({ page }) => {
      test.setTimeout(600_000);
      await page.goto('/carteira', { waitUntil: 'domcontentloaded' });
      await waitCarteiraReady(page);
      await expect(olhoValores(page)).toHaveAttribute('aria-pressed', 'false', {
        timeout: 60_000,
      });
      await openCarteiraTab(page, 'Análise');

      for (const tela of TELAS) {
        for (const aba of tela.abas) await openCarteiraTab(page, aba);
        // Cobertura FGC: abre o primeiro grupo (títulos com investido e atual).
        const grupo = page.locator('[data-fgc-grupo] > button[aria-expanded="false"]').first();
        if (tela.nome === 'cobertura-fgc' && (await grupo.count()) > 0) {
          await grupo.click();
          await waitForIdle(page, { settleMs: 300 });
        }

        const aberto = await ler(page);
        const tooltipAberto =
          tela.nome === 'proventos-consolidado' ? await tooltipProventos(page, isMobile) : null;

        await alternar(page, true);
        await screenshotLocal(page, `analise-${tela.nome}-oculto`);

        expect(await coletarValoresExpostos(page), `${tela.nome}: R$ visível`).toEqual([]);
        const fechado = await ler(page);
        if (tela.semValores) {
          const sumiramNumeros = aberto.numeros.filter((n) => !fechado.texto.includes(n));
          expect(sumiramNumeros, `${tela.nome}: estatísticas que sumiram`).toEqual([]);
          expect(await page.locator('[data-mf-content] .mf-sensivel').count()).toBe(0);
        } else {
          const expostos = aberto.numeros.filter((n) => fechado.texto.includes(n));
          expect(expostos, `${tela.nome}: números da posição visíveis`).toEqual([]);
        }
        const sumiram = aberto.percentuais.filter((p) => !fechado.texto.includes(p));
        expect(sumiram, `${tela.nome}: percentuais que sumiram`).toEqual([]);

        if (tela.nome === 'proventos-consolidado') {
          const tooltip = await tooltipProventos(page, isMobile);
          if (tooltip === null) {
            test.info().annotations.push({
              type: 'sem dados',
              description: 'Sem proventos no período: tooltip do histórico não testado.',
            });
          } else {
            if (tooltipAberto) expect(tooltipAberto).toMatch(/R\$/);
            expect(tooltip, 'tooltip do histórico com R$').not.toMatch(/R\$\s?\d/);
            expect(
              await page.locator('#chartProventosHistorico .mf-pilula-grafico').count(),
              'pílulas no tooltip',
            ).toBeGreaterThan(0);
            expect(await coletarValoresExpostos(page)).toEqual([]);
          }
          // Eixo Y do histórico sem rótulo.
          const eixo = await page
            .locator('#chartProventosHistorico .apexcharts-yaxis-label')
            .allTextContents();
          expect(eixo.filter((t) => /\d/.test(t))).toEqual([]);
        }

        await alternar(page, false);
      }
    });
  });
}
