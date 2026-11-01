import { expect, type Page, type Request, type Route } from '@playwright/test';

/**
 * Apoio dos e2e do Planejar (/planejamento-financeiro) — esconder valores, Fase 3.
 *
 * O banco do seed (CI) não tem objetivos nem plano de aposentadoria: os Sonhos caem no estado
 * vazio e a Aposentadoria GRAVA um plano novo ao abrir (o "seed" do simulador faz PUT). Por isso
 * `mockarPlanejar(page)` responde por `page.route` tudo o que a tela pede:
 *
 * - GET  /api/planejamento-sonhos          → PLANEJAR_FIXTURE.objetivos (2 sonhos com entries);
 * - GET  /api/planejamento-sonhos/defaults → disponível/taxa do formulário;
 * - GET  /api/aposentadoria                → PLANEJAR_FIXTURE.plano (com 9 meses registrados e
 *   TODOS os campos auto travados em `fieldLocks`, para o contexto não re-sincronizar nem salvar);
 * - GET  /api/aposentadoria/defaults e /entries/auto;
 * - GET  /api/planejamento/contexto        → reserva de emergência e despesas (widget da reserva);
 * - PUT/POST/DELETE em qualquer um deles   → NÃO chega ao servidor: responde com a fixture e
 *   guarda a chamada em `escritas` (o teste confere que ficou vazio, ou o que foi pedido).
 *
 * Os valores em dinheiro são SENTINELAS (improváveis, todos com centavos): com o olho aberto
 * aparecem; com o olho fechado nenhum pode sobrar no innerText. Use
 * `coletarNumerosDaPosicao(page, escopo, { ignorarPercentuais: true })` (helpers/valoresOcultos)
 * — % de progresso, rentabilidade, inflação e taxas continuam visíveis.
 */

export type ModoPlanejar = 'sonhos' | 'aposentadoria';

export const ROTA_PLANEJAR: Record<ModoPlanejar, string> = {
  sonhos: '/planejamento-financeiro?modo=sonhos',
  aposentadoria: '/planejamento-financeiro?modo=aposentadoria',
};

/** Título da ferramenta montada (h2), o mesmo do desktop-fase3.spec. */
export const TITULO_PLANEJAR: Record<ModoPlanejar, string> = {
  sonhos: 'Planejamento de Sonhos',
  aposentadoria: 'Planejamento de Aposentadoria',
};

const AGORA = '2026-10-15T12:00:00.000Z';

/** Meses YYYY-MM de jan/2026 em diante (dados fixos: não dependem do mês corrente). */
const mes = (i: number) => `2026-${String(i + 1).padStart(2, '0')}`;

/** Valores-sentinela em reais (pt-BR na tela: 87.654,32 · 1.234,56 · …). */
export const SENTINELAS_PLANEJAR = {
  metaViagem: 87654.32,
  disponivelViagem: 4321.98,
  aporteViagem: 1234.56,
  metaCarro: 65432.17,
  disponivelCarro: 3219.87,
  aporteCarro: 987.43,
  patrimonio: 234567.89,
  aporteM: 3456.78,
  renda: 12345.67,
  aporteReal: 3517.29,
  reservaAtual: 23456.71,
  despesaFixa: 6543.21,
  despesaMensal: 9876.54,
  sobraMensal: 2345.68,
} as const;

const S = SENTINELAS_PLANEJAR;

const entriesSonho = (aporte: number, inicial: number, meses: number) =>
  Array.from({ length: meses }, (_, i) => ({
    month: mes(i),
    aporte,
    balance: Math.round((inicial + aporte * (i + 1) * 1.004) * 100) / 100,
  }));

const objetivos = [
  {
    id: '0e0e0e0e-0000-4000-8000-0000000000b1',
    name: 'Viagem ao Japão',
    target: S.metaViagem,
    months: 36,
    startDate: mes(0),
    available: S.disponivelViagem,
    rate: 0.008,
    priority: 'Alta',
    category: 'm',
    status: 'Iniciado',
    notes: null,
    entries: entriesSonho(S.aporteViagem, S.disponivelViagem, 9),
    createdAt: AGORA,
    updatedAt: AGORA,
  },
  {
    id: '0e0e0e0e-0000-4000-8000-0000000000b2',
    name: 'Trocar de carro',
    target: S.metaCarro,
    months: 48,
    startDate: mes(2),
    available: S.disponivelCarro,
    rate: 0.007,
    priority: 'Moderado',
    category: 'l',
    status: 'Iniciado',
    notes: null,
    entries: entriesSonho(S.aporteCarro, S.disponivelCarro, 6).map((e, i) => ({
      ...e,
      month: mes(i + 2),
    })),
    createdAt: AGORA,
    updatedAt: AGORA,
  },
];

/** Plano iniciado em jan/2026; `off` 1..9 = fev..out/2026 (1 = 1º mês após o início). */
const entriesPlano = Array.from({ length: 9 }, (_, i) => ({
  off: i + 1,
  year: 2026,
  month: i + 2,
  aporteReal: S.aporteReal,
  patFinal: Math.round((S.patrimonio + (S.aporteReal + 1800) * (i + 1)) * 100) / 100,
}));

const plano = {
  id: '0e0e0e0e-0000-4000-8000-0000000000c1',
  idade: 35,
  apos: 60,
  vida: 90,
  rentNom: 11.5,
  inflacao: 4.5,
  rentNomRetiro: null,
  patrimonio: S.patrimonio,
  aporteM: S.aporteM,
  renda: S.renda,
  trackStartMonth: 1,
  trackStartYear: 2026,
  eventos: [],
  // Tudo travado: o contexto (carteira/fluxo do usuário real) não re-sincroniza nem dispara PUT.
  fieldLocks: ['patrimonio', 'aporteM', 'renda', 'rentNom', 'inflacao'],
  entries: entriesPlano,
  createdAt: AGORA,
  updatedAt: AGORA,
};

const contexto = {
  asOf: AGORA,
  patrimonio: S.patrimonio,
  reservaEmergenciaAtual: S.reservaAtual,
  aporteMensalRealizado: S.aporteReal,
  aporteMensalAposentadoria: null,
  cdiAnualizado: 11.15,
  inflacao12m: 4.68,
  inflacaoFallback: 4.5,
  cashflow: {
    year: 2026,
    activeMonths: 10,
    sobraMensalMedia: S.sobraMensal,
    despesaMensalMedia: S.despesaMensal,
    despesaFixaMensal: S.despesaFixa,
  },
};

export const PLANEJAR_FIXTURE = { objetivos, plano, contexto } as const;

export interface EscritaPlanejar {
  metodo: string;
  url: string;
}

const caminho = (req: Request) => new URL(req.url()).pathname;

/**
 * Responde por `page.route` as APIs do Planejar com as fixtures. Chame ANTES do `page.goto`.
 * Devolve `escritas`: PUT/POST/DELETE interceptados (nunca chegam ao banco).
 */
export async function mockarPlanejar(page: Page): Promise<{ escritas: EscritaPlanejar[] }> {
  const escritas: EscritaPlanejar[] = [];
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  const responder = async (route: Route) => {
    const req = route.request();
    const metodo = req.method();
    const p = caminho(req);
    if (metodo !== 'GET') escritas.push({ metodo, url: p });

    if (p === '/api/planejamento/contexto') return json(route, contexto);
    if (p === '/api/planejamento-sonhos/defaults') {
      return json(route, { available: S.reservaAtual, rate: 0.008 });
    }
    if (p.startsWith('/api/planejamento-sonhos')) {
      return metodo === 'GET'
        ? json(route, { objetivos })
        : json(route, { objetivo: objetivos[0] });
    }
    if (p === '/api/aposentadoria/defaults') {
      return json(route, { patrimonio: S.patrimonio, rentNom: 11.5, inflacao: 4.5 });
    }
    if (p === '/api/aposentadoria/entries/auto') {
      return metodo === 'GET'
        ? json(route, { asOf: AGORA, derived: [], fillable: 0 })
        : json(route, { plano, filled: 0 });
    }
    if (p.startsWith('/api/aposentadoria')) return json(route, { plano });
    return route.fallback();
  };

  await page.route(
    (url) =>
      url.pathname.startsWith('/api/planejamento-sonhos') ||
      url.pathname.startsWith('/api/aposentadoria') ||
      url.pathname === '/api/planejamento/contexto',
    responder,
  );
  return { escritas };
}

/** Abre a ferramenta do Planejar e espera o título e os dados (fixtures ou banco). */
export async function gotoPlanejar(page: Page, modo: ModoPlanejar) {
  await page.goto(ROTA_PLANEJAR[modo], { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { level: 2, name: TITULO_PLANEJAR[modo] }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
}
