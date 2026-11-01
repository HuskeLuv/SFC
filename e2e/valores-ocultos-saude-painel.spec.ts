import { test, expect, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { gotoSaude, mockarSaude } from './helpers/saude';

/**
 * Esconder valores — Fase 4, fatia 2: Saúde Financeira, painel e risco (/saude-financeira).
 * Cabeçalho do cliente, Dados Econômicos, Indicadores do Fluxo de Caixa, metas patrimoniais,
 * Status e Gestão de Risco (tabela e bolhas), mais a grade e o resumo do Balanço no celular.
 * Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). Só leitura: as APIs são
 * respondidas por `mockarSaude` (fixtures com sentinelas) e os formulários fecham sem salvar.
 *
 * Os blocos de outras fatias (Balanço, Evolução, cartões de seguros do celular) ficam fora: cada
 * bloco desta fatia é marcado no teste (data-e2e-bloco) e conferido sozinho.
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
      // sem storage: o aviso de cookies aparece e o teste falha de forma visível
    }
  });
});

const OPCOES = { ignorarPercentuais: true } as const;
const bloco = (nome: string) => `[data-e2e-bloco="${nome}"]`;

async function abrir(page: Page) {
  const mock = await mockarSaude(page);
  await gotoSaude(page);
  // O provider montou (o clique no olho antes da hidratação não faz nada).
  await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
  await expect(page.getByText('Status Saúde Financeira').first()).toBeVisible({ timeout: 30_000 });
  return mock;
}

/**
 * Marca (só no teste) o cartão de cada bloco desta fatia pelo título; devolve os que achou.
 * `fluxo` é o invólucro do título + cartões; os demais, o cartão arredondado.
 */
async function marcarBlocos(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const raiz = document.querySelector('[data-mf-content]') ?? document.body;
    const achados: string[] = [];
    const marcar = (nome: string, el: Element | null | undefined) => {
      if (!el) return;
      el.setAttribute('data-e2e-bloco', nome);
      achados.push(nome);
    };
    const porTitulo = (texto: string) =>
      Array.from(raiz.querySelectorAll('h3')).find((h) => h.textContent?.trim().startsWith(texto));
    marcar('fluxo', porTitulo('Indicadores Financeiros (Fluxo de Caixa)')?.parentElement);
    marcar(
      'metas',
      porTitulo('Indicadores Financeiros (Saúde Financeira)')?.closest('.rounded-2xl'),
    );
    marcar('status', porTitulo('Status Saúde Financeira')?.closest('.rounded-2xl'));
    marcar('risco', porTitulo('Gestão de Risco')?.closest('.rounded-2xl'));
    marcar('dados', porTitulo('Dados Econômicos')?.closest('.rounded-2xl'));
    const cliente = Array.from(raiz.querySelectorAll('p')).find(
      (p) => p.textContent?.trim() === 'Data do diagnóstico',
    );
    marcar('cliente', cliente?.closest('.rounded-2xl'));
    marcar('pl', raiz.querySelector('button[aria-controls="saude-bloco-balanco"]'));
    return achados;
  });
}

/** aria-label/title com número em R$ (o mascarar deixa "R$ •••••"). */
async function atributosComValor(page: Page, escopo: string): Promise<string[]> {
  return page.evaluate((escopo) => {
    const raiz = document.querySelector(escopo) ?? document.body;
    const valores: string[] = [];
    for (const el of [raiz, ...Array.from(raiz.querySelectorAll('*'))]) {
      for (const attr of ['aria-label', 'title']) {
        const v = el.getAttribute(attr);
        if (v && /R\$\s?-?\d/.test(v)) valores.push(v);
      }
    }
    return valores;
  }, escopo);
}

const alturas = (page: Page, seletor: string) =>
  page
    .locator(seletor)
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));

/** Texto (innerText) de cada bloco que fica igual com o olho fechado. */
const textoDe = (page: Page, escopo: string) => page.locator(escopo).innerText();

interface Leitura {
  numeros: Record<string, string[]>;
  alturas: Record<string, number[]>;
  textosFixos: Record<string, string>;
  largura: number;
}

async function lerAberto(
  page: Page,
  blocos: string[],
  linhas: Record<string, string>,
  fixos: string[],
): Promise<Leitura> {
  const numeros: Record<string, string[]> = {};
  for (const b of blocos) numeros[b] = await coletarNumerosDaPosicao(page, bloco(b), OPCOES);
  const alt: Record<string, number[]> = {};
  for (const [nome, seletor] of Object.entries(linhas)) alt[nome] = await alturas(page, seletor);
  const textosFixos: Record<string, string> = {};
  for (const b of fixos) textosFixos[b] = await textoDe(page, bloco(b));
  return {
    numeros,
    alturas: alt,
    textosFixos,
    largura: (await tamanhoDoDocumento(page)).largura,
  };
}

async function conferirFechado(
  page: Page,
  blocos: string[],
  linhas: Record<string, string>,
  aberto: Leitura,
) {
  for (const b of blocos) {
    expect(await coletarValoresExpostos(page, bloco(b)), `R$ no bloco ${b}`).toEqual([]);
    await expectNumerosAusentes(page, aberto.numeros[b], bloco(b), OPCOES);
    expect(await atributosComValor(page, bloco(b)), `atributos do bloco ${b}`).toEqual([]);
  }
  for (const [nome, seletor] of Object.entries(linhas)) {
    expect(await alturas(page, seletor), `altura das linhas: ${nome}`).toEqual(
      aberto.alturas[nome],
    );
  }
  // Índices, %, status, idades e mercado: o texto do bloco não muda.
  for (const [b, texto] of Object.entries(aberto.textosFixos)) {
    expect(await textoDe(page, bloco(b)), `bloco ${b} igual`).toBe(texto);
  }
  expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(aberto.largura);
}

test.describe('esconder valores — Saúde Financeira, painel (desktop 1280)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('fluxo, metas, seguros e tooltip sem valores; índices e mercado ficam', async ({ page }) => {
    const { escritas } = await abrir(page);
    await expect(page.getByText('Seguro de vida').first()).toBeVisible({ timeout: 30_000 });
    const blocos = await marcarBlocos(page);
    expect(blocos).toEqual(
      expect.arrayContaining(['fluxo', 'metas', 'status', 'risco', 'dados', 'cliente']),
    );
    // Olho aberto: os valores da fixture aparecem (renda compacta, custo do seguro).
    expect((await coletarValoresExpostos(page, bloco('fluxo'))).map((v) => v.trim())).toContain(
      'R$ 12 K',
    );
    expect(await coletarNumerosDaPosicao(page, bloco('risco'), OPCOES)).toContain('2.345,61');

    const linhas = {
      seguros: `${bloco('risco')} table tr`,
      metas: `${bloco('metas')} .space-y-5 > div`,
      fluxo: `${bloco('fluxo')} .grid > div`,
    };
    const fixos = ['status', 'dados', 'cliente'];
    const aberto = await lerAberto(page, blocos, linhas, fixos);

    await alternarOlho(page, true);
    await expect(page.locator(`${bloco('metas')} .mf-sensivel`)).toHaveCount(8);
    await expect(page.locator(`${bloco('risco')} table .mf-sensivel`)).toHaveCount(3);
    await conferirFechado(page, blocos, linhas, aberto);
    await expect(page.getByText('Nesta tela os valores ainda aparecem.')).toHaveCount(0);

    // Tooltip da bolha: nome fica, custo anual vira pílula.
    const bolha = page.locator(`${bloco('risco')} .apexcharts-series path`).first();
    await expect(bolha).toBeVisible({ timeout: 30_000 });
    await bolha.hover({ force: true });
    const tooltip = page.locator(`${bloco('risco')} .apexcharts-tooltip.apexcharts-active`);
    await expect(tooltip).toBeVisible({ timeout: 10_000 });
    await expect(tooltip.locator('.mf-pilula-grafico')).toHaveCount(1);
    await expect(tooltip).toContainText('Custo anual:');
    expect(await coletarValoresExpostos(page, bloco('risco'))).toEqual([]);

    // Formulários visíveis (decisão 3): o campo mostra o número.
    await page.getByRole('button', { name: 'Personalizar' }).click();
    await expect(page.locator('#cfg-reserva')).toHaveValue('3');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await page
      .locator(`${bloco('risco')} table`)
      .getByRole('button', { name: 'editar' })
      .first()
      .click();
    await expect(page.locator('#seguro-custo')).toHaveValue('2345.61');
    await expect(page.locator('#seguro-capital')).toHaveValue('765432.19');
    if (!process.env.CI) {
      await page.screenshot({
        path: 'test-results/valores-ocultos-saude-painel-desktop.png',
        fullPage: true,
      });
    }
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // Reabre: os números voltam.
    await alternarOlho(page, false);
    await expect(page.locator(`${bloco('metas')} .mf-sensivel`)).toHaveCount(0);
    expect(await coletarNumerosDaPosicao(page, bloco('metas'), OPCOES)).toEqual(
      aberto.numeros.metas,
    );
    expect(escritas).toEqual([]);
  });
});

test.describe('esconder valores — Saúde Financeira, painel (celular 390)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('grade do fluxo, resumo do Balanço, metas e status sem valores', async ({ page }) => {
    const { escritas } = await abrir(page);
    // Abre os blocos recolhidos (Dados Econômicos e Gestão de Risco desta fatia).
    for (const id of ['saude-bloco-dados', 'saude-bloco-seguros']) {
      const botao = page.locator(`button[data-mf-mobile][aria-controls="${id}"]`);
      if ((await botao.getAttribute('aria-expanded')) === 'false') await botao.click();
    }
    const blocos = await marcarBlocos(page);
    expect(blocos).toEqual(expect.arrayContaining(['fluxo', 'metas', 'status', 'pl', 'dados']));
    expect(await coletarValoresExpostos(page, bloco('pl'))).not.toEqual([]);

    const linhas = {
      grade: `${bloco('fluxo')} dl > div`,
      metas: `${bloco('metas')} .space-y-5 > div`,
      pl: bloco('pl'),
    };
    const verificados = blocos.filter((b) => b !== 'risco');
    const aberto = await lerAberto(page, verificados, linhas, ['status', 'dados']);

    await alternarOlho(page, true);
    await expect(page.locator(`${bloco('pl')} .mf-sensivel--curto`)).toHaveCount(1);
    await expect(page.locator(`${bloco('fluxo')} dl .mf-sensivel`)).toHaveCount(3);
    await conferirFechado(page, verificados, linhas, aberto);
    if (!process.env.CI) {
      await page.screenshot({
        path: 'test-results/valores-ocultos-saude-painel-390.png',
        fullPage: true,
      });
    }
    expect(escritas).toEqual([]);
  });
});
