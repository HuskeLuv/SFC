import { test, expect, type Page } from '@playwright/test';
import { encontrarProibidasV2 } from '../src/services/analiseAtivos/regras/comum/linguagemV2';

/**
 * Análise de Ativos — Quadro e busca no computador (projeto `chromium`, SÓ LEITURA). v2.4 (fatia
 * B): Filtros de fundamentos (janela + critérios com E), ordem A–Z, coluna Critérios, sem o
 * indicador antigo. No CI o seed traz as fixtures da área (12 ações e 7 FIIs no Quadro) com
 * ANALISE_ATIVOS_HABILITADA=true; no dev, o banco inteiro. Os testes de critério valem com ou sem
 * avaliação gravada (job 'criterios'): sem avaliação, a lista filtrada fica vazia com o link
 * "limpe os filtros". Sem a área liberada, pula.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        'lgpd-cookie-consent',
        JSON.stringify({ version: '1', acceptedAt: new Date().toISOString() }),
      );
    } catch {
      /* sem storage */
    }
  });
  const cfg = await page.request.get('/api/analise-ativos/config');
  const habilitada = cfg.ok() && ((await cfg.json()) as { habilitada?: boolean }).habilitada;
  test.skip(!habilitada, 'Análise de Ativos desligada ou usuário fora do beta');
});

const quadro = (page: Page) => page.locator('section[aria-label="Quadro"]');
const linhas = (page: Page) => quadro(page).locator('tbody tr[data-ticker]');

/** Espera a tabela com linhas e sem a página anterior (placeholder) em tela. */
async function tabelaPronta(page: Page) {
  await linhas(page).first().waitFor({ timeout: 60_000 });
  await expect(quadro(page).locator('[data-quadro-tabela][aria-busy]')).toHaveCount(0, {
    timeout: 30_000,
  });
}

async function abrirQuadro(page: Page, qs = '') {
  await page.goto(`/analise-ativos${qs}`, { waitUntil: 'domcontentloaded' });
  await tabelaPronta(page);
}

/** Texto da coluna (data-coluna) de cada linha carregada. */
async function valoresColuna(page: Page, coluna: string): Promise<string[]> {
  return linhas(page)
    .locator(`td[data-coluna="${coluna}"]`)
    .evaluateAll((tds) => tds.map((td) => (td.textContent ?? '').trim()));
}

const numeroBr = (t: string): number | null => {
  const m = t
    .replace(/\./g, '')
    .replace('−', '-')
    .match(/-?\d+(,\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
};

test('ordena por P/L: crescente, aria-sort e "—" sempre no fim (API e tela)', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirQuadro(page);
  await page.getByRole('button', { name: 'Ordenar por P/L' }).click();
  await expect(page).toHaveURL(/ordem=pl&dir=asc/);
  const th = page.locator('th[data-coluna="pl"]');
  await expect(th).toHaveAttribute('aria-sort', 'ascending');
  await tabelaPronta(page);

  // na tela: números crescentes e nada numérico depois do primeiro "—"
  const tela = (await valoresColuna(page, 'pl')).map(numeroBr);
  const primeiroNulo = tela.indexOf(null);
  if (primeiroNulo >= 0) expect(tela.slice(primeiroNulo).every((v) => v === null)).toBe(true);
  const nums = tela.filter((v): v is number => v !== null);
  expect([...nums].sort((a, b) => a - b)).toEqual(nums);

  // na API, a lista inteira: nulos no fim nas duas direções
  for (const dir of ['asc', 'desc']) {
    const valores: Array<number | null> = [];
    for (let offset = 0; ; offset += 100) {
      const r = await page.request.get(
        `/api/analise-ativos/quadro?classe=acao&ordem=pl&dir=${dir}&limite=100&offset=${offset}`,
      );
      expect(r.ok()).toBe(true);
      expect(r.headers()['cache-control']).toContain('no-store');
      const corpo = (await r.json()) as {
        total: number;
        itens: Array<{ pl: { estado: string; valor?: number } }>;
      };
      valores.push(...corpo.itens.map((i) => (i.pl.estado === 'ok' ? i.pl.valor! : null)));
      if (offset + 100 >= corpo.total) break;
    }
    const n = valores.indexOf(null);
    if (n >= 0)
      expect(
        valores.slice(n).every((v) => v === null),
        dir,
      ).toBe(true);
  }
});

test('Detalhado acrescenta colunas e fica na URL', async ({ page }) => {
  await abrirQuadro(page);
  await expect(page.getByRole('columnheader', { name: /Margem líquida/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Detalhado' }).click();
  await expect(page).toHaveURL(/modo=detalhado/);
  await expect(page.getByRole('button', { name: 'Ordenar por Margem líquida' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Setor' })).toBeVisible();
});

test('padrão A–Z; chip de critério (E) na URL e na API; Limpar filtros', async ({ page }) => {
  test.setTimeout(120_000);
  await abrirQuadro(page);
  await expect(page.locator('th[data-coluna="ativo"]')).toHaveAttribute('aria-sort', 'ascending');
  const tickers = await linhas(page).evaluateAll((trs) =>
    trs.map((tr) => tr.getAttribute('data-ticker') ?? ''),
  );
  expect([...tickers].sort((a, b) => a.localeCompare(b))).toEqual(tickers);

  const chip = page.getByRole('button', { name: /Receita crescente/ });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/c=rec/);
  await expect(page.locator('[data-quadro-contador]')).toContainText(
    'atendem a 1 critério em 5 anos',
  );

  // API: todo item devolvido ATENDE ao critério na janela (sem dado e n/a nunca passam)
  const r = await page.request.get(
    '/api/analise-ativos/quadro?classe=acao&criterios=rec&limite=100',
  );
  expect(r.ok()).toBe(true);
  const corpo = (await r.json()) as {
    itens: Array<{ criterios: { marcas: Array<{ id: string; estado: string }> } | null }>;
  };
  for (const i of corpo.itens) {
    expect(i.criterios?.marcas.find((m) => m.id === 'rec')?.estado).toBe('atende');
  }

  await page.getByRole('button', { name: 'Limpar filtros' }).first().click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(page).not.toHaveURL(/c=rec/);
});

test('FIIs: janela 10 com critério ligado mostra o vazio com "limpe os filtros"', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/analise-ativos?classe=fii&j=10&c=rend,vp,alav,mes,res', {
    waitUntil: 'domcontentloaded',
  });
  // v2.5: sem a nota dos informes de FII de 2016 (só "sem dado nas demonstrações")
  await expect(page.getByRole('radio', { name: '10 anos' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // v2.5 (criteria_params v2): o par Vacância/Inadimplência é chip ATIVO
  const vac = page.getByRole('button', { name: /Vacância ≤ 10%/ });
  await expect(vac).toHaveAttribute('aria-pressed', 'false');
  await expect(vac).not.toHaveAttribute('aria-disabled', 'true');
  const limpe = page.getByRole('button', { name: 'limpe os filtros' });
  const vazio = await limpe
    .or(
      page.locator('[data-quadro-cartoes] li, [data-quadro-tabela] tbody tr[data-ticker]').first(),
    )
    .first()
    .waitFor({ timeout: 60_000 })
    .then(() => limpe.isVisible());
  test.skip(!vazio, 'algum FII atende aos 5 critérios em 10 anos neste banco');
  await limpe.click();
  await expect(page).toHaveURL(/classe=fii&j=10$/);
});

test('v2.5: ?c=vac fica na URL e filtra; Tipo só Tijolo | Papel', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/analise-ativos?classe=fii&c=vac', { waitUntil: 'domcontentloaded' });
  const vac = page.getByRole('button', { name: /Vacância ≤ 10%/ });
  await expect(vac).toHaveAttribute('aria-pressed', 'true', { timeout: 60_000 });
  await expect(page).toHaveURL(/c=vac/);
  const r = await page.request.get(
    '/api/analise-ativos/quadro?classe=fii&criterios=vac&limite=100',
  );
  expect(r.ok()).toBe(true);
  const corpo = (await r.json()) as {
    facetas: { tipos: string[] };
    itens: Array<{
      fiiTipo: string | null;
      criterios: { marcas: Array<{ id: string; estado: string }> } | null;
    }>;
  };
  for (const i of corpo.itens) {
    const m = i.criterios?.marcas.find((x) => x.id === 'vac' || x.id === 'inad');
    expect(m?.estado).toBe('atende');
  }
  const todos = await page.request.get('/api/analise-ativos/quadro?classe=fii&limite=100');
  const tc = (await todos.json()) as typeof corpo;
  expect(tc.facetas.tipos.every((t) => t === 'tijolo' || t === 'papel')).toBe(true);
  expect(tc.itens.every((i) => i.fiiTipo === 'tijolo' || i.fiiTipo === 'papel')).toBe(true);
});

test('contrato: JSON do Quadro e da busca sem chave do indicador antigo; ordem antiga = 400', async ({
  page,
}) => {
  const chaves = (v: unknown, out: string[] = []): string[] => {
    if (Array.isArray(v)) v.forEach((x) => chaves(x, out));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        out.push(k);
        chaves(x, out);
      }
    }
    return out;
  };
  for (const url of [
    '/api/analise-ativos/quadro?classe=acao&limite=100',
    '/api/analise-ativos/quadro?classe=fii&janela=3&limite=100',
    '/api/analise-ativos/busca',
  ]) {
    const r = await page.request.get(url);
    expect(r.ok(), url).toBe(true);
    const corpo = await r.json();
    expect(
      chaves(corpo).filter((k) => /indice|semaforo|destaque/i.test(k)),
      url,
    ).toEqual([]);
  }
  for (const qs of ['ordem=indiceMf', 'dyMin=4', 'somenteCompletos=1', 'janela=4']) {
    const r = await page.request.get(`/api/analise-ativos/quadro?classe=acao&${qs}`);
    expect(r.status(), qs).toBe(400);
  }
  const t = (await page.request.get('/api/analise-ativos/quadro?classe=acao&limite=5')).headers();
  expect(t['server-timing']).toMatch(/quadro;dur=/);
});

test('Mostrar mais traz mais 25', async ({ page }) => {
  await abrirQuadro(page);
  const contagem = page.locator('[data-quadro-contagem]');
  await expect(contagem).toContainText('Mostrando');
  const total = Number((await contagem.textContent())?.match(/de (\d+)/)?.[1] ?? 0);
  test.skip(total <= 25, 'menos de 25 ações no Quadro (seed do CI)');
  await expect(linhas(page)).toHaveCount(25);
  await page.getByRole('button', { name: 'Mostrar mais 25' }).click();
  await expect(linhas(page)).toHaveCount(Math.min(50, total));
  await expect(contagem).toContainText(`Mostrando ${Math.min(50, total)} de ${total}`);
});

test('aba FIIs: colunas de fundo, Critérios e contador nas abas', async ({ page }) => {
  await abrirQuadro(page);
  const abaFii = page.getByRole('button', { name: /^FIIs \d+$/ });
  await expect(abaFii).toBeVisible();
  await abaFii.click();
  await expect(page).toHaveURL(/classe=fii/);
  await expect(page.getByRole('button', { name: 'Ordenar por Fundo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ordenar por Critérios' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ordenar por Vacância (CVM)' })).toBeVisible();
  await expect(abaFii).toHaveAttribute('aria-current', 'page');
});

test('busca "weg" → WEGE3 abre a página do ativo; "/" foca a busca', async ({ page }) => {
  await abrirQuadro(page);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  const campo = page.getByRole('combobox', { name: 'Buscar ativo' });
  await expect(campo).toBeFocused();
  await campo.fill('weg');
  const opcao = page.getByRole('option', { name: /WEGE3/ });
  await expect(opcao).toBeVisible({ timeout: 30_000 });
  await expect(campo).toHaveAttribute('aria-expanded', 'true');
  await campo.press('Enter');
  await expect(page).toHaveURL(/\/analise-ativos\/WEGE3$/);
});

test('busca sem resultado diz o que cobre; textos sem linguagem proibida', async ({ page }) => {
  await abrirQuadro(page);
  const campo = page.getByRole('combobox', { name: 'Buscar ativo' });
  // ticker que não existe em nenhuma classe: com ANALISE_ATIVOS_EUA_HABILITADO o AAPL é achado e
  // o aviso cita também stocks e REITs (textosEua.busca.semResultadoComEua)
  await campo.fill('ZZZQ9');
  await expect(page.getByText(/^A busca cobre ações e FIIs da B3/)).toBeVisible({
    timeout: 30_000,
  });
  await campo.fill('');
  // varredura do Quadro (caso 32): literais registrados e nomes de ativo (banco) ficam fora
  for (const classe of ['acao', 'fii']) {
    await abrirQuadro(page, classe === 'fii' ? '?classe=fii&modo=detalhado' : '?modo=detalhado');
    const texto = await quadro(page).evaluate((el) => {
      const copia = el.cloneNode(true) as HTMLElement;
      copia.querySelectorAll('[data-texto-legal], [data-nome-ativo]').forEach((n) => n.remove());
      return copia.textContent ?? '';
    });
    expect(encontrarProibidasV2(texto), classe).toEqual([]);
    expect(texto).not.toMatch(/Índice/);
  }
});
