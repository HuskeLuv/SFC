import { test, expect, type Page, type Request } from '@playwright/test';
import { apiDelete, writesAllowed } from './helpers/api';
import { waitCarteiraReady } from './helpers/mobileFit';

/**
 * Emissor na renda fixa coberta pelo FGC (ClickUp 86e2xqh69, fatia C) — projeto `escrita`.
 *
 * Cadastra um CDB Pré pela BTG Pactual no wizard, trocando o banco emissor (busca "dayc" → Banco
 * Daycoval, que está no seed). Confere a faixa "Via BTG Pactual · CDB Pré", a pill "Mesmo da
 * corretora" antes da troca, a confirmação com Corretora e Emissor e que o POST leva
 * emissorInstituicaoId. Desktop 1280 e celular 390 (isMobile), sem overflow horizontal no 390.
 * Apaga o CDB criado no fim. Screenshots só fora do CI.
 *
 * A Cobertura FGC por emissor ("Banco Daycoval" com "via BTG Pactual") é da fatia D: conferida
 * na integração, não aqui.
 */

const CORRETORA = /BTG Pactual/;
const EMISSOR = 'Banco Daycoval S.A.';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent =
      '.tsqd-parent-container, .tsqd-open-btn-container, nextjs-portal { display: none !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
    } catch {
      // sem storage: o aviso de cookies aparece
    }
  });
});

const isOperacaoPost = (req: Request) =>
  req.method() === 'POST' && new URL(req.url()).pathname === '/api/carteira/operacao';

/** Data no campo: input nativo no celular, flatpickr (setDate dispara o onChange) no desktop. */
async function preencherData(page: Page, id: string, iso: string, mobile: boolean) {
  const campo = page.locator(`#${id}`);
  if (mobile) {
    await campo.fill(iso);
    return;
  }
  await campo.evaluate((el, valor) => {
    const fp = (
      el as HTMLInputElement & { _flatpickr?: { setDate: (d: string, t: boolean) => void } }
    )._flatpickr;
    fp?.setDate(valor, true);
  }, iso);
}

async function apagarPorNome(page: Page, nome: string) {
  const res = await page.request.get('/api/carteira/renda-fixa');
  if (!res.ok()) return;
  const body = (await res.json()) as { secoes?: { ativos?: { id: string; nome: string }[] }[] };
  const ids = (body.secoes ?? [])
    .flatMap((s) => s.ativos ?? [])
    .filter((a) => a.nome === nome)
    .map((a) => a.id);
  for (const id of ids) await apiDelete(page, `/api/ativos/${id}/portfolio`);
}

async function cadastrarCdbTrocandoEmissor(page: Page, mobile: boolean, nome: string) {
  await page.goto('/carteira');
  await waitCarteiraReady(page);
  if (mobile) {
    await page.getByRole('button', { name: 'Lançar' }).click();
    await page
      .getByRole('dialog', { name: 'O que você quer lançar?' })
      .getByRole('link', { name: /Novo investimento/ })
      .click();
  } else {
    await page
      .getByRole('button', { name: /Adicionar Investimento/i })
      .first()
      .click();
  }
  await expect(page.locator('[data-mf-step="asset-type"]')).toBeVisible({ timeout: 60_000 });
  const avancar = () => page.getByRole('button', { name: 'Avançar' }).click();

  // 1) Tipo (cartões de rádio no celular, select no desktop)
  if (mobile) await page.locator('[data-value="renda-fixa"]').click();
  else await page.locator('select:has(option[value="renda-fixa"])').selectOption('renda-fixa');
  await avancar();

  // 2) Corretora (rótulo próprio da renda fixa)
  const inst = page.locator('[data-mf-step="institution"]');
  await expect(inst.getByText('Corretora ou banco onde você investe *')).toBeVisible();
  await inst.locator('#instituicao').fill('BTG');
  await inst.getByRole('button', { name: CORRETORA }).first().click();
  await avancar();

  // 3) CDB Pré
  await page.getByRole('button', { name: 'Selecionar Pré-fixada' }).click();
  await page.getByRole('button', { name: 'Selecionar CDB Pré', exact: true }).click();
  await avancar();

  // 4) Informações: faixa Via, emissor pré-preenchido com a pill, troca para o Daycoval
  const info = page.locator('[data-mf-step="info"]');
  await expect(info.locator('[data-mf-rf-via]')).toContainText('Via BTG Pactual');
  await expect(info.locator('[data-mf-rf-via]')).toContainText('CDB Pré');
  const emissor = info.locator('#emissorInstituicao');
  await expect(emissor).toHaveValue(CORRETORA);
  await expect(info.locator('[data-mf-emissor-pill]')).toHaveText('Mesmo da corretora');
  const resumo = info.getByText('Por que pedimos o emissor?');
  expect((await resumo.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  if (!process.env.CI) {
    await info.locator('[data-mf-emissor]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('emissor-prefill.png') });
  }

  await emissor.fill('dayc');
  await info.getByRole('button', { name: new RegExp(EMISSOR.replace(/\./g, '\\.')) }).click();
  await expect(emissor).toHaveValue(EMISSOR);
  await expect(info.locator('[data-mf-emissor-pill]')).toHaveCount(0);
  await expect(info.locator('[data-mf-emissor]')).toContainText(
    'Para o FGC, este título conta no limite do Banco Daycoval S.A',
  );

  await info.locator('#descricao').fill(nome);
  await preencherData(page, 'dataInicio', '2026-10-14', mobile);
  await preencherData(page, 'dataVencimento', '2028-10-16', mobile);
  await info.locator('#valorAplicado').fill('1000');
  await info.locator('#taxaJurosAnual').fill('12');

  if (mobile) {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw, 'sem overflow horizontal no 390').toBeLessThanOrEqual(390);
  }
  if (!process.env.CI) {
    await page.screenshot({ path: test.info().outputPath('emissor-trocado.png') });
  }
  await avancar();

  // 5) Confirmação: Corretora + Emissor (com CNPJ) e a faixa do FGC
  const conf = page.locator('[data-mf-step="confirmation"]');
  await expect(conf.getByText('Corretora:')).toBeVisible();
  await expect(conf.locator('[data-mf-confirma-emissor]')).toContainText(EMISSOR);
  await expect(conf.locator('[data-mf-confirma-emissor]')).toContainText('CNPJ');
  await expect(conf.locator('[data-mf-confirma-fgc]')).toContainText(
    `limite do ${EMISSOR} (até R$ 250 mil por CPF)`,
  );
  if (!process.env.CI) {
    await page.screenshot({ path: test.info().outputPath('emissor-confirmacao.png') });
  }

  const post = page.waitForRequest(isOperacaoPost);
  await page.getByRole('button', { name: 'Confirmar' }).click();
  const req = await post;
  const corpo = req.postDataJSON() as Record<string, unknown>;
  expect(typeof corpo.emissorInstituicaoId).toBe('string');
  expect(corpo.emissorInstituicaoId).not.toBe(corpo.instituicaoId);
  expect(corpo).not.toHaveProperty('emissorInstituicaoNome');
  expect(corpo).not.toHaveProperty('instituicaoTipoBacen');
  const res = await req.response();
  expect(res?.status()).toBe(201);
  await expect(page.locator('[data-mf-step="confirmation"]')).toBeHidden();
}

test.describe('renda fixa: emissor no cadastro (desktop)', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');
  test.use({ viewport: { width: 1280, height: 900 } });

  test('CDB pela BTG com emissor Banco Daycoval', async ({ page }) => {
    test.setTimeout(180_000);
    const nome = `CDB E2E emissor C desk ${Date.now()}`;
    try {
      await cadastrarCdbTrocandoEmissor(page, false, nome);
    } finally {
      await apagarPorNome(page, nome);
    }
  });
});

test.describe('renda fixa: emissor no cadastro (celular 390)', () => {
  test.skip(!writesAllowed(), 'só com E2E_ALLOW_WRITES=1');
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });

  test('CDB pela BTG com emissor Banco Daycoval, sem overflow', async ({ page }) => {
    test.setTimeout(180_000);
    const nome = `CDB E2E emissor C 390 ${Date.now()}`;
    try {
      await cadastrarCdbTrocandoEmissor(page, true, nome);
    } finally {
      await apagarPorNome(page, nome);
    }
  });
});
