import { test, expect, type Page } from '@playwright/test';
import {
  alternarOlho,
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import {
  abrirAssistente,
  mockarAssistente,
  RESPOSTA_ASSISTENTE,
  SENTINELAS_ASSISTENTE,
} from './helpers/assistente';
import { mockarNotificacoes, SENTINELAS_NOTIFICACOES } from './helpers/notificacoes';

/**
 * Esconder valores — Fase 6, fatia 2: Assistente de IA, Perfil e o sino de notificações.
 *
 * - Assistente (decisão 14): com o olho fechado aparece SÓ um aviso fixo no painel; a resposta da
 *   IA e o cartão de proposta continuam com os valores (as sentinelas ficam no innerText). Com o
 *   olho aberto, nada de aviso. Todo /api/assistente* é mockado (helpers/assistente): nunca a API
 *   real, e as escritas não chegam ao servidor.
 * - Sino (decisão 13): os R$ do título e da mensagem viram pílula com o olho fechado, no rodapé
 *   da sidebar (computador) e no MobileHeader (celular). O escopo é o próprio painel do dropdown
 *   — nada aqui depende de [data-mf-cobre-ocultos], que sai no fechamento da fase.
 * - /profile: não mostra dinheiro (0 números com o olho aberto e fechado).
 *
 * Exige o app com VALORES_OCULTOS_HABILITADO=true (job e2e do CI).
 */

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // O overlay do React Query Devtools (dev) cobre o botão flutuante do assistente.
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

const ROUTE = '/profile';
const CONTEUDO = '[data-mf-content]';
const PAINEL_ASSISTENTE = '[role="dialog"][aria-label="Assistente My Finance"]';
/** O painel aberto do sino (o Dropdown só existe aberto; o h5 "Notificações" é dele). */
const PAINEL_SINO = 'div.shadow-theme-lg:has(h5)';
const AVISO = 'Com o olho fechado, as respostas do assistente ainda podem mostrar valores.';
const OPCOES = { ignorarPercentuais: true } as const;
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QA_DIR = process.env.VALORES_OCULTOS_QA_DIR;

async function abrir(page: Page) {
  const assistente = await mockarAssistente(page);
  const notificacoes = await mockarNotificacoes(page);
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Perfil' }).first()).toBeVisible({
    timeout: 60_000,
  });
  // O provider montou (o clique no olho antes da hidratação não faz nada).
  await expect(page.locator('[data-mf-anuncio-valores]')).toBeAttached({ timeout: 60_000 });
  return { assistente, notificacoes };
}

/** aria-label/title com número em R$ ou valor pt-BR com centavos. */
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

async function screenshot(page: Page, nome: string) {
  if (!QA_DIR) return;
  await page.screenshot({ path: `${QA_DIR}/dev-2-${nome}.png` });
}

async function conferirPerfil(page: Page, qa: string) {
  // Olho aberto: o perfil não mostra dinheiro.
  expect(await coletarValoresExpostos(page, CONTEUDO)).toEqual([]);
  expect(await coletarNumerosDaPosicao(page, CONTEUDO, OPCOES)).toEqual([]);
  const tamanho = await tamanhoDoDocumento(page);
  await alternarOlho(page, true);
  expect(await coletarValoresExpostos(page, CONTEUDO)).toEqual([]);
  expect(await coletarNumerosDaPosicao(page, CONTEUDO, OPCOES)).toEqual([]);
  expect(await atributosComValor(page, CONTEUDO)).toEqual([]);
  // Nada vira pílula (não há valor), então o documento não muda de tamanho.
  await expect(page.locator(`${CONTEUDO} .mf-sensivel`)).toHaveCount(0);
  expect((await tamanhoDoDocumento(page)).largura).toBe(tamanho.largura);
  await screenshot(page, `perfil-${qa}-fechado`);
  await alternarOlho(page, false);
}

async function conferirAssistente(page: Page, escritas: { pathname: string }[], qa: string) {
  const painel = await abrirAssistente(page);
  await painel.getByPlaceholder('Escreva sua pergunta…').fill('Quanto gastei em outubro?');
  // Enter no campo envia (no celular o clique em "Enviar" pode cair no indicador do Next em dev).
  await painel.getByPlaceholder('Escreva sua pergunta…').press('Enter');
  await expect(painel.getByText(/Em outubro você gastou/)).toBeVisible();

  // Olho aberto: sem aviso; as sentinelas estão no painel.
  await expect(painel.getByText(AVISO)).toHaveCount(0);
  const aberto = await coletarValoresExpostos(page, PAINEL_ASSISTENTE);
  expect(aberto.map((v) => v.trim())).toEqual(
    expect.arrayContaining(['R$ 4.567,89', 'R$ 1.357,91']),
  );
  const alturaAberto = (await painel.boundingBox())?.height;
  await screenshot(page, `assistente-${qa}-aberto`);

  // Olho fechado: o aviso aparece e NADA do painel é mascarado (decisão 14).
  await alternarOlho(page, true);
  const aviso = painel.getByRole('note');
  await expect(aviso).toHaveText(AVISO);
  await expect(painel.locator('.mf-sensivel')).toHaveCount(0);
  // Os mesmos R$ de olho aberto continuam lá (resposta e cartão de proposta).
  expect(await coletarValoresExpostos(page, PAINEL_ASSISTENTE)).toEqual(aberto);
  const texto = await painel.innerText();
  expect(texto).toContain(RESPOSTA_ASSISTENTE);
  for (const v of Object.values(SENTINELAS_ASSISTENTE)) {
    if (v !== SENTINELAS_ASSISTENTE.totalAno) expect(texto).toContain(brl(v));
  }
  // O painel tem altura fixa: o aviso não o faz crescer.
  expect((await painel.boundingBox())?.height).toBe(alturaAberto);
  await screenshot(page, `assistente-${qa}-fechado`);

  // Olho aberto de novo: o aviso some.
  await alternarOlho(page, false);
  await expect(painel.getByText(AVISO)).toHaveCount(0);

  // Só a pergunta foi "enviada" — ao mock, nunca à API real; nada foi confirmado.
  expect(escritas.map((e) => e.pathname)).toEqual(['/api/assistente']);
  await page.getByRole('button', { name: 'Fechar assistente' }).click();
}

async function conferirSino(page: Page, escritasSino: { metodo: string }[], qa: string) {
  const sino = page.getByRole('button', { name: 'Abrir notificações' }).filter({ visible: true });
  await sino.click();
  const painel = page.locator(PAINEL_SINO);
  await expect(painel.getByText('Orçamento de Habitação estourado')).toBeVisible();

  // Olho aberto: os 3 valores (2 do orçamento + o provento) aparecem.
  const numeros = await coletarNumerosDaPosicao(page, PAINEL_SINO, OPCOES);
  expect(numeros.sort()).toEqual(Object.values(SENTINELAS_NOTIFICACOES).map(brl).sort());
  const alturas = await painel
    .locator('li')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
  await screenshot(page, `sino-${qa}-aberto`);
  await sino.click(); // fecha (o clique no olho fora do painel também fecharia)

  await alternarOlho(page, true);
  await sino.click();
  await expect(painel.getByText('Orçamento de Habitação estourado')).toBeVisible();
  await expect(painel.locator('.mf-sensivel').first()).toBeVisible();
  expect(await coletarValoresExpostos(page, PAINEL_SINO)).toEqual([]);
  expect(await coletarNumerosDaPosicao(page, PAINEL_SINO, OPCOES)).toEqual([]);
  await expectNumerosAusentes(page, numeros, PAINEL_SINO, OPCOES);
  expect(await atributosComValor(page, PAINEL_SINO)).toEqual([]);
  // O "(154%)" fica; títulos e datas também.
  await expect(painel).toContainText('(154%)');
  const alturasFechado = await painel
    .locator('li')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
  expect(alturasFechado).toEqual(alturas);
  await screenshot(page, `sino-${qa}-fechado`);
  await sino.click();
  await alternarOlho(page, false);
  // Abrir o sino marca como lidas (PATCH): respondido pelo mock, não chega ao servidor.
  expect(escritasSino.every((e) => e.metodo === 'PATCH')).toBe(true);
}

test.describe('esconder valores — Assistente, Perfil e sino (computador 1280)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('perfil sem dinheiro; assistente só com o aviso; sino com pílulas', async ({ page }) => {
    const { assistente, notificacoes } = await abrir(page);
    await conferirPerfil(page, '1280');
    await conferirSino(page, notificacoes.escritas, '1280');
    await conferirAssistente(page, assistente.escritas, '1280');
  });
});

for (const largura of [390, 320] as const) {
  test.describe(`esconder valores — Assistente, Perfil e sino (celular ${largura})`, () => {
    test.use({
      viewport: { width: largura, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    test('perfil sem dinheiro; assistente só com o aviso; sino do MobileHeader', async ({
      page,
    }) => {
      const { assistente, notificacoes } = await abrir(page);
      await conferirPerfil(page, String(largura));
      await conferirSino(page, notificacoes.escritas, String(largura));
      await conferirAssistente(page, assistente.escritas, String(largura));
    });
  });
}
