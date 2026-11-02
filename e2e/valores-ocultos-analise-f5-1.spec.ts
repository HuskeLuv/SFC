import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';

/**
 * Esconder valores — Fase 5, fatia 1: Análise de Ativos. O que é do USUÁRIO some (card "Na sua
 * carteira", modal "Ver na Carteira", resumo do "Registrar operação", chip "Na carteira" do
 * Quadro); o que é de MERCADO fica (cotação do cabeçalho, KPIs, fundamentos). Exige o app com
 * VALORES_OCULTOS_HABILITADO=true e a Análise de Ativos ligada (job e2e do CI) e a posição do demo
 * em MXRF11 (seed). SÓ LEITURA: os modais são fechados sem gravar; o POST do olho só grava o
 * cookie do aparelho.
 *
 * Quantidades inteiras < 1000 (350 cotas) escapam do regex de números: conferidas por localizador
 * (a célula tem a pílula).
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
      // sem storage: o aviso de cookies aparece e o teste falha de forma visível
    }
  });
});

const CARD = 'section[data-na-carteira]';
const DIALOGO = '[role="dialog"]';
const OPCOES = { ignorarPercentuais: true } as const;
const FAIXA = 'Nesta tela os valores ainda aparecem.';

async function areaLigada(page: Page): Promise<boolean> {
  const res = await page.request.get('/api/analise-ativos/config');
  return res.ok() && ((await res.json()) as { habilitada?: boolean }).habilitada === true;
}

async function abrirAtivo(page: Page, ticker: string) {
  await page.goto(`/analise-ativos/${ticker}`, { waitUntil: 'load' });
  await expect(page.locator(`[data-pagina-ativo="${ticker}"]`)).toBeVisible({ timeout: 90_000 });
  // O provider montou (o clique no olho antes da hidratação não faz nada).
  await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
}

/** aria-label/title com número em R$ (o mascarar deixa "R$ •••••"). */
async function atributosComValor(page: Page, escopo: string): Promise<string[]> {
  return page.evaluate((escopo) => {
    const valores: string[] = [];
    for (const raiz of Array.from(document.querySelectorAll(escopo))) {
      for (const el of [raiz, ...Array.from(raiz.querySelectorAll('*'))]) {
        for (const attr of ['aria-label', 'title']) {
          const v = el.getAttribute(attr);
          if (v && /(?:R|US)\$\s?-?\d/.test(v)) valores.push(v);
        }
      }
    }
    return valores;
  }, escopo);
}

const alturas = (linhas: Locator) =>
  linhas.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));

/** Card "Na sua carteira" com posição; pula o teste se o demo não tem a posição no banco. */
async function cardComPosicao(page: Page, ticker: string): Promise<Locator> {
  test.skip(!(await areaLigada(page)), 'Análise de Ativos desligada ou demo fora do beta');
  await abrirAtivo(page, ticker);
  const card = page.locator(CARD);
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).not.toHaveAttribute('data-na-carteira', 'carregando', { timeout: 60_000 });
  const estado = await card.getAttribute('data-na-carteira');
  test.skip(estado !== 'posicao', `demo sem posição em ${ticker} (estado ${estado})`);
  // números carregados (sem skeleton)
  await expect(card.locator('dd .animate-pulse')).toHaveCount(0, { timeout: 60_000 });
  return card;
}

async function conferirCard(page: Page, card: Locator) {
  const numeros = await coletarNumerosDaPosicao(page, CARD, OPCOES);
  expect(numeros.length, 'o card mostra valores com o olho aberto').toBeGreaterThan(0);
  const dados = card.locator('dl > div');
  const alturasAntes = await alturas(dados);
  const antes = await tamanhoDoDocumento(page);
  const cabecalho = await page.locator('[data-bloco="cabecalho"]').innerText();
  const kpis = await page.locator('[data-kpi]').allInnerTexts();

  await alternarOlho(page, true);
  await expect(card.locator('.mf-sensivel').first()).toBeVisible();
  expect(await coletarValoresExpostos(page, CARD)).toEqual([]);
  await expectNumerosAusentes(page, numeros, CARD, OPCOES);
  expect(await atributosComValor(page, CARD)).toEqual([]);
  // quantidade (< 1000 escapa do regex): a célula tem a pílula curta
  await expect(
    card.locator('dl > div', { hasText: 'Quantidade' }).locator('.mf-sensivel--curto'),
  ).toHaveCount(1);
  // a tela é coberta: a faixa "ainda aparecem" não aparece
  await expect(page.getByText(FAIXA)).toHaveCount(0);
  // dado de MERCADO fica idêntico: cabeçalho (cotação) e KPIs
  expect(await page.locator('[data-bloco="cabecalho"]').innerText()).toBe(cabecalho);
  expect(cabecalho).toMatch(/R\$\s?\d/);
  expect(await page.locator('[data-kpi]').allInnerTexts()).toEqual(kpis);
  // altura das linhas igual; documento não alarga
  expect(await alturas(dados)).toEqual(alturasAntes);
  expect((await tamanhoDoDocumento(page)).largura).toBeLessThanOrEqual(antes.largura);
}

async function conferirVerNaCarteira(page: Page) {
  await page.getByRole('button', { name: 'Ver na Carteira' }).first().click();
  const dialogo = page.locator(DIALOGO);
  await expect(dialogo.locator('[data-ver-posicao]')).toBeVisible({ timeout: 60_000 });
  await expect(dialogo.locator('.mf-sensivel').first()).toBeVisible();
  expect(await coletarValoresExpostos(page, DIALOGO)).toEqual([]);
  expect(await atributosComValor(page, DIALOGO)).toEqual([]);
  const linhas = dialogo.locator('tbody tr');
  if ((await linhas.count()) > 0) {
    // quantidade, preço e total das operações em pílula; data e tipo ficam
    await expect(linhas.first().locator('.mf-sensivel')).toHaveCount(3);
    await expect(linhas.first()).toContainText(/\d{2}\/\d{2}\/\d{4}/);
  }
  if (!process.env.CI) {
    await dialogo.screenshot({ path: 'test-results/valores-ocultos-analise-ver-na-carteira.png' });
  }
  await page.keyboard.press('Escape');
  await expect(dialogo).toHaveCount(0);
}

async function conferirRegistrar(page: Page) {
  await page
    .getByRole('button', { name: /^Registrar operação/ })
    .first()
    .click();
  const dialogo = page.locator(DIALOGO);
  const campo = dialogo.getByLabel(/Quantidade/);
  await expect(campo).toBeVisible({ timeout: 30_000 });
  await campo.fill('3');
  // formulário (decisão 3): o campo mostra o número digitado
  await expect(campo).toHaveValue('3');
  await expect(dialogo.locator('[data-resumo-operacao] .mf-sensivel')).toHaveCount(3);
  expect(await coletarValoresExpostos(page, DIALOGO)).toEqual([]);
  // Fecha SEM registrar (só leitura).
  await page.keyboard.press('Escape');
  await expect(dialogo).toHaveCount(0);
}

test.describe('esconder valores — Análise de Ativos (desktop 1280)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('MXRF11: Na sua carteira, Ver na Carteira e Registrar sem valores; mercado fica', async ({
    page,
  }) => {
    const card = await cardComPosicao(page, 'MXRF11');
    await conferirCard(page, card);
    if (!process.env.CI) {
      await card.screenshot({ path: 'test-results/valores-ocultos-analise-card-desktop.png' });
    }
    await conferirVerNaCarteira(page);
    await conferirRegistrar(page);
    await alternarOlho(page, false);
    await expect(card.locator('.mf-sensivel')).toHaveCount(0);
  });

  test('WEGE3 (controle, só mercado): o cabeçalho e os KPIs não mudam', async ({ page }) => {
    test.skip(!(await areaLigada(page)), 'Análise de Ativos desligada ou demo fora do beta');
    await abrirAtivo(page, 'WEGE3');
    await expect(page.locator('[data-kpi]').first()).toBeVisible({ timeout: 60_000 });
    const cabecalho = await page.locator('[data-bloco="cabecalho"]').innerText();
    const kpis = await page.locator('[data-kpi]').allInnerTexts();
    await alternarOlho(page, true);
    expect(await page.locator('[data-bloco="cabecalho"]').innerText()).toBe(cabecalho);
    expect(await page.locator('[data-kpi]').allInnerTexts()).toEqual(kpis);
    await expect(page.locator('[data-bloco="cabecalho"] .mf-sensivel')).toHaveCount(0);
    await expect(page.locator('[data-kpi] .mf-sensivel')).toHaveCount(0);
    await expect(page.getByText(FAIXA)).toHaveCount(0);
    await alternarOlho(page, false);
  });

  test('Quadro "Na minha carteira": a quantidade do chip vira pílula, o % fica', async ({
    page,
  }) => {
    test.skip(!(await areaLigada(page)), 'Análise de Ativos desligada ou demo fora do beta');
    await page.goto('/analise-ativos?classe=fii&carteira=1', { waitUntil: 'load' });
    await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
    const chip = page.locator('[data-na-carteira="posicao"]').first();
    const temChip = await chip
      .waitFor({ timeout: 90_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!temChip, 'demo sem posição de FII no Quadro');
    // o chip nasce do overlay ("N na carteira") e ganha o "% da carteira" quando a aba carrega
    await expect(chip).toHaveText(/\d+,\d{2}%/, { timeout: 60_000 });
    const texto = await chip.innerText();
    await alternarOlho(page, true);
    await expect(chip.locator('.mf-sensivel--curto')).toHaveCount(1);
    // o % (mercado/alocação) fica
    expect(await chip.innerText()).toContain(texto.replace(/^.*·\s*/, ''));
    await alternarOlho(page, false);
    await expect(chip).toHaveText(texto);
  });
});

test.describe('esconder valores — Análise de Ativos (celular 390)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('MXRF11: Na sua carteira sem valores e sem rolagem lateral nova', async ({ page }) => {
    const card = await cardComPosicao(page, 'MXRF11');
    await card.scrollIntoViewIfNeeded();
    await conferirCard(page, card);
    if (!process.env.CI) {
      await card.screenshot({ path: 'test-results/valores-ocultos-analise-card-390.png' });
    }
    await alternarOlho(page, false);
  });
});
