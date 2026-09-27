import { test, expect, type Page } from '@playwright/test';
import { apiDelete, apiPost, uniqueName, writesAllowed } from './helpers/api';
import { gotoMobile, prepareMobilePage, waitForIdle } from './helpers/mobileFit';

/**
 * PWA fase 3 · fatia C — Dívidas e Agenda no celular que GRAVAM (projeto `escrita`, roda depois de
 * chromium e mobile; só com E2E_ALLOW_WRITES=1). Cada teste cria o que precisa com nome único e
 * apaga no finally; só afirma sobre o que ele próprio criou.
 */
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});
test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');

test.beforeEach(async ({ page }) => {
  await prepareMobilePage(page);
});

/** Mês corrente (YYYY-MM) e hoje (YYYY-MM-DD), no fuso local do navegador de teste. */
function hoje() {
  const d = new Date();
  const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { mes, dia: `${mes}-${String(d.getDate()).padStart(2, '0')}` };
}

async function abrirAgenda(page: Page) {
  await gotoMobile(page, '/calendario');
  await expect(page.locator('[data-mf-agenda-titulo]')).not.toHaveText(/^\s*$/);
}

test('Dívida criada via API: cartão → ?divida= → detalhe, sheets e voltar; parcela na Agenda', async ({
  page,
}) => {
  const nome = uniqueName('dívida');
  const { divida } = await apiPost<{ divida: { id: string } }>(page, '/api/dividas', {
    modalidade: 'financiamento',
    nome,
    tipo: 'emprestimo_pessoal',
    principal: 12000,
    taxaAm: 0.015,
    prazoMeses: 12,
    sistema: 'PRICE',
    // Começa no mês corrente: a 1ª parcela aparece na lista do mês da Agenda.
    primeiroVencimento: hoje().mes,
    diaVencimento: 28,
  });
  try {
    await gotoMobile(page, '/dividas');
    const card = page.locator('[data-mf-card]', { hasText: nome });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(new RegExp(`[?&]divida=${divida.id}`));
    await expect(page.getByRole('heading', { name: nome })).toBeVisible();

    await page.getByRole('button', { name: /^Situação:/ }).click();
    await expect(page.getByRole('dialog', { name: 'Situação da dívida' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Situação da dívida' })).toBeHidden();

    await page.getByRole('button', { name: 'Mais ações da dívida' }).click();
    await expect(page.getByRole('dialog', { name: 'Ações da dívida' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Ações da dívida' })).toBeHidden();

    // Cronograma em lista: uma única "Próxima".
    await expect(page.locator('[data-mf-parcela]').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-mf-parcela][aria-current="true"]')).toHaveCount(1);
    await expect(page.locator('[data-mf-parcela][aria-current="true"]')).toContainText('Próxima');

    // Voltar do sistema (Android / gesto do iPhone) volta para a lista.
    await page.goBack();
    await expect(page).not.toHaveURL(/divida=/);
    await expect(card).toBeVisible();

    // Deep link: ?divida= abre direto o detalhe no celular.
    await gotoMobile(page, `/dividas?divida=${divida.id}`, { readySelector: '[data-mf-parcela]' });
    await expect(page.getByRole('heading', { name: nome })).toBeVisible();

    await abrirAgenda(page);
    await expect(page.locator('.fc-list-event', { hasText: nome }).first()).toBeVisible();
  } finally {
    // O DELETE também remove a linha do Fluxo (removeDividaCashflow).
    await apiDelete(page, `/api/dividas/${divida.id}`);
  }
});

test('Evento criado pelo sheet aparece na lista e é excluído com confirmação em sheet', async ({
  page,
}) => {
  const titulo = uniqueName('agenda');
  const { dia } = hoje();
  try {
    await abrirAgenda(page);
    await page.getByRole('button', { name: 'Novo', exact: true }).click();
    const form = page.locator('[role="dialog"][aria-modal="true"]', { hasText: 'Novo evento' });
    await form.locator('#agenda-titulo').fill(titulo);
    await form.locator('#agenda-data').fill(dia);
    await form.getByRole('radio', { name: 'Lembrete' }).click();
    await form.getByRole('button', { name: 'Adicionar' }).click();
    await expect(form).toBeHidden();

    const linha = page.locator('.fc-list-event', { hasText: titulo });
    await expect(linha).toBeVisible();
    await waitForIdle(page);

    // Excluir: detalhe → Editar → Excluir evento → confirmação em sheet.
    await linha.click();
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await page.getByRole('button', { name: 'Excluir evento' }).click();
    const confirmacao = page.getByRole('alertdialog', { name: 'Excluir este evento?' });
    await expect(confirmacao).toBeVisible();
    await confirmacao.getByRole('button', { name: 'Excluir', exact: true }).click();
    await expect(confirmacao).toBeHidden();
    await expect(linha).toHaveCount(0);
  } finally {
    // Se algo falhou no meio, apaga o que sobrou pelo título.
    const d = new Date();
    const { mes } = hoje();
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const res = await page.request.get(`/api/calendar?de=${mes}-01&ate=${mes}-${ultimo}`);
    if (res.ok()) {
      const { eventos } = (await res.json()) as {
        eventos: Array<{ tipo: string; titulo: string; detalhe: { eventoId?: unknown } }>;
      };
      for (const e of eventos) {
        if (e.tipo === 'manual' && e.titulo === titulo && typeof e.detalhe.eventoId === 'string') {
          await apiDelete(page, `/api/calendar/${e.detalhe.eventoId}`);
        }
      }
    }
  }
});
