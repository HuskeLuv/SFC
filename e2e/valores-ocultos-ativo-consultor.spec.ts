import { test, expect, type Page } from '@playwright/test';
import {
  coletarNumerosDaPosicao,
  coletarValoresExpostos,
  expectNumerosAusentes,
  ligarValoresOcultos,
  tamanhoDoDocumento,
} from './helpers/valoresOcultos';
import { openCarteiraTab } from './helpers/mobileFit';

/**
 * Esconder valores — fatia 4: detalhe do ativo (/ativos/[id]) e painel do consultor
 * (/consultor e /consultor/[clientId]). Exige VALORES_OCULTOS_HABILITADO=true (job e2e do CI).
 * Só leitura: a preferência é o cookie do contexto (cada teste começa sem ele).
 *
 * Roteiro de cada tela: lê com o olho ABERTO os números que ela mostra (o sentinela do e2e — os
 * dados do seed são fixos), fecha o olho (cookie do aparelho + reload: o SSR já sai oculto) e
 * confere que nenhum R$/US$ nem nenhum daqueles números aparece. Ficam de fora os % (decisão 2)
 * e o que é [data-mf-valor-visivel] (cotação, câmbio).
 *
 * O usuário do seed do CI não tem ativos: o teste do ativo pula sem link (como o ativo-1280 do
 * desktop-carteira). O consultor do seed (consultor.demo) tem o usuário demo como cliente.
 */

const VARIANTES = [
  { nome: 'computador 1280', use: { viewport: { width: 1280, height: 800 } } },
  {
    nome: 'celular 390',
    use: {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    },
  },
] as const;

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
      // sem storage: o aviso aparece e o teste falha de forma visível
    }
  });
});

/** Números da tela que podem ficar: % (decisão 2) e trechos [data-mf-valor-visivel]. */
async function numerosQuePodemFicar(page: Page): Promise<Set<string>> {
  const { texto, visiveis } = await page.evaluate(() => {
    const raiz = document.querySelector<HTMLElement>('[data-mf-content]') ?? document.body;
    return {
      texto: raiz.innerText,
      visiveis: Array.from(raiz.querySelectorAll<HTMLElement>('[data-mf-valor-visivel]'))
        .map((el) => el.innerText)
        .join('\n'),
    };
  });
  const ficam = new Set<string>();
  for (const m of texto.matchAll(/([\d.,]+)\s?%/g)) ficam.add(m[1]);
  for (const m of visiveis.matchAll(/\d[\d.,]*/g)) ficam.add(m[0]);
  return ficam;
}

async function conferirTela(page: Page, url: string, pronto: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(pronto).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  // Gráficos (carregados por import dinâmico): mede depois que aparecem, nos dois estados.
  await page.waitForTimeout(1_500);
  const graficos = await page.locator('[data-mf-content] .apexcharts-canvas').count();
  const numeros = await coletarNumerosDaPosicao(page);
  const { largura: larguraAberto } = await tamanhoDoDocumento(page);

  await ligarValoresOcultos(page.context(), new URL(page.url()).origin);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-valores-ocultos', '');
  await expect(page.getByText(pronto).first()).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await expect
    .poll(() => page.locator('[data-mf-content] .apexcharts-canvas').count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(graficos);
  await page.waitForTimeout(1_000);
  await expect(page.locator('[data-mf-content] .mf-sensivel').first()).toBeVisible();
  // A pílula não cria rolagem horizontal nova (no celular o viewport de layout ficaria > 390px).
  // Página que já rola com o olho aberto (consultor no computador) tem largura instável entre
  // cargas: aí não há o que comparar.
  if (larguraAberto <= (page.viewportSize()?.width ?? 0)) {
    expect((await tamanhoDoDocumento(page)).largura, 'largura do documento').toBeLessThanOrEqual(
      larguraAberto,
    );
  }

  const ficam = await numerosQuePodemFicar(page);
  await expectNumerosAusentes(
    page,
    numeros.filter((n) => !ficam.has(n)),
  );
  expect(await coletarValoresExpostos(page)).toEqual([]);
}

async function primeiroAtivo(page: Page): Promise<string | null> {
  await page.goto('/carteira', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Ações', exact: true }).first()).toBeVisible({
    timeout: 60_000,
  });
  for (const aba of ['Ações', "FII's", 'Renda Fixa']) {
    const botao = page.getByRole('button', { name: aba, exact: true }).first();
    if ((await botao.count()) === 0) continue;
    await openCarteiraTab(page, aba);
    const fechado = page.locator('[data-mf-card-toggle][aria-expanded="false"]').first();
    if (await fechado.count()) await fechado.click().catch(() => {});
    const href = await page
      .locator('a[href^="/ativos/"]')
      .first()
      .getAttribute('href', { timeout: 3_000 })
      .catch(() => null);
    if (href) return href.split('?')[0].replace(/\/$/, '');
  }
  return null;
}

for (const variante of VARIANTES) {
  test.describe(`esconder valores — ativo e consultor (${variante.nome})`, () => {
    test.use(variante.use);

    test('/ativos/[id]: posição some; cotação e % ficam', async ({ page }) => {
      test.setTimeout(180_000);
      const ativo = await primeiroAtivo(page);
      // O usuário do seed (CI) não tem ativos: sem link não há o que medir.
      test.skip(!ativo, 'sem ativo na /carteira do usuário demo');
      await conferirTela(page, ativo!, 'Extrato');
      // A última cotação continua legível (ValorVisivel).
      await expect(page.locator('[data-mf-valor-visivel]').first()).toContainText(/R\$|US\$/);
    });

    test.describe('consultor.demo', () => {
      test.use({ storageState: { cookies: [], origins: [] } });

      test.beforeEach(async ({ page }) => {
        const res = await page.request.post('/api/auth/login', {
          data: { email: 'consultor.demo@finapp.local', password: '123456' },
        });
        // Só pula sem o usuário (401: seed antigo); outra falha é falha.
        test.skip(res.status() === 401, 'consultor.demo não está no banco (rode o seed)');
        expect(res.status(), 'login do consultor.demo').toBe(200);
      });

      test('painel e cliente: sem R$; contagens, nomes e % ficam', async ({ page }) => {
        test.setTimeout(240_000);
        await conferirTela(page, '/consultor', 'Clientes sob consultoria');
        await expect(page.getByText('Total de clientes')).toBeVisible();
        await expect(page.getByText('Usuário Demo').first()).toBeVisible();

        // Abre o cliente pela API do painel (a tabela não tem link; o id vem da lista).
        const lista = await page.request.get('/api/consultant/clients');
        const clientes = ((await lista.json()) as { clients?: Array<{ clientId: string }> })
          .clients;
        test.skip(!clientes?.length, 'consultor sem clientes no seed');
        await page.context().clearCookies({ name: 'mf_valores_ocultos' });
        await conferirTela(page, `/consultor/${clientes![0].clientId}`, 'Últimas movimentações');
      });
    });
  });
}
