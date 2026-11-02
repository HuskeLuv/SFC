import type { Page, Request, Route } from '@playwright/test';
import type { HistoricoAlteracaoEntry } from '../../src/hooks/useHistoricoAlteracoes';

/**
 * Apoio dos e2e do Histórico de alterações (/historico-alteracoes) — esconder valores, Fase 6.
 *
 * O seed do CI não grava histórico (a tela cai no vazio). `mockarHistorico(page)` responde por
 * `page.route`:
 *
 * - GET /api/historico-alteracoes?page=&section= → HISTORICO_FIXTURE (filtrado pela seção), com
 *   antes/depois em dinheiro, quantidade e preço (carteira), valor do fluxo, saldo de dívida, um
 *   percentual (fica visível) e uma data;
 * - POST /api/historico-alteracoes/:id/undo → NÃO chega ao servidor: responde 200 e guarda a
 *   chamada em `escritas` (o Desfazer continua funcionando; o teste confere o que foi pedido).
 *
 * Os valores em dinheiro/quantidade são SENTINELAS (improváveis, com centavos): com o olho aberto
 * aparecem; com o olho fechado nenhum pode sobrar no innerText. Use
 * `coletarNumerosDaPosicao(page, escopo, { ignorarPercentuais: true })` (helpers/valoresOcultos).
 * Datas (createdAt e o campo de data) e o percentual continuam visíveis — `ignorarDatas`.
 */

/** pt-BR na tela: 12.345,67 · 13.579,24 · 137,25 · 142,5 · 98,76 · 103,21 · 1.987,65 … */
export const SENTINELAS_HISTORICO = {
  totalAntes: 12345.67,
  totalDepois: 13579.24,
  quantidadeAntes: 137.25,
  quantidadeDepois: 142.5,
  precoAntes: 98.76,
  precoDepois: 103.21,
  fluxoAntes: 1987.65,
  fluxoDepois: 2468.97,
  saldoDividaAntes: 45678.91,
  saldoDividaDepois: 43210.87,
  rendaAposentadoria: 15432.18,
} as const;

const S = SENTINELAS_HISTORICO;

export const ID_HISTORICO = {
  ativo: 'e2e-hist-0000-4000-8000-000000000001',
  fluxo: 'e2e-hist-0000-4000-8000-000000000002',
  divida: 'e2e-hist-0000-4000-8000-000000000003',
  planejamento: 'e2e-hist-0000-4000-8000-000000000004',
  perfil: 'e2e-hist-0000-4000-8000-000000000005',
} as const;

const base = {
  userId: 'e2e-user',
  actorId: 'e2e-user',
  viaConsultant: false,
  undoneAt: null,
  revertsId: null,
};

export const HISTORICO_FIXTURE: HistoricoAlteracaoEntry[] = [
  {
    ...base,
    id: ID_HISTORICO.ativo,
    section: 'carteira',
    action: 'ativo.editar',
    entity: 'portfolio',
    entityId: 'e2e-portfolio-1',
    entityLabel: 'PETR4',
    changes: [
      {
        field: 'quantity',
        label: 'Quantidade',
        before: S.quantidadeAntes,
        after: S.quantidadeDepois,
        format: 'number',
      },
      {
        field: 'avgPrice',
        label: 'Preço médio',
        before: S.precoAntes,
        after: S.precoDepois,
        format: 'currency',
      },
      {
        field: 'totalInvested',
        label: 'Total investido',
        before: S.totalAntes,
        after: S.totalDepois,
        format: 'currency',
      },
    ],
    createdAt: '2026-10-20T14:30:00.000Z',
    canUndo: true,
  },
  {
    ...base,
    id: ID_HISTORICO.fluxo,
    section: 'fluxo-caixa',
    action: 'valor.editar',
    entity: 'cashflow-value',
    entityId: 'e2e-cashflow-1',
    entityLabel: 'Aluguel (outubro/2026)',
    changes: [
      {
        field: 'value',
        label: 'Valor',
        before: S.fluxoAntes,
        after: S.fluxoDepois,
        format: 'currency',
      },
    ],
    createdAt: '2026-10-18T10:05:00.000Z',
    canUndo: true,
  },
  {
    ...base,
    id: ID_HISTORICO.divida,
    section: 'dividas',
    action: 'divida.editar',
    entity: 'divida',
    entityId: 'e2e-divida-1',
    entityLabel: 'Financiamento do apê',
    changes: [
      {
        field: 'saldoDevedor',
        label: 'Saldo devedor',
        before: S.saldoDividaAntes,
        after: S.saldoDividaDepois,
        format: 'currency',
      },
      { field: 'taxaJuros', label: 'Taxa de juros', before: 0.89, after: 0.79, format: 'percent' },
    ],
    createdAt: '2026-10-12T09:00:00.000Z',
    canUndo: false,
  },
  {
    ...base,
    id: ID_HISTORICO.planejamento,
    section: 'planejamento',
    action: 'aposentadoria.editar',
    entity: 'aposentadoria',
    entityId: 'e2e-plano-1',
    entityLabel: null,
    changes: [
      {
        field: 'rendaDesejada',
        label: 'Renda desejada',
        before: null,
        after: S.rendaAposentadoria,
        format: 'currency',
      },
      {
        field: 'dataAlvo',
        label: 'Data-alvo',
        before: '2050-01-01',
        after: '2052-06-01',
        format: 'date',
      },
    ],
    createdAt: '2026-10-05T16:45:00.000Z',
    canUndo: false,
  },
  {
    ...base,
    id: ID_HISTORICO.perfil,
    section: 'perfil',
    action: 'perfil.editar',
    entity: 'user',
    entityId: 'e2e-user',
    entityLabel: null,
    changes: [
      {
        field: 'name',
        label: 'Nome',
        before: 'Usuário Demo',
        after: 'Usuário Demo E2E',
        format: 'text',
      },
    ],
    createdAt: '2026-10-01T08:00:00.000Z',
    canUndo: false,
  },
];

export interface EscritaHistorico {
  metodo: string;
  pathname: string;
}

export async function mockarHistorico(
  page: Page,
  { vazio = false }: { vazio?: boolean } = {},
): Promise<{ escritas: EscritaHistorico[] }> {
  const escritas: EscritaHistorico[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(
    (url) => url.pathname.startsWith('/api/historico-alteracoes'),
    async (route: Route, req: Request) => {
      const url = new URL(req.url());
      const metodo = req.method();
      if (metodo !== 'GET') {
        escritas.push({ metodo, pathname: url.pathname });
        return json(route, { ok: true });
      }
      if (url.pathname !== '/api/historico-alteracoes') {
        return json(route, { error: `sem mock para GET ${url.pathname}` }, 404);
      }
      const secao = url.searchParams.get('section');
      const page = Number(url.searchParams.get('page') ?? '1');
      const data = vazio ? [] : HISTORICO_FIXTURE.filter((e) => !secao || e.section === secao);
      const limit = 20;
      return json(route, {
        data: page === 1 ? data : [],
        pagination: {
          page,
          limit,
          total: data.length,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: page > 1,
        },
      });
    },
  );

  return { escritas };
}
