import { test, expect, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { gotoSaude, mockarSaude, SENTINELAS_SAUDE } from './helpers/saude';

/**
 * Esconder valores — Fase 4, fatia 3: Saúde Financeira — Balanço Patrimonial (tabela e celular),
 * Evolução (gráfico e tabela) e, no celular, os cartões de seguros e dados econômicos. Exige o app
 * com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura: as APIs respondem com as
 * fixtures de helpers/saude.ts (`mockarSaude`) e nenhuma escrita sai da página.
 *
 * Somem: itens, totais e PL do balanço; linhas em R$ da evolução (pílula curta); eixo Y e tooltip
 * do gráfico; custo e capital dos seguros. Ficam: grau de independência, taxa de poupança,
 * rentabilidade, status, meses, nomes e Dados Econômicos (mercado).
 *
 * Cada bloco é medido no próprio escopo (FluxoCards, Metas, StatusHero e GestaoRisco do computador
 * são de outras fatias e têm specs próprias).
 */

test.describe.configure({ timeout: 180_000 });

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
      // sem storage: o aviso de cookies aparece, mas não cobre o que é medido
    }
  });
});

const OPCOES = { ignorarPercentuais: true } as const;
const BALANCO = '[data-e2e-escopo="balanco"]';
const EVOLUCAO = '[data-e2e-escopo="evolucao"]';

/** pt-BR com centavos (como a tela mostra o sentinela). */
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function abrir(page: Page) {
  const mock = await mockarSaude(page);
  await gotoSaude(page);
  // O provider montou (o clique no olho antes da hidratação não faz nada).
  await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
  return mock;
}

/** Marca o cartão de cada bloco do computador (pelo título) para medir no próprio escopo. */
async function marcarEscopos(page: Page) {
  await expect(page.locator('h3', { hasText: 'Evolução Indicadores Financeiros' })).toBeVisible();
  await expect(page.locator('.apexcharts-svg').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    const marcar = (titulo: string, escopo: string) => {
      const h3 = Array.from(document.querySelectorAll('h3')).find(
        (h) => h.textContent?.trim() === titulo,
      );
      h3?.closest('.rounded-2xl')?.setAttribute('data-e2e-escopo', escopo);
    };
    marcar('Balanço Patrimonial', 'balanco');
    marcar('Evolução Indicadores Financeiros', 'evolucao');
  });
}

/** aria-label/title com número em R$ (o mascarar deixa "R$ •••••"). */
async function atributosComValor(page: Page, escopo: string): Promise<string[]> {
  return page.evaluate((escopo) => {
    const valores: string[] = [];
    for (const raiz of Array.from(document.querySelectorAll(escopo))) {
      for (const el of [raiz, ...Array.from(raiz.querySelectorAll('*'))]) {
        for (const attr of ['aria-label', 'title']) {
          const v = el.getAttribute(attr);
          if (v && /R\$\s?-?\d/.test(v)) valores.push(v);
        }
      }
    }
    return valores;
  }, escopo);
}

async function alturas(page: Page, seletor: string): Promise<number[]> {
  return page
    .locator(seletor)
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
}

/** Passa o mouse no gráfico e devolve o HTML do tooltip do Apex. */
async function tooltipDoGrafico(page: Page): Promise<string> {
  const grafico = page.locator(`${EVOLUCAO} .apexcharts-svg`).first();
  await grafico.scrollIntoViewIfNeeded();
  const caixa = (await grafico.boundingBox())!;
  await page.mouse.move(caixa.x + caixa.width * 0.6, caixa.y + caixa.height * 0.4);
  const tooltip = page.locator(`${EVOLUCAO} .apexcharts-tooltip`).first();
  await expect(tooltip).toHaveClass(/apexcharts-active/, { timeout: 10_000 });
  return tooltip.innerHTML();
}

test.describe('esconder valores — Saúde Financeira: balanço e evolução (computador 1280)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('balanço: itens, totais e PL viram pílula; % e rótulos ficam', async ({ page }) => {
    const { escritas } = await abrir(page);
    await marcarEscopos(page);
    const numeros = await coletarNumerosDaPosicao(page, BALANCO, OPCOES);
    expect(numeros).toEqual(
      expect.arrayContaining([
        brl(SENTINELAS_SAUDE.reserva),
        brl(SENTINELAS_SAUDE.imoveis),
        brl(SENTINELAS_SAUDE.passivoLongo),
      ]),
    );
    const alturaLinhas = await alturas(page, `${BALANCO} tr`);
    const antes = await tamanhoDoDocumento(page);

    await alternarOlho(page, true);
    await expect(page.locator(`${BALANCO} .mf-sensivel`).first()).toBeVisible();
    await expectNumerosAusentes(page, numeros, BALANCO, OPCOES);
    expect(await coletarValoresExpostos(page, BALANCO)).toEqual([]);
    expect(await atributosComValor(page, BALANCO)).toEqual([]);
    // Ficam: rótulos dos quadrantes, nomes das dívidas e o grau de independência (%).
    const balanco = page.locator(BALANCO);
    await expect(balanco.getByText('TOTAL Ativos Curto Prazo')).toBeVisible();
    await expect(balanco.getByText(/^Financiamento do apartamento/)).toBeVisible();
    await expect(balanco.getByText(/\d+,\d%/)).toBeVisible();
    expect(await alturas(page, `${BALANCO} tr`)).toEqual(alturaLinhas);
    expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(antes.largura);

    await alternarOlho(page, false);
    await expect(page.locator(`${BALANCO} .mf-sensivel`)).toHaveCount(0);
    expect(await coletarNumerosDaPosicao(page, BALANCO, OPCOES)).toEqual(numeros);
    expect(escritas).toEqual([]);
  });

  test('evolução: eixo Y e tooltip sem valor, tabela com pílula curta; % e status ficam', async ({
    page,
  }) => {
    const { escritas } = await abrir(page);
    await marcarEscopos(page);
    const expostosAbertos = await coletarValoresExpostos(page, EVOLUCAO);
    // Olho aberto: eixo em "R$ …k" e a tabela em "R$ … K".
    expect(expostosAbertos.length).toBeGreaterThan(0);
    const percentuais = await page.locator(`${EVOLUCAO} td`).getByText(/%$/).count();
    const alturaLinhas = await alturas(page, `${EVOLUCAO} tr`);
    const areaAntes = await page
      .locator(`${EVOLUCAO} .apexcharts-inner.apexcharts-graphical`)
      .boundingBox();
    const antes = await tamanhoDoDocumento(page);

    await alternarOlho(page, true);
    await expect(page.locator(`${EVOLUCAO} .mf-sensivel--curto`).first()).toBeVisible();
    await expect(page.locator(`${EVOLUCAO} .apexcharts-svg`).first()).toBeVisible();
    expect(await coletarValoresExpostos(page, EVOLUCAO)).toEqual([]);
    expect(await atributosComValor(page, EVOLUCAO)).toEqual([]);
    // Eixo Y sem rótulo, área do gráfico no mesmo lugar (largura reservada).
    const rotulosY = await page
      .locator(`${EVOLUCAO} .apexcharts-yaxis-label`)
      .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? '').filter(Boolean));
    expect(rotulosY).toEqual([]);
    const areaDepois = await page
      .locator(`${EVOLUCAO} .apexcharts-inner.apexcharts-graphical`)
      .boundingBox();
    expect(Math.abs((areaDepois?.x ?? 0) - (areaAntes?.x ?? 0))).toBeLessThanOrEqual(4);
    // Tooltip com pílula, meses ficam.
    const tooltip = await tooltipDoGrafico(page);
    expect(tooltip).toContain('mf-pilula-grafico');
    expect(tooltip).not.toMatch(/R\$\s?-?\d/);
    expect(await coletarValoresExpostos(page, EVOLUCAO)).toEqual([]);
    // Taxa de poupança, rentabilidade e status continuam.
    expect(await page.locator(`${EVOLUCAO} td`).getByText(/%$/).count()).toBe(percentuais);
    await expect(page.locator(`${EVOLUCAO} td`).getByText('EQ').first()).toBeVisible();
    expect(await alturas(page, `${EVOLUCAO} tr`)).toEqual(alturaLinhas);
    expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(antes.largura);

    await page.mouse.move(0, 0);
    await alternarOlho(page, false);
    await expect(page.locator(`${EVOLUCAO} .mf-sensivel`)).toHaveCount(0);
    expect(await coletarValoresExpostos(page, EVOLUCAO)).toEqual(expostosAbertos);
    expect(escritas).toEqual([]);
  });

  test('screenshots locais (claro e escuro)', async ({ page }) => {
    test.skip(!!process.env.CI, 'screenshots só locais');
    const dir = process.env.VALORES_OCULTOS_QA_DIR;
    test.skip(!dir, 'defina VALORES_OCULTOS_QA_DIR para gravar');
    await abrir(page);
    await marcarEscopos(page);
    for (const tema of ['claro', 'escuro'] as const) {
      if (tema === 'escuro') {
        await page.evaluate(() => document.documentElement.classList.add('dark'));
      }
      for (const oculto of [false, true]) {
        if (oculto) await alternarOlho(page, true);
        const sufixo = `${tema}-${oculto ? 'fechado' : 'aberto'}`;
        await page.locator(BALANCO).screenshot({ path: `${dir}/dev-3-balanco-1280-${sufixo}.png` });
        await page.locator(EVOLUCAO).screenshot({
          path: `${dir}/dev-3-evolucao-1280-${sufixo}.png`,
        });
        if (oculto) await alternarOlho(page, false);
      }
    }
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
  });
});

const VARIANTES = [
  { nome: 'celular 390', largura: 390 },
  { nome: 'celular 320', largura: 320 },
] as const;

const BLOCO_BALANCO = '#saude-bloco-balanco';
const BLOCO_EVOLUCAO = '#saude-bloco-evolucao';
const SEGUROS_CARTOES = '#saude-bloco-seguros ul[data-mf-mobile]';
const DADOS = '#saude-bloco-dados';

/** Abre os blocos recolhidos do celular. */
async function abrirBlocos(page: Page) {
  const fechados = page.locator('button[data-mf-mobile][aria-controls][aria-expanded="false"]');
  for (let i = await fechados.count(); i > 0; i -= 1) {
    await fechados.first().click();
  }
  await expect(page.locator(`${BLOCO_BALANCO} [data-mf-mobile]`).first()).toBeVisible();
  await expect(page.locator(SEGUROS_CARTOES)).toBeVisible();
}

for (const variante of VARIANTES) {
  test.describe(`esconder valores — Saúde Financeira no ${variante.nome}`, () => {
    test.use({
      viewport: { width: variante.largura, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    test('balanço, evolução e seguros: R$ em pílula; % e mercado ficam', async ({ page }) => {
      const { escritas } = await abrir(page);
      await abrirBlocos(page);
      const escopos = [BLOCO_BALANCO, BLOCO_EVOLUCAO, SEGUROS_CARTOES];
      const numeros: Record<string, string[]> = {};
      for (const escopo of escopos) {
        numeros[escopo] = await coletarNumerosDaPosicao(page, escopo, OPCOES);
      }
      expect(numeros[BLOCO_BALANCO]).toContain(brl(SENTINELAS_SAUDE.imoveis));
      expect(numeros[SEGUROS_CARTOES]).toContain(brl(SENTINELAS_SAUDE.capitalSeguroVida));
      const dadosAntes = await page.locator(DADOS).innerText();
      const alturaItens = await alturas(page, `${BLOCO_BALANCO} li, ${SEGUROS_CARTOES} li`);
      const antes = await tamanhoDoDocumento(page);

      await alternarOlho(page, true);
      await expect(page.locator(`${BLOCO_BALANCO} .mf-sensivel`).first()).toBeVisible();
      for (const escopo of escopos) {
        await expectNumerosAusentes(page, numeros[escopo], escopo, OPCOES);
        expect(await coletarValoresExpostos(page, escopo)).toEqual([]);
        expect(await atributosComValor(page, escopo)).toEqual([]);
      }
      // Itens das listas em pílula curta; nenhuma linha fica mais alta. (A pílula tem largura fixa,
      // decisão 4, e é mais estreita que o valor: um rótulo longo que quebrava em 2 linhas pode
      // caber em 1 — a linha nunca cresce.)
      expect(await page.locator(`${BLOCO_BALANCO} li .mf-sensivel--curto`).count()).toBeGreaterThan(
        0,
      );
      const alturaOculta = await alturas(page, `${BLOCO_BALANCO} li, ${SEGUROS_CARTOES} li`);
      expect(alturaOculta).toHaveLength(alturaItens.length);
      alturaOculta.forEach((h, i) => expect(h).toBeLessThanOrEqual(alturaItens[i]));
      // Dados Econômicos (mercado) idênticos; nomes e cobertura dos seguros ficam.
      expect(await page.locator(DADOS).innerText()).toBe(dadosAntes);
      await expect(page.locator(SEGUROS_CARTOES).getByText('Seguro de vida').first()).toBeVisible();
      // Nenhuma rolagem lateral nova.
      expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(
        Math.max(antes.largura, variante.largura),
      );

      await alternarOlho(page, false);
      await expect(page.locator(`${BLOCO_BALANCO} .mf-sensivel`)).toHaveCount(0);
      for (const escopo of escopos) {
        expect(await coletarNumerosDaPosicao(page, escopo, OPCOES)).toEqual(numeros[escopo]);
      }
      expect(escritas).toEqual([]);
    });

    test('screenshots locais (claro e escuro)', async ({ page }) => {
      test.skip(!!process.env.CI, 'screenshots só locais');
      const dir = process.env.VALORES_OCULTOS_QA_DIR;
      test.skip(!dir, 'defina VALORES_OCULTOS_QA_DIR para gravar');
      await abrir(page);
      await abrirBlocos(page);
      for (const tema of ['claro', 'escuro'] as const) {
        if (tema === 'escuro') {
          await page.evaluate(() => document.documentElement.classList.add('dark'));
        }
        for (const oculto of [false, true]) {
          if (oculto) await alternarOlho(page, true);
          const sufixo = `${variante.largura}-${tema}-${oculto ? 'fechado' : 'aberto'}`;
          for (const [nome, escopo] of [
            ['balanco', BLOCO_BALANCO],
            ['evolucao', BLOCO_EVOLUCAO],
            ['seguros', SEGUROS_CARTOES],
          ] as const) {
            await page.locator(escopo).screenshot({ path: `${dir}/dev-3-${nome}-${sufixo}.png` });
          }
          if (oculto) await alternarOlho(page, false);
        }
      }
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
    });
  });
}
