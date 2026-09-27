import { test, expect, type Page } from '@playwright/test';
import {
  apiDelete,
  apiPost,
  csrfHeaders,
  CSRF_COOKIE_NAME,
  uniqueName,
  writesAllowed,
} from './helpers/api';
import { collectStructure, normalizeClassName } from './helpers/desktopStructure';
import { waitForIdle } from './helpers/mobileFit';
import { waitForContent } from './helpers/waitForContent';

/**
 * Guarda de desktop da PWA fase 3 que GRAVA (projeto `escrita`, roda depois de chromium e mobile).
 *
 * Só com `E2E_ALLOW_WRITES=1` (o CI liga: banco efêmero do job). Cada teste cria o que precisa via
 * API com nome único ('E2E PWA fase 3 <módulo> <timestamp>'), afirma só sobre isso e apaga no
 * finally. Snapshots: `*.ci.structure.json` (banco semeado, como o ci.yml) e `*.local.*`.
 */

const ENV = process.env.CI ? 'ci' : 'local';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.mouse.move(900, 500);
});

async function snapshotStructure(page: Page, slug: string) {
  await page.mouse.move(900, 500);
  // O cronograma e os pagamentos chegam por requisições próprias, sem skeleton.
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
  await waitForIdle(page, { settleMs: 800 });
  const structure = await collectStructure(page, { extras: true });
  expect
    .soft(JSON.stringify(structure, null, 1), `${slug}: estrutura de desktop`)
    .toMatchSnapshot(`${slug}.${ENV}.structure.json`);
  expect.soft(structure.mobileArtifactsVisible, `${slug}: artefato mobile visível`).toBe(0);
}

// Não grava: prova que o helper do CSRF passa pelo middleware (400 da validação, não 403).
test('csrfHeaders: sem o cookie, GET de página autenticada grava; o POST passa do CSRF', async ({
  page,
}) => {
  const cookies = await page.context().cookies();
  await page.context().clearCookies();
  await page.context().addCookies(cookies.filter((c) => c.name !== CSRF_COOKIE_NAME));
  const headers = await csrfHeaders(page);
  expect(Object.values(headers)[0]).toMatch(/^[0-9a-f]{64}$/);
  const res = await page.request.post('/api/calendar', {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: '{}',
  });
  expect(res.status(), await res.text()).toBe(400);
});

test.describe('grava e apaga', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');

  test('Dívida criada via API: detalhe e pagamentos registrados', async ({ page }) => {
    test.setTimeout(240_000);
    const nome = uniqueName('dívida');
    const { divida } = await apiPost<{ divida: { id: string } }>(page, '/api/dividas', {
      modalidade: 'financiamento',
      nome,
      tipo: 'emprestimo_pessoal',
      principal: 12000,
      taxaAm: 0.015,
      prazoMeses: 12,
      sistema: 'PRICE',
      // Longe no futuro: nenhuma parcela vencida, o cronograma não anda com o calendário.
      primeiroVencimento: '2030-01',
      diaVencimento: 10,
    });
    try {
      const abrirDetalhe = async () => {
        await waitForContent(page, '/dividas', { readySelector: 'h2:has-text("Dívidas")' });
        await page.getByText(nome, { exact: true }).first().click();
        await expect(page.getByRole('button', { name: '← Voltar' })).toBeVisible();
        await expect(page.getByRole('columnheader', { name: 'Saldo devedor' })).toBeVisible({
          timeout: 30_000,
        });
        await waitForIdle(page);
      };

      await abrirDetalhe();
      // O desktop não mexe na URL (o ?divida= é só do celular).
      expect(new URL(page.url()).search).toBe('');
      await snapshotStructure(page, 'divida-detalhe');

      await apiPost(page, `/api/dividas/${divida.id}/pagamentos`, {
        month: '2030-01',
        valor: 1100,
        parcelaNumero: 1,
      });
      await abrirDetalhe();
      await expect(page.getByRole('heading', { name: 'Pagamentos registrados' })).toBeVisible();
      await snapshotStructure(page, 'divida-detalhe-pagamento');
    } finally {
      // O DELETE da dívida também remove as linhas do Fluxo (removeDividaCashflow).
      await apiDelete(page, `/api/dividas/${divida.id}`);
    }
  });

  test('Evento criado via API: 1ª linha do Histórico', async ({ page }) => {
    test.setTimeout(180_000);
    const titulo = uniqueName('agenda');
    const { evento } = await apiPost<{ evento: { id: string } }>(page, '/api/calendar', {
      titulo,
      data: '2030-01-15',
    });
    try {
      await waitForContent(page, '/historico-alteracoes', {
        readySelector: 'h2:has-text("Histórico de alterações")',
      });
      const row = page.locator('tbody tr').first();
      await expect(row).toContainText(titulo);
      const raw = await row.evaluate((tr) => ({
        tr: tr.getAttribute('class') ?? '',
        tds: Array.from(tr.querySelectorAll('td')).map((td) => td.getAttribute('class') ?? ''),
        controls: Array.from(tr.querySelectorAll('button, a[href]')).map(
          (el) => `${el.tagName.toLowerCase()}|${el.getAttribute('class') ?? ''}`,
        ),
      }));
      const linha = {
        tr: normalizeClassName(raw.tr),
        tds: raw.tds.map(normalizeClassName),
        controls: raw.controls.map((c) => {
          const [tag, cls] = c.split('|');
          return `${tag}|${normalizeClassName(cls)}`;
        }),
      };
      expect
        .soft(JSON.stringify(linha, null, 1), 'historico: 1ª linha')
        .toMatchSnapshot(`historico-linha.${ENV}.structure.json`);
    } finally {
      await apiDelete(page, `/api/calendar/${evento.id}`);
    }
  });
});
