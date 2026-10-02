import { test, expect, type Locator, type Page, type Response } from '@playwright/test';
import { apiPost, writesAllowed } from './helpers/api';
import { openCarteiraTab, waitCarteiraReady } from './helpers/mobileFit';
import {
  apagarPosicao,
  criarCdbPos,
  criarContaCorrenteEmergencia,
  dataBR,
  gravarHistoricoMover,
  isMoverPost,
  moverCaixaRfLigado,
  portfolioIdNaAba,
} from './helpers/moverRf';

/**
 * Mover — FASE 2 (Reservas + Renda Fixa) que GRAVA — projeto `escrita`, desktop 1280.
 *
 * Só com E2E_ALLOW_WRITES=1 E a chave MOVER_CAIXA_RF_HABILITADO=true no servidor e no teste
 * (ver e2e/helpers/moverRf.ts; o CI não liga a chave e este arquivo pula). O demo do seed não tem
 * renda fixa: o teste cria um CDB pós (110% CDI, vence 15/01/2030) e uma conta corrente na
 * Reserva de Emergência pela API de operação e APAGA os dois no fim, depois de desfazer o que
 * moveu. Afirma só sobre o que criou.
 *
 * CDB: arrasta para a bandeja → Reserva Emergência → confirmação (efeito na Saúde) → aparece na
 * reserva com o vencimento real e o selo "movido" → Desfazer pelo toast → teclado (espaço, setas,
 * espaço) → "Voltar para Renda Fixa" no menu ⋯ → Desfazer pelo Histórico. Conta corrente: selo
 * "saldo em conta" e a Renda Fixa recusada na bandeja (sem gravar).
 */

const SUFIXO = Date.now();
const CDB = `CDB E2E mover RF ${SUFIXO}`;
const CONTA = `E2E mover RF conta ${SUFIXO}`;

test.describe.configure({ mode: 'serial' });

// O aviso de cookies (LGPD) fica fixo no rodapé e cobre o menu ⋯ das linhas mais baixas.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
    } catch {
      // sem storage: o aviso aparece
    }
  });
});

async function gotoAba(page: Page, aba: string) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.mouse.move(900, 500);
  await page.goto('/carteira', { waitUntil: 'domcontentloaded' });
  await waitCarteiraReady(page);
  await openCarteiraTab(page, aba);
  await page
    .waitForFunction(() => !document.body.innerText.includes('Carregando dados'), null, {
      timeout: 60_000,
    })
    .catch(() => {});
}

const linhaDe = (page: Page, nome: string): Locator =>
  page.locator('tr[data-mover-linha]').filter({ hasText: nome });

/** Arrasta pela alça até o ponto (mouse real: 4px ativam o arrasto). Não solta. */
async function arrastarAte(page: Page, alca: Locator, destino: { x: number; y: number }) {
  await alca.scrollIntoViewIfNeeded();
  const box = await alca.boundingBox();
  if (!box) throw new Error('alça sem caixa');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 20, { steps: 4 });
  await page.mouse.move(destino.x, destino.y, { steps: 12 });
  await page.waitForTimeout(400);
}

async function soltarNoChip(page: Page, chip: Locator) {
  const b = (await chip.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.waitForTimeout(300);
  await page.mouse.up();
}

/** Confirmação da Fatia D (diálogo com os efeitos): confere a Saúde e confirma. */
async function confirmarMover(page: Page): Promise<Response> {
  const dialogo = page.getByRole('dialog').last();
  await expect(dialogo).toBeVisible();
  await expect(dialogo, 'efeito na Reserva de Emergência / Saúde').toContainText(/emerg[êe]ncia/i);
  // O dnd-kit engole cliques até ~50ms depois de soltar (ver desktop-carteira-mover.escrita).
  await page.waitForTimeout(200);
  const post = page.waitForResponse(isMoverPost);
  await dialogo
    .getByRole('button', { name: /^Mover/ })
    .last()
    .click();
  return post;
}

test.describe('mover RF ↔ Reservas grava e desfaz', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');
  test.skip(!moverCaixaRfLigado(), 'só com MOVER_CAIXA_RF_HABILITADO=true (servidor e teste)');

  test('CDB pós: bandeja, teclado, Voltar e Desfazer (toast e Histórico)', async ({ page }) => {
    test.setTimeout(420_000);
    const historico: string[] = [];
    gravarHistoricoMover(page, historico);
    const { vencimento } = await criarCdbPos(page, CDB);
    let portfolioId: string | null = null;

    try {
      await gotoAba(page, 'Renda Fixa');
      const linha = linhaDe(page, CDB);
      await expect(linha, 'CDB criado na Renda Fixa').toHaveCount(1);
      portfolioId = await portfolioIdNaAba(page, CDB);
      expect(portfolioId).not.toBeNull();
      expect(
        await linha.evaluate((tr) => !!tr.closest('[data-carteira-dnd]')),
        'tabela com o provider do mover',
      ).toBe(true);

      // 1) Arrasto → bandeja: só as outras duas abas do trio, sem chip travado.
      const alca = linha.locator('[data-mover-alca]');
      await arrastarAte(page, alca, { x: 640, y: 700 });
      const chips = page.locator('[data-aba-drop]');
      await expect(chips).toHaveCount(2);
      await expect(page.locator('[data-aba-drop="reservaOportunidade"]')).toBeVisible();
      const emerg = page.locator('[data-aba-drop="reservaEmergencia"]');
      await expect(emerg).not.toHaveAttribute('data-recusado', 'true');
      await soltarNoChip(page, emerg);
      expect((await confirmarMover(page)).status()).toBe(200);
      await expect(page.locator('[data-mf-mover-toast]').last()).toBeVisible();

      // 2) Na Reserva de Emergência, com o vencimento real do título e o selo "movido".
      await gotoAba(page, 'Reserva Emergência');
      const naReserva = linhaDe(page, CDB);
      await expect(naReserva, 'persistiu na reserva depois do reload').toHaveCount(1);
      await expect(naReserva).toContainText(dataBR(vencimento));
      await expect(naReserva.locator('[data-mf-movido]')).toHaveCount(1);
      await expect(naReserva.locator('[data-mf-saldo-conta]')).toHaveCount(0);
      await gotoAba(page, 'Renda Fixa');
      await expect(linhaDe(page, CDB)).toHaveCount(0);

      // 3) Teclado: espaço pega, setas até a Renda Fixa na bandeja, espaço solta.
      await gotoAba(page, 'Reserva Emergência');
      await linhaDe(page, CDB).locator('[data-mover-alca]').focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      const rf = page.locator('[data-aba-drop="rendaFixaFundos"]');
      await expect(rf).toBeVisible();
      // Origem sem seção: a 1ª seta já vai para a 1ª aba da bandeja.
      for (let i = 0; i < 3; i += 1) {
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(150);
        if ((await rf.getAttribute('class'))?.includes('border-solid')) break;
      }
      await page.keyboard.press('Space');
      expect((await confirmarMover(page)).status()).toBe(200);
      await gotoAba(page, 'Renda Fixa');
      await expect(linhaDe(page, CDB), 'teclado levou de volta à Renda Fixa').toHaveCount(1);
      await expect(linhaDe(page, CDB).locator('[data-mf-movido]')).toHaveCount(0);

      // 4) Mover de novo pelo menu ⋯ → "Mover para…" (diálogo) e Desfazer pelo toast.
      await linhaDe(page, CDB).locator('[data-mover-menu]').click();
      await page.getByRole('menuitem', { name: /^Mover para/ }).click();
      const dialogo = page.getByRole('dialog').last();
      await expect(dialogo).toBeVisible();
      await dialogo
        .getByRole('radio', { name: /Reserva Emerg/ })
        .first()
        .check();
      expect((await confirmarMover(page)).status()).toBe(200);
      const desfazer = page.locator('[data-mf-mover-toast]').getByRole('button', {
        name: 'Desfazer',
      });
      await expect(desfazer).toBeVisible();
      const postUndo = page.waitForResponse(
        (r) => r.url().includes('/undo') && r.request().method() === 'POST',
      );
      await desfazer.click();
      expect((await postUndo).ok()).toBe(true);
      await gotoAba(page, 'Renda Fixa');
      await expect(linhaDe(page, CDB), 'Desfazer do toast voltou à RF').toHaveCount(1);

      // 5) "Voltar para Renda Fixa" (1º item do menu do movido) e Desfazer pelo Histórico.
      await apiPost(page, '/api/carteira/mover', {
        acao: 'mover',
        tipo: 'posicao',
        id: portfolioId,
        categoria: 'reservaEmergencia',
      });
      await gotoAba(page, 'Reserva Emergência');
      await linhaDe(page, CDB).locator('[data-mover-menu]').click();
      const itens = page.getByRole('menu').getByRole('menuitem');
      await expect(itens.first()).toHaveText(/^Voltar para Renda Fixa/);
      const postVoltar = page.waitForResponse(isMoverPost);
      await itens.first().click();
      expect((await postVoltar).status()).toBe(200);
      await gotoAba(page, 'Renda Fixa');
      await expect(linhaDe(page, CDB)).toHaveCount(1);
      await expect(linhaDe(page, CDB).locator('[data-mf-movido]')).toHaveCount(0);

      const ultimo = historico[historico.length - 1];
      expect(ultimo, 'Voltar gravou no Histórico').toBeTruthy();
      await apiPost(page, `/api/historico-alteracoes/${ultimo}/undo`, {});
      await gotoAba(page, 'Reserva Emergência');
      await expect(linhaDe(page, CDB), 'Histórico desfez o Voltar').toHaveCount(1);
    } finally {
      if (!portfolioId) {
        await gotoAba(page, 'Renda Fixa');
        portfolioId = await portfolioIdNaAba(page, CDB);
      }
      if (portfolioId) {
        // A posição criada pelo teste some inteira (overrides e transações juntos).
        await apagarPosicao(page, portfolioId).catch((e: unknown) => {
          test.info().annotations.push({ type: 'limpeza falhou', description: String(e) });
        });
      }
    }
  });

  test('conta corrente: selo "saldo em conta" e Renda Fixa recusada na bandeja', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await criarContaCorrenteEmergencia(page, CONTA);
    let portfolioId: string | null = null;
    try {
      await gotoAba(page, 'Reserva Emergência');
      const linha = linhaDe(page, CONTA);
      await expect(linha).toHaveCount(1);
      portfolioId = await portfolioIdNaAba(page, CONTA);
      await expect(linha.locator('[data-mf-saldo-conta]')).toHaveText('saldo em conta');

      const posts: Response[] = [];
      const conta = (r: Response) => {
        if (isMoverPost(r)) posts.push(r);
      };
      page.on('response', conta);
      await arrastarAte(page, linha.locator('[data-mover-alca]'), { x: 640, y: 700 });
      const rf = page.locator('[data-aba-drop="rendaFixaFundos"]');
      await expect(rf).toBeVisible();
      await expect(rf).toHaveAttribute('data-recusado', 'true');
      await soltarNoChip(page, rf);
      await expect(
        page
          .locator('[role="status"]:not([id^="DndLiveRegion"])')
          .filter({ hasText: 'Renda Fixa não aceita' }),
      ).toBeVisible();
      await page.waitForTimeout(500);
      page.off('response', conta);
      expect(posts, 'aba recusada não grava').toHaveLength(0);
    } finally {
      if (portfolioId) {
        await apagarPosicao(page, portfolioId).catch((e: unknown) => {
          test.info().annotations.push({ type: 'limpeza falhou', description: String(e) });
        });
      }
    }
  });
});
