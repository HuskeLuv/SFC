import { expect, test, type Page } from '@playwright/test';

/**
 * Apoio dos e2e do Orçamento v2 (ticket 86e3v8p3u, desenho técnico §8/§9 PR 13).
 *
 * Usuário próprio do seed (prisma/seedOrcamentoV2.ts: orcamento.v2@finapp.local, ativado e no
 * beta), com sessão gravada pelo e2e/auth.setup.ts. O demo NÃO entra no beta: as specs e os
 * snapshots de hoje (orcamento-*, planilha-*) continuam vendo a tela antiga.
 *
 * A flag ORCAMENTO_V2_HABILITADO é do SERVIDOR (env em runtime, sem NEXT_PUBLIC): as specs
 * perguntam ao próprio servidor (GET /api/cashflow/orcamento/v2/acesso, que nunca responde 404) e
 * pulam com `estado: 'desligada'` — o mesmo padrão das rotas atrás de flag (FLAGGED_ROUTES). Com a
 * flag ligada, o usuário do seed TEM de estar liberado e ativado (senão é falha, não pulo).
 *
 * Os testes que gravam (orçado, copiar, excluir) gravam só neste usuário, mas seguem a regra da
 * suíte: só com E2E_ALLOW_WRITES=1 (o CI liga; banco efêmero). Localmente, rode o seed antes.
 */
export const ORCAMENTO_V2_STORAGE = 'e2e/.auth/orcamento-v2.json';

const ACESSO = '/api/cashflow/orcamento/v2/acesso';

/** Pula sem a flag (ou, fora do CI, sem o usuário do seed); exige `liberada && ativado`. */
export async function exigirOrcamentoV2(page: Page) {
  const res = await page.request.get(ACESSO);
  if (res.status() === 401 && !process.env.CI) {
    test.skip(true, 'sem sessão do orcamento.v2@finapp.local: rode o seed (npm run seed)');
  }
  expect(res.ok(), `GET ${ACESSO}: ${res.status()}`).toBeTruthy();
  const corpo = (await res.json()) as { estado: string; ativado: boolean };
  test.skip(corpo.estado === 'desligada', 'flag desligada: ORCAMENTO_V2_HABILITADO');
  expect(corpo, 'usuário do seed liberado e ativado no Orçamento v2').toEqual({
    estado: 'liberada',
    ativado: true,
  });
}

/** Esconde o devtools do React Query e aceita o aviso de cookies (não mudam o que é medido). */
export async function prepararPagina(page: Page) {
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
      // sem storage: o aviso de cookies aparece, mas não muda o que é medido
    }
  });
}

/** Abre a aba Orçamento direto pela URL e espera a raiz do v2. */
export async function gotoOrcamentoV2(page: Page) {
  await page.goto('/fluxodecaixa?modo=orcamento', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-mf-orcamento-v2]')).toBeVisible({ timeout: 60_000 });
}

/** `num()` da apresentação (pt-BR, 2 casas): 1090 → "1.090,00". */
export const brl = (n: number): string =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Valor inteiro novo (100–899) para um orçado: muda a cada execução. */
export const valorNovo = (): number => 100 + (Date.now() % 800);

/** Resposta do PUT do orçado de uma subcategoria (a gravação é otimista; espera o servidor). */
export const isPutOrcado = (r: { url(): string; request(): { method(): string } }) =>
  /\/api\/cashflow\/orcamento\/v2\/subcategorias\/[^/]+\/orcado$/.test(r.url()) &&
  r.request().method() === 'PUT';

interface PayloadV2 {
  ano: number;
  mes: number;
  copiarDe: { ano: number; mes: number; temOrcado: boolean };
  categorias: { nome: string; subcategorias: { nome: string; valor: number | null }[] }[];
}

/** GET v2 do mês (padrão: o mês de hoje, o mesmo que a tela abre). */
export async function payloadV2(
  page: Page,
  params: { ano?: number; mes?: number } = {},
): Promise<PayloadV2> {
  const q = new URLSearchParams({ visao: 'mes' });
  if (params.ano) q.set('ano', String(params.ano));
  if (params.mes) q.set('mes', String(params.mes));
  const res = await page.request.get(`/api/cashflow/orcamento/v2?${q.toString()}`);
  expect(res.ok(), `GET v2: ${res.status()}`).toBeTruthy();
  return (await res.json()) as PayloadV2;
}

/** Orçado gravado (R$) de uma subcategoria no payload. */
export function valorDaSub(p: PayloadV2, categoria: string, sub: string): number | null {
  const c = p.categorias.find((x) => x.nome === categoria);
  const s = c?.subcategorias.find((x) => x.nome === sub);
  if (!s) throw new Error(`subcategoria ${categoria} › ${sub} fora do payload`);
  return s.valor;
}
