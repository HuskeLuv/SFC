import { test, expect, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { mockarConexoes, SENTINELAS_CONEXOES } from './helpers/conexoes';

/**
 * Esconder valores — Fase 5, fatia 3: Conexões bancárias (/conexoes-bancarias). Cartão do banco
 * (saldos, fatura e limite), extrato (cartão no computador, sheet no celular), Caixa de entrada
 * (tabela no computador, ?caixa=1 e o sheet da linha no celular), investimentos e empréstimos
 * importados e a revisão de destinos (tabela, cartões e o sheet "Onde … vai entrar").
 *
 * Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). A integração Pluggy fica
 * desligada no CI/dev: todo o /api/pluggy/* é respondido por `mockarConexoes` (helpers/conexoes)
 * e nenhuma escrita chega ao servidor (`escritas` tem de ficar vazio).
 *
 * Com o olho fechado: nenhum R$ e nenhum número lido com o olho aberto pode sobrar; nomes, datas,
 * CET, parcelas e contagens ficam; nenhuma linha cresce e o documento não alarga.
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

const ROUTE = '/conexoes-bancarias';
const CONTEUDO = '[data-mf-content]';
const DIALOGO = '[role="dialog"]';
const OPCOES = { ignorarPercentuais: true } as const;
const REVISAO = 'Confira onde seus investimentos entraram';
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SENTINELAS_TELA = Object.values(SENTINELAS_CONEXOES).map(brl);
const QA_DIR = process.env.VALORES_OCULTOS_QA_DIR;

async function abrir(page: Page, { caixa = false }: { caixa?: boolean } = {}) {
  const mock = await mockarConexoes(page, { comDestinos: true });
  await page.goto(caixa ? `${ROUTE}?caixa=1` : ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(
    caixa
      ? page.getByRole('button', { name: /Conexões/ }).first()
      : page.getByRole('heading', { name: 'Investimentos e empréstimos do banco' }),
  ).toBeVisible({ timeout: 60_000 });
  // O provider montou (o clique no olho antes da hidratação não faz nada).
  await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
  return mock;
}

/** aria-label/title com número em R$ (o mascarar deixa "R$ •••••"). */
async function atributosComValor(page: Page, escopo: string): Promise<string[]> {
  return page.evaluate((escopo) => {
    const valores: string[] = [];
    for (const raiz of Array.from(document.querySelectorAll(escopo))) {
      for (const el of [raiz, ...Array.from(raiz.querySelectorAll('*'))]) {
        for (const attr of ['aria-label', 'title']) {
          const v = el.getAttribute(attr);
          if (v && /(?:R\$\s?-?\d|\d{1,3}(?:\.\d{3})+,\d{2})/.test(v)) valores.push(v);
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

/** Alturas depois de o layout assentar (duas medidas iguais seguidas). */
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

/** Nada de R$, de número da posição nem de sentinela no escopo (olho fechado). */
async function conferirEscondido(page: Page, escopo: string, numeros: readonly string[]) {
  await expect(page.locator(`${escopo} .mf-sensivel`).first()).toBeVisible();
  expect(await coletarValoresExpostos(page, escopo)).toEqual([]);
  await expectNumerosAusentes(page, numeros, escopo, OPCOES);
  await expectNumerosAusentes(page, SENTINELAS_TELA, escopo, OPCOES);
  expect(await atributosComValor(page, escopo)).toEqual([]);
}

/**
 * Fecha o olho e confere o escopo: nada exposto, alturas das `linhas` IGUAIS (decisão 6: nem
 * cresce nem encolhe) e documento sem alargar. Reabre o olho e confere que os números voltam.
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
  const antes = await tamanhoDoDocumento(page);
  expect(alturasAntes.length).toBeGreaterThan(0);

  await alternarOlho(page, true);
  await conferirEscondido(page, CONTEUDO, numeros);
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

/** Screenshots de QA (só local, com VALORES_OCULTOS_QA_DIR): claro e escuro. */
async function capturar(page: Page, nome: string) {
  await page.screenshot({ path: `${QA_DIR}/dev-3-${nome}-claro.png`, fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: `${QA_DIR}/dev-3-${nome}-escuro.png`, fullPage: true });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
}

const S = SENTINELAS_CONEXOES;

test.describe('esconder valores — Conexões bancárias (computador 1280)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('cartão do banco, extrato, caixa de entrada e carteira importada', async ({ page }) => {
    const { escritas } = await abrir(page);
    await page.getByRole('button', { name: 'Ver extrato' }).first().click();
    await expect(page.getByRole('table', { name: 'Extrato de Conta corrente' })).toBeVisible();

    await conferirOlhoFechado(
      page,
      `${CONTEUDO} table tr, ${CONTEUDO} li`,
      [
        brl(S.saldoCorrente),
        brl(S.saldoPoupanca),
        brl(S.faturaCartao),
        brl(S.limiteCartao),
        brl(S.salario),
        brl(S.mercado),
        brl(S.pix),
        brl(S.emprestimoContratado),
        brl(S.emprestimoSaldo),
        '11.235,00',
      ],
      '1280',
    );
    // CET e parcelas do empréstimo: mercado/contagem, ficam.
    await alternarOlho(page, true);
    await expect(page.getByText('CET 2.1% a.a.', { exact: false })).toBeVisible();
    await expect(page.getByRole('cell', { name: '10/36' })).toBeVisible();
    await expect(page.getByText('Cartão Black').first()).toBeVisible();
    await alternarOlho(page, false);
    expect(escritas).toEqual([]);
  });

  test('revisão de destinos: o saldo de cada investimento vira pílula', async ({ page }) => {
    const { escritas } = await abrir(page);
    await page.getByRole('button', { name: 'Conferir destinos (4)' }).click();
    const dialogo = page.getByRole('dialog').filter({ hasText: REVISAO });
    await expect(dialogo.getByText('KNCA11').first()).toBeVisible();
    const numeros = await coletarNumerosDaPosicao(page, DIALOGO, OPCOES);
    expect(numeros).toEqual(expect.arrayContaining(['11.235,00', '9.580,00']));
    const linhas = `${DIALOGO} table tbody tr`;
    const alturasAntes = await alturas(page, linhas);
    await dialogo.getByRole('button', { name: 'Fechar e conferir depois' }).click();
    await expect(dialogo).toBeHidden();

    await alternarOlho(page, true);
    await page.getByRole('button', { name: 'Conferir destinos (4)' }).click();
    await expect(dialogo.getByText('KNCA11').first()).toBeVisible();
    await conferirEscondido(page, DIALOGO, numeros);
    const alturasDepois = await alturas(page, linhas);
    expect(alturasDepois).toHaveLength(alturasAntes.length);
    alturasDepois.forEach((h, i) => expect(h, `linha ${i}`).toBeLessThanOrEqual(alturasAntes[i]));
    if (QA_DIR && !process.env.CI) await capturar(page, 'destinos-1280');
    await dialogo.getByRole('button', { name: 'Fechar e conferir depois' }).click();
    await alternarOlho(page, false);
    expect(escritas).toEqual([]);
  });
});

for (const largura of [390, 320] as const) {
  test.describe(`esconder valores — Conexões bancárias (celular ${largura})`, () => {
    test.use({
      viewport: { width: largura, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    test('cartão do banco, resumo da caixa, carteira importada e o extrato em sheet', async ({
      page,
    }) => {
      const { escritas } = await abrir(page);
      await expect(page.locator('[data-conexao-card]')).toBeVisible();
      await conferirOlhoFechado(
        page,
        `${CONTEUDO} [data-conexao-card] li, ${CONTEUDO} li`,
        [
          brl(S.saldoCorrente),
          brl(S.faturaCartao),
          brl(S.limiteCartao),
          brl(S.emprestimoSaldo),
          '11.235,00',
        ],
        `${largura}`,
      );

      // Extrato em sheet (olho aberto → números; fechado → nada).
      await page.getByRole('button', { name: 'Ver extrato de Conta corrente' }).click();
      const sheet = page.getByRole('dialog').filter({ hasText: 'Extrato · Conta corrente' });
      await expect(sheet.getByText('Supermercado Exemplo')).toBeVisible();
      const numeros = await coletarNumerosDaPosicao(page, DIALOGO, OPCOES);
      expect(numeros).toEqual(expect.arrayContaining([brl(S.salario), brl(S.mercado)]));
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await alternarOlho(page, true);
      await page.getByRole('button', { name: 'Ver extrato de Conta corrente' }).click();
      await expect(sheet.getByText('Supermercado Exemplo')).toBeVisible();
      await conferirEscondido(page, DIALOGO, numeros);
      if (QA_DIR && !process.env.CI) await capturar(page, `extrato-${largura}`);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await alternarOlho(page, false);
      expect(escritas).toEqual([]);
    });

    test('caixa de entrada (?caixa=1) e o sheet da linha do fluxo', async ({ page }) => {
      const { escritas } = await abrir(page, { caixa: true });
      await expect(page.getByText('Supermercado Exemplo')).toBeVisible();
      await conferirOlhoFechado(
        page,
        `${CONTEUDO} li`,
        [brl(S.salario), brl(S.mercado), brl(S.pix)],
        `caixa-${largura}`,
      );

      await alternarOlho(page, true);
      await page.getByRole('button', { name: /^Linha para Supermercado/ }).click();
      const sheet = page.getByRole('dialog').filter({ hasText: 'Linha do fluxo de caixa' });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText(/Supermercado Exemplo · −/)).toBeVisible();
      await conferirEscondido(page, DIALOGO, [brl(S.mercado)]);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await alternarOlho(page, false);
      expect(escritas).toEqual([]);
    });

    test('revisão de destinos: cartões e o sheet "Onde … vai entrar"', async ({ page }) => {
      const { escritas } = await abrir(page);
      await alternarOlho(page, true);
      await page.getByRole('button', { name: 'Conferir destinos (4)' }).click();
      const dialogo = page.getByRole('dialog').filter({ hasText: REVISAO });
      await expect(dialogo.getByText('KNCA11').first()).toBeVisible();
      await conferirEscondido(page, DIALOGO, ['11.235,00', '9.580,00']);
      if (QA_DIR && !process.env.CI) await capturar(page, `destinos-${largura}`);

      await dialogo
        .getByRole('button', { name: /^Trocar destino de / })
        .first()
        .click();
      const sheet = page.getByRole('dialog').filter({ hasText: /vai entrar/ });
      await expect(sheet.first()).toBeVisible();
      await conferirEscondido(page, DIALOGO, ['11.235,00', '9.580,00']);
      expect(escritas).toEqual([]);
    });
  });
}
