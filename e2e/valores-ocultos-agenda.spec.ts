import { test, expect, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { mockarAgenda, SENTINELAS_AGENDA } from './helpers/agenda';

/**
 * Esconder valores — Fase 6, fatia 1: Agenda (/calendario). Resumo do período (painel do
 * computador e o resumo recolhível do celular), "Próximos 30 dias" e o detalhe do evento (valor,
 * juros, amortização, saldo devedor, valor bruto/líquido, valor aplicado) viram pílula; títulos,
 * datas, "14 de 360", taxa, indexador e contagens ficam. A grade e a lista do FullCalendar só
 * mostram títulos (sem valor).
 *
 * Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI). O seed não tem dívida e os
 * proventos dependem do mês: tudo vem de `mockarAgenda` (helpers/agenda), que monta os eventos a
 * partir de hoje dentro do período pedido; nenhuma escrita chega ao servidor.
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

const ROUTE = '/calendario';
const CONTEUDO = '[data-mf-content]';
const DIALOGO = '[role="dialog"]';
const OPCOES = { ignorarPercentuais: true } as const;
const QA_DIR = process.env.VALORES_OCULTOS_QA_DIR;
const S = SENTINELAS_AGENDA;
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function abrir(page: Page) {
  const mock = await mockarAgenda(page);
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.fc-daygrid-event, .fc-list-event').first()).toBeVisible({
    timeout: 60_000,
  });
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

/** Lê com o olho aberto, fecha e confere o escopo; alturas das linhas iguais; reabre. */
async function conferirOlhoFechado(
  page: Page,
  escopo: string,
  linhas: string,
  esperados: readonly string[],
  qa?: string,
) {
  const numeros = await coletarNumerosDaPosicao(page, escopo, OPCOES);
  expect(numeros.sort()).toEqual([...esperados].sort());
  const alturasAntes = await alturasEstaveis(page, linhas);
  expect(alturasAntes.length).toBeGreaterThan(0);
  const antes = await tamanhoDoDocumento(page);

  await alternarOlho(page, true);
  await conferirEscondido(page, escopo, numeros);
  await expect
    .poll(() => alturas(page, linhas), { message: 'alturas das linhas' })
    .toEqual(alturasAntes);
  const depois = await tamanhoDoDocumento(page);
  expect(depois.largura).toBeLessThanOrEqual(antes.largura);
  expect(depois.altura, 'altura do documento').toBe(antes.altura);
  if (qa && QA_DIR && !process.env.CI) await capturar(page, qa);

  await alternarOlho(page, false);
  await expect(page.locator(`${escopo} .mf-sensivel`)).toHaveCount(0);
  expect((await coletarNumerosDaPosicao(page, escopo, OPCOES)).sort()).toEqual([...numeros].sort());
}

/** Detalhe da parcela: o valor e as 3 linhas em R$ (juros, amortização e saldo). */
const NUMEROS_PARCELA = [brl(S.parcela), brl(S.juros), brl(S.amortizacao), brl(S.saldoDevedor)];
const PARCELA = 'Financiamento do apê · parcela 14/360';

async function conferirDetalheDaParcela(page: Page, abrirEvento: () => Promise<void>, qa: string) {
  await abrirEvento();
  const modal = page.getByRole('dialog').filter({ hasText: PARCELA });
  await expect(modal.getByText('Saldo devedor após pagar')).toBeVisible();
  const numeros = await coletarNumerosDaPosicao(page, DIALOGO, OPCOES);
  expect(numeros.sort()).toEqual([...NUMEROS_PARCELA].sort());
  await modal.getByText('Fechar', { exact: true }).click();
  await expect(modal).toBeHidden();

  await alternarOlho(page, true);
  await abrirEvento();
  await expect(modal.getByText('Saldo devedor após pagar')).toBeVisible();
  await conferirEscondido(page, DIALOGO, numeros);
  await expect(modal.getByText('14 de 360')).toBeVisible();
  await expect(modal.getByText('Banco E2E')).toBeVisible();
  if (QA_DIR && !process.env.CI) await capturar(page, qa);
  await modal.getByText('Fechar', { exact: true }).click();
  await expect(modal).toBeHidden();
  await alternarOlho(page, false);
}

test.describe('esconder valores — Agenda (computador 1280)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('resumo do período, próximos 30 dias e o detalhe do evento', async ({ page }) => {
    const { escritas } = await abrir(page);
    const painel = `${CONTEUDO} aside`;
    await expect(page.getByRole('heading', { name: 'Próximos 30 dias' })).toBeVisible();
    await expect(page.locator(painel).getByText('Vencendo (renda fixa)')).toBeVisible();
    const esperados = [brl(S.parcela), brl(S.proventoLiquido), brl(S.rfVencimento), brl(S.darf)];
    // "Já pago" só entra quando o período começa antes de hoje (o 1º dia do mês não é hoje).
    const numeros = await coletarNumerosDaPosicao(page, painel, OPCOES);
    if (numeros.includes(brl(S.parcelaPaga))) esperados.push(brl(S.parcelaPaga));
    await conferirOlhoFechado(page, painel, `${painel} li`, esperados, 'agenda-1280');
    // A grade só tem títulos: nada a esconder, e nada exposto com o olho fechado.
    await alternarOlho(page, true);
    expect(await coletarValoresExpostos(page, CONTEUDO)).toEqual([]);
    await expectNumerosAusentes(page, esperados, CONTEUDO, OPCOES);
    await expect(page.locator(painel).getByText('PETR4 · Dividendo')).toBeVisible();
    await alternarOlho(page, false);

    await conferirDetalheDaParcela(
      page,
      () =>
        page
          .locator(painel)
          .getByRole('button', { name: new RegExp(PARCELA) })
          .click(),
      'agenda-detalhe-1280',
    );
    expect(escritas).toEqual([]);
  });
});

for (const largura of [390, 320] as const) {
  test.describe(`esconder valores — Agenda (celular ${largura})`, () => {
    test.use({
      viewport: { width: largura, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    test('resumo recolhível, lista do mês e o detalhe do evento', async ({ page }) => {
      const { escritas } = await abrir(page);
      const resumo = page.getByRole('button', { name: /^Resumo do período/ });
      await expect(resumo).toBeVisible();
      // Fechado: só o "R$ … a pagar" do cabeçalho do resumo.
      await conferirOlhoFechado(
        page,
        CONTEUDO,
        `${CONTEUDO} .fc-list-event, ${CONTEUDO} [aria-controls="agenda-resumo-periodo"]`,
        [brl(S.parcela)],
        `agenda-${largura}`,
      );

      // Aberto: as linhas do resumo.
      await resumo.click();
      await expect(page.locator('#agenda-resumo-periodo').getByText('A receber')).toBeVisible();
      const esperados = [brl(S.parcela), brl(S.proventoLiquido), brl(S.rfVencimento), brl(S.darf)];
      const numeros = await coletarNumerosDaPosicao(page, '#agenda-resumo-periodo', OPCOES);
      if (numeros.includes(brl(S.parcelaPaga))) esperados.push(brl(S.parcelaPaga));
      await conferirOlhoFechado(
        page,
        '#agenda-resumo-periodo',
        '#agenda-resumo-periodo li',
        esperados,
        `agenda-resumo-${largura}`,
      );
      await resumo.click();

      await conferirDetalheDaParcela(
        page,
        () => page.locator('.fc-list-event').filter({ hasText: PARCELA }).click(),
        `agenda-detalhe-${largura}`,
      );
      expect(escritas).toEqual([]);
    });
  });
}
