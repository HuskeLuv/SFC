import { test, expect, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { ID_HISTORICO, mockarHistorico, SENTINELAS_HISTORICO } from './helpers/historico';

/**
 * Esconder valores — Fase 6, fatia 1: Histórico de alterações (/historico-alteracoes). Antes →
 * depois em dinheiro e quantidade no resumo da linha/cartão, nos Detalhes e no sheet do Desfazer
 * (celular) viram pílula; percentual, datas, nomes e seções ficam. O Desfazer continua: o POST
 * /undo só leva o id (nunca uma pílula).
 *
 * Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). O seed não grava histórico:
 * tudo vem de `mockarHistorico` (helpers/historico) e nenhuma escrita chega ao servidor.
 *
 * Com o olho fechado: nenhum R$ e nenhum número lido com o olho aberto pode sobrar; nenhuma linha
 * muda de altura (a pílula guarda a largura do valor) e o documento não alarga.
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

const ROUTE = '/historico-alteracoes';
const CONTEUDO = '[data-mf-content]';
const DIALOGO = '[role="alertdialog"]';
const OPCOES = { ignorarPercentuais: true } as const;
const QA_DIR = process.env.VALORES_OCULTOS_QA_DIR;
const S = SENTINELAS_HISTORICO;
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Os 8 números do resumo (2 campos por alteração; 142,5 tem uma casa e o regex não pega). */
const NUMEROS_RESUMO = [
  brl(S.quantidadeAntes),
  brl(S.precoAntes),
  brl(S.precoDepois),
  brl(S.fluxoAntes),
  brl(S.fluxoDepois),
  brl(S.saldoDividaAntes),
  brl(S.saldoDividaDepois),
  brl(S.rendaAposentadoria),
];

async function abrir(page: Page) {
  const mock = await mockarHistorico(page);
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-historico-lista]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
  return mock;
}

/** aria-label/title com número em R$ ou em pt-BR com centavos. */
async function atributosComValor(page: Page, escopo: string): Promise<string[]> {
  return page.evaluate((escopo) => {
    const valores: string[] = [];
    for (const raiz of Array.from(document.querySelectorAll(escopo))) {
      for (const el of [raiz, ...Array.from(raiz.querySelectorAll('*'))]) {
        for (const attr of ['aria-label', 'title']) {
          const v = el.getAttribute(attr);
          if (v && /(?:R\$\s?-?\d|\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})/.test(v)) valores.push(v);
        }
      }
    }
    return valores;
  }, escopo);
}

async function alturas(page: Page, seletor: string): Promise<number[]> {
  return page
    .locator(seletor)
    .filter({ visible: true })
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
}

async function alturasEstaveis(page: Page, seletor: string): Promise<number[]> {
  let anterior: number[] = [];
  await expect
    .poll(async () => {
      const atual = await alturas(page, seletor);
      const igual = JSON.stringify(atual) === JSON.stringify(anterior);
      anterior = atual;
      return igual;
    })
    .toBe(true);
  return anterior;
}

async function conferirEscondido(page: Page, escopo: string, numeros: readonly string[]) {
  await expect(
    page.locator(`${escopo} .mf-sensivel`).filter({ visible: true }).first(),
  ).toBeVisible();
  expect(await coletarValoresExpostos(page, escopo)).toEqual([]);
  await expectNumerosAusentes(page, numeros, escopo, OPCOES);
  expect(await atributosComValor(page, escopo)).toEqual([]);
}

async function capturar(page: Page, nome: string) {
  await page.screenshot({ path: `${QA_DIR}/dev-1-${nome}-claro.png`, fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: `${QA_DIR}/dev-1-${nome}-escuro.png`, fullPage: true });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
}

/**
 * Lê os números com o olho aberto, fecha o olho e confere: nada exposto, alturas das `linhas`
 * iguais, documento sem alargar e sem crescer. Reabre e confere que os números voltam.
 */
async function conferirOlhoFechado(
  page: Page,
  linhas: string,
  esperados: readonly string[],
  qa?: string,
) {
  const numeros = await coletarNumerosDaPosicao(page, CONTEUDO, OPCOES);
  expect(numeros).toEqual(expect.arrayContaining([...esperados]));
  const alturasAntes = await alturasEstaveis(page, linhas);
  expect(alturasAntes.length).toBeGreaterThan(0);
  const antes = await tamanhoDoDocumento(page);

  await alternarOlho(page, true);
  await conferirEscondido(page, CONTEUDO, numeros);
  // Percentual, datas e nomes continuam.
  await expect(
    page.locator(CONTEUDO).getByText('PETR4').filter({ visible: true }).first(),
  ).toBeVisible();
  await expect
    .poll(() => alturas(page, linhas), { message: 'alturas das linhas' })
    .toEqual(alturasAntes);
  const depois = await tamanhoDoDocumento(page);
  expect(depois.largura).toBeLessThanOrEqual(antes.largura);
  expect(depois.altura, 'altura do documento').toBe(antes.altura);
  if (qa && QA_DIR && !process.env.CI) await capturar(page, qa);

  await alternarOlho(page, false);
  await expect(page.locator(`${CONTEUDO} .mf-sensivel`)).toHaveCount(0);
  expect((await coletarNumerosDaPosicao(page, CONTEUDO, OPCOES)).sort()).toEqual(
    [...numeros].sort(),
  );
}

test.describe('esconder valores — Histórico de alterações (computador 1280)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('resumo e Detalhes com pílula; o Desfazer manda só o id', async ({ page }) => {
    const { escritas } = await abrir(page);
    const linhas = `${CONTEUDO} table tbody tr`;
    await conferirOlhoFechado(page, linhas, NUMEROS_RESUMO, 'historico-1280');
    expect(await coletarNumerosDaPosicao(page, CONTEUDO, OPCOES)).toHaveLength(8);

    // Detalhes (lista completa): quantidade e total investido também.
    const tabela = page.locator(`${CONTEUDO} table`);
    await tabela.getByRole('button', { name: 'Detalhes' }).first().click();
    await expect(tabela.getByText('Total investido:')).toBeVisible();
    await conferirOlhoFechado(page, linhas, [brl(S.totalAntes), brl(S.totalDepois)]);

    // Desfazer com o olho fechado: o confirm do navegador e o POST só com o id.
    await alternarOlho(page, true);
    page.once('dialog', (d) => d.accept());
    await tabela.getByRole('button', { name: 'Desfazer' }).first().click();
    await expect.poll(() => escritas.length).toBe(1);
    expect(escritas[0]).toEqual({
      metodo: 'POST',
      pathname: `/api/historico-alteracoes/${ID_HISTORICO.ativo}/undo`,
    });
    await alternarOlho(page, false);
  });
});

for (const largura of [390, 320] as const) {
  test.describe(`esconder valores — Histórico de alterações (celular ${largura})`, () => {
    test.use({
      viewport: { width: largura, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    test('cartões, Detalhes e o sheet do Desfazer', async ({ page }) => {
      const { escritas } = await abrir(page);
      const cartoes = `${CONTEUDO} [data-historico-card]`;
      await conferirOlhoFechado(page, cartoes, NUMEROS_RESUMO, `historico-${largura}`);

      const primeiro = page.locator(cartoes).first();
      await primeiro.getByRole('button', { name: 'Detalhes' }).click();
      await expect(primeiro.getByText('Total investido:')).toBeVisible();
      await conferirOlhoFechado(page, cartoes, [brl(S.totalAntes), brl(S.totalDepois)]);

      // Sheet do Desfazer: "Preço médio volta para ▬▬".
      await primeiro.getByRole('button', { name: 'Desfazer' }).click();
      const sheet = page.getByRole('alertdialog');
      await expect(sheet.getByText(/Preço médio volta para/)).toBeVisible();
      const numerosSheet = await coletarNumerosDaPosicao(page, DIALOGO, OPCOES);
      expect(numerosSheet).toEqual(
        expect.arrayContaining([brl(S.quantidadeAntes), brl(S.precoAntes), brl(S.totalAntes)]),
      );
      await sheet.getByRole('button', { name: 'Cancelar' }).click();
      await expect(sheet).toBeHidden();

      await alternarOlho(page, true);
      await primeiro.getByRole('button', { name: 'Desfazer' }).click();
      await expect(sheet.getByText(/Preço médio volta para/)).toBeVisible();
      await conferirEscondido(page, DIALOGO, numerosSheet);
      if (QA_DIR && !process.env.CI) await capturar(page, `historico-desfazer-${largura}`);
      await sheet.getByRole('button', { name: 'Desfazer' }).click();
      await expect.poll(() => escritas.length).toBe(1);
      expect(escritas[0]).toEqual({
        metodo: 'POST',
        pathname: `/api/historico-alteracoes/${ID_HISTORICO.ativo}/undo`,
      });
      await alternarOlho(page, false);
    });
  });
}
