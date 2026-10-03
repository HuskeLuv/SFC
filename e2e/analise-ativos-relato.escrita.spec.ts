import { test, expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { csrfHeaders, writesAllowed } from './helpers/api';

/**
 * Análise de Ativos — bloco C, fatia D: "Reportar dado incorreto" → Meus relatos. GRAVA (projeto
 * `escrita`, desktop 1280) e DESFAZ: não há rota de usuário para apagar relato, então o `finally`
 * apaga pelo Prisma (DATABASE_URL do job) SÓ o relato criado aqui e o caso dele, se ficou sem
 * outros relatos e é de usuário.
 *
 * - API → tela: POST /api/analise-ativos/reportes (com CSRF) → o relato aparece em Meus relatos
 *   com o protocolo; o 2º POST do mesmo dado responde 409 levando ao mesmo relato.
 * - Tela inteira: menu ⋯ do bloco → formulário → enviado (protocolo) → "Ver meus relatos". Pula
 *   enquanto o menu não estiver encaixado nos blocos (fatia B).
 *
 * Só com E2E_ALLOW_WRITES=1 e com config.reporteHabilitado (ANALISE_ATIVOS_REPORTE_HABILITADO).
 */

test.describe.configure({ mode: 'serial' });

const MARCA = `E2E bloco C relato ${Date.now()}`;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
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
      // sem storage
    }
  });
});

async function reporteLigado(page: Page): Promise<boolean> {
  const res = await page.request.get('/api/analise-ativos/config');
  return (
    res.ok() && ((await res.json()) as { reporteHabilitado?: boolean }).reporteHabilitado === true
  );
}

/** Apaga o relato criado pelo teste e o caso dele (se é de usuário e ficou sem relatos). */
async function desfazer(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const prisma = new PrismaClient();
  try {
    const reps = await prisma.analiseDataReport.findMany({
      where: { id: { in: ids } },
      select: { casoId: true },
    });
    await prisma.analiseDataReport.deleteMany({ where: { id: { in: ids } } });
    await prisma.analiseCasoDado.deleteMany({
      where: {
        id: { in: reps.map((r) => r.casoId) },
        origem: 'usuario',
        reportes: { none: {} },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('relato grava e desfaz', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');

  test('API → Meus relatos: protocolo na lista; duplicado leva ao mesmo relato', async ({
    page,
  }) => {
    test.skip(!(await reporteLigado(page)), 'relato desligado ou demo fora do beta');
    test.setTimeout(120_000);
    const criados: string[] = [];
    try {
      const corpo = {
        ticker: 'WEGE3',
        bloco: 'valuation',
        campo: 'outro',
        periodo: 'e2e',
        versao: 'e2e',
        mensagem: `${MARCA}: payout diferente do release.`,
      };
      const headers = { ...(await csrfHeaders(page)), 'Content-Type': 'application/json' };
      const res = await page.request.post('/api/analise-ativos/reportes', {
        data: corpo,
        headers,
      });
      expect(res.status()).toBe(201);
      const r = (await res.json()) as { id: string; protocolo: string; slaAte: string };
      criados.push(r.id);
      expect(r.protocolo).toMatch(/^[2-9A-Z]{8}$/);

      const dup = await page.request.post('/api/analise-ativos/reportes', {
        data: { ...corpo, mensagem: `${MARCA}: de novo o mesmo dado.` },
        headers,
      });
      expect(dup.status()).toBe(409);
      expect(((await dup.json()) as { reporteId: string }).reporteId).toBe(r.id);

      await page.goto(`/analise-ativos/meus-relatos?relato=${r.id}`, { waitUntil: 'load' });
      const item = page.locator(`[data-relato-item="${r.id}"]`);
      await expect(item).toBeVisible({ timeout: 60_000 });
      await expect(item).toContainText(`Protocolo ${r.protocolo}`);
      await expect(item).toContainText(MARCA);
      await expect(item.locator('[data-relato-status="aberto"]')).toBeVisible();
      await expect(item).toHaveAttribute('data-relato-alvo', '1');
    } finally {
      await desfazer(criados);
    }
  });

  test('tela: menu ⋯ → formulário → enviado → Meus relatos', async ({ page }) => {
    test.skip(!(await reporteLigado(page)), 'relato desligado ou demo fora do beta');
    test.setTimeout(120_000);
    const criados: string[] = [];
    try {
      await page.goto('/analise-ativos/WEGE3', { waitUntil: 'load' });
      await expect(page.locator('[data-pagina-ativo="WEGE3"]')).toBeVisible({ timeout: 60_000 });
      const menu = page.locator('[data-menu-bloco]').first();
      test.skip((await menu.count()) === 0, 'menu ⋯ ainda não encaixado nos blocos (fatia B)');
      await menu.click();
      await page.locator('[data-acao="reportar"]').first().click();
      const dialogo = page.getByRole('dialog', { name: 'Reportar dado incorreto' });
      await expect(dialogo).toBeVisible();
      await dialogo.getByLabel('Qual dado?').selectOption('outro');
      // inválido primeiro (curto)
      await dialogo.getByLabel('O que está errado?').fill('curto');
      await page.locator('[data-relato-enviar]').click();
      await expect(dialogo.getByRole('alert').first()).toContainText('Confira os campos');
      await dialogo.getByLabel('O que está errado?').fill(`${MARCA}: valor diferente da CVM.`);
      const resposta = page.waitForResponse(
        (r) => r.url().endsWith('/api/analise-ativos/reportes') && r.request().method() === 'POST',
      );
      await page.locator('[data-relato-enviar]').click();
      const res = await resposta;
      const corpo = (await res.json().catch(() => ({}))) as { id?: string; reporteId?: string };
      if (corpo.id) criados.push(corpo.id);
      expect(res.status()).toBe(201);
      await expect(page.locator('[data-relato-protocolo]')).toBeVisible();
      await page.getByRole('link', { name: 'Ver meus relatos' }).click();
      await expect(page).toHaveURL(/\/analise-ativos\/meus-relatos/);
      await expect(page.locator(`[data-relato-item="${corpo.id}"]`)).toBeVisible({
        timeout: 60_000,
      });
    } finally {
      await desfazer(criados);
    }
  });
});
