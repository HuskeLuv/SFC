import { test, expect, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { gotoPlanejar, mockarPlanejar } from './helpers/planejar';

/**
 * Esconder valores — Fase 3, fatia 2: abas da Aposentadoria (Projeção, Acompanhamento, Evolução)
 * e os gráficos. Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura: as
 * APIs do Planejar são respondidas por `mockarPlanejar` (fixtures fixas, não dependem do mês
 * corrente) e nenhuma escrita chega ao banco.
 *
 * Mede só o conteúdo da aba ([data-mf-apos-aba]): o painel lateral e as premissas são de outra
 * fatia. Com o olho fechado: nenhum R$ (inclusive "R$ 235 K", eixos e tooltip) nem número lido com o
 * olho aberto; % (rentabilidade, meta, Δ%) e idades ficam; os campos do formulário continuam com o
 * número; altura das linhas da tabela igual e nenhuma rolagem lateral nova.
 */

test.describe.configure({ timeout: 240_000 });

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
      // sem storage: o aviso de cookies aparece, mas não cobre as abas
    }
  });
});

const ABAS = [
  { id: 'proj', nome: /Projeção/, graficos: 1 },
  { id: 'track', nome: /Acompanhamento/, graficos: 0 },
  { id: 'evol', nome: /Evolução/, graficos: 3 },
] as const;
type Aba = (typeof ABAS)[number];

const OPCOES = { ignorarPercentuais: true } as const;
const escopo = (aba: Aba) => `[data-mf-apos-aba="${aba.id}"]`;

const VARIANTES = [
  { nome: 'computador 1280', largura: 1280, altura: 800, celular: false },
  { nome: 'celular 390', largura: 390, altura: 844, celular: true },
  { nome: 'celular 320', largura: 320, altura: 844, celular: true },
] as const;

async function abrirAba(page: Page, aba: Aba, celular: boolean) {
  const botao = celular
    ? page.getByRole('tab', { name: aba.nome })
    : page.getByRole('button', { name: aba.nome });
  await botao.click();
  const raiz = page.locator(escopo(aba));
  await expect(raiz).toBeVisible();
  if (aba.graficos) {
    await expect(raiz.locator('.apexcharts-canvas')).toHaveCount(aba.graficos, {
      timeout: 30_000,
    });
  }
  // Animação do Apex: os rótulos do eixo chegam depois do canvas.
  await page.waitForTimeout(800);
}

/** aria-label/title com número em R$ (o mascarar deixa "R$ •••••"). */
async function atributosComValor(page: Page, sel: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const raiz = document.querySelector(sel) ?? document.body;
    const valores: string[] = [];
    for (const el of [raiz, ...Array.from(raiz.querySelectorAll('*'))]) {
      for (const attr of ['aria-label', 'title']) {
        const v = el.getAttribute(attr);
        if (v && /R\$\s?-?\d/.test(v)) valores.push(v);
      }
    }
    return valores;
  }, sel);
}

async function alturasDasLinhas(page: Page): Promise<number[]> {
  return page
    .locator('[data-mf-apos-aba="track"] tbody tr')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
}

/**
 * Alturas dos blocos de resumo: na Projeção, a grade de cartões (2º bloco); no Acompanhamento, as
 * etiquetas e o painel (1º e 2º). A pílula não pode quebrar linha e fazer o cartão crescer.
 */
async function alturasDosResumos(page: Page, aba: Aba): Promise<number[]> {
  if (aba.id === 'evol') return [];
  const indices = aba.id === 'track' ? [0, 1] : [1];
  return page
    .locator(escopo(aba))
    .evaluate(
      (raiz, indices) =>
        indices.map((i) => Math.round(raiz.children[i]?.getBoundingClientRect().height ?? -1)),
      indices,
    );
}

/** Rótulos do eixo Y com texto (com o olho fechado, os dos gráficos em R$ ficam vazios). */
async function rotulosDoEixoY(page: Page, sel: string): Promise<string[]> {
  return page
    .locator(`${sel} .apexcharts-yaxis-label`)
    .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? '').filter(Boolean));
}

for (const variante of VARIANTES) {
  test.describe(`esconder valores — Aposentadoria, abas (${variante.nome})`, () => {
    test.use({
      viewport: { width: variante.largura, height: variante.altura },
      ...(variante.celular ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
    });

    test('abas e gráficos: nenhum valor com o olho fechado; % e idades ficam', async ({ page }) => {
      const { escritas } = await mockarPlanejar(page);
      await gotoPlanejar(page, 'aposentadoria');
      await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });

      // Olho aberto: o que cada aba mostra hoje.
      const numeros = new Map<string, string[]>();
      const resumos = new Map<string, number[]>();
      let alturas: number[] = [];
      for (const aba of ABAS) {
        await abrirAba(page, aba, variante.celular);
        const nums = await coletarNumerosDaPosicao(page, escopo(aba), OPCOES);
        const reais = await coletarValoresExpostos(page, escopo(aba));
        expect(reais.length, `R$ na aba ${aba.id} com o olho aberto`).toBeGreaterThan(0);
        numeros.set(aba.id, nums);
        resumos.set(aba.id, await alturasDosResumos(page, aba));
        if (aba.id === 'track' && !variante.celular) alturas = await alturasDasLinhas(page);
      }
      const antes = await tamanhoDoDocumento(page);

      await alternarOlho(page, true);
      for (const aba of ABAS) {
        await abrirAba(page, aba, variante.celular);
        const sel = escopo(aba);
        // A Evolução só tem gráficos (sem pílula HTML fora do tooltip): lá vale o eixo vazio.
        if (aba.id !== 'evol') {
          await expect(page.locator(`${sel} .mf-sensivel`).first()).toBeVisible();
        }
        expect(await coletarValoresExpostos(page, sel), `R$ na aba ${aba.id}`).toEqual([]);
        await expectNumerosAusentes(page, numeros.get(aba.id)!, sel, OPCOES);
        expect(await atributosComValor(page, sel)).toEqual([]);
        expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(antes.largura);
        expect(await alturasDosResumos(page, aba), `altura dos resumos (${aba.id})`).toEqual(
          resumos.get(aba.id),
        );
      }

      // Projeção: idade e anos de aposentadoria seguem; eixo Y sem rótulo.
      const proj = ABAS[0];
      await abrirAba(page, proj, variante.celular);
      await expect(page.locator(escopo(proj))).toContainText('30 anos de aposentadoria');
      expect(await rotulosDoEixoY(page, escopo(proj))).toEqual([]);

      // Evolução: só o eixo da rentabilidade (%) mantém rótulos.
      const evol = ABAS[2];
      await abrirAba(page, evol, variante.celular);
      const rotulos = await rotulosDoEixoY(page, escopo(evol));
      expect(rotulos.length).toBeGreaterThan(0);
      for (const r of rotulos) expect(r).toMatch(/%$/);

      // Acompanhamento: % ficam e a altura das linhas da tabela é a mesma.
      const track = ABAS[1];
      await abrirAba(page, track, variante.celular);
      await expect(page.locator(escopo(track))).toContainText('Rent. nominal: 11,5%');
      if (!variante.celular) {
        // Nenhuma linha cresce. A 1280 com a sidebar, a coluna "Nec." já quebra "R$ 3 K" em duas
        // linhas com o olho aberto; a pílula curta não quebra, então a linha pode até encolher.
        expect(alturas.length).toBeGreaterThan(0);
        const fechado = await alturasDasLinhas(page);
        expect(fechado).toHaveLength(alturas.length);
        fechado.forEach((h, i) => expect(h, `linha ${i + 1}`).toBeLessThanOrEqual(alturas[i]));
      }

      expect(escritas).toEqual([]);
    });

    if (!variante.celular) {
      test('tooltip com pílula e formulário do mês visível', async ({ page }) => {
        const { escritas } = await mockarPlanejar(page);
        await gotoPlanejar(page, 'aposentadoria');
        await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
        await alternarOlho(page, true);

        for (const aba of [ABAS[0], ABAS[2]]) {
          await abrirAba(page, aba, false);
          const area = page.locator(`${escopo(aba)} .apexcharts-canvas`).first();
          const caixa = (await area.boundingBox())!;
          await page.mouse.move(caixa.x + caixa.width * 0.6, caixa.y + caixa.height * 0.5);
          const tooltip = page.locator(`${escopo(aba)} .apexcharts-tooltip`).first();
          await expect(tooltip.locator('.mf-pilula-grafico').first()).toBeAttached();
          expect(await coletarValoresExpostos(page, escopo(aba))).toEqual([]);
        }

        // Formulário (decisão 3): ao escolher um mês registrado, os campos têm o número.
        const track = ABAS[1];
        await abrirAba(page, track, false);
        await page
          .locator(`${escopo(track)} tbody tr`)
          .nth(3)
          .click();
        const campos = page.locator(`${escopo(track)} input[type="number"]`);
        await expect(campos.first()).toHaveValue(/\d/);
        await expect(campos.nth(1)).toHaveValue(/\d/);
        expect(await coletarValoresExpostos(page, escopo(track))).toEqual([]);
        expect(escritas).toEqual([]);
      });
    }
  });
}
