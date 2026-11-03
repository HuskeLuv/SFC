import type { Page, Request, Route } from '@playwright/test';
import type { NotificationItem } from '../../src/hooks/useNotifications';

/**
 * Apoio dos e2e do sino de notificações (NotificationDropdown no desktop, MobileHeader no
 * celular) — esconder valores, Fase 6.
 *
 * O seed do CI não grava notificação. `mockarNotificacoes(page)` responde por `page.route`:
 *
 * - GET   /api/notifications → NOTIFICACOES_FIXTURE (orçamento estourado e provento pago, com R$
 *   no texto; um convite de consultor sem valor);
 * - PATCH /api/notifications (marcar como lida) → NÃO chega ao servidor: 200, guardado em
 *   `escritas`.
 *
 * Os valores em dinheiro são SENTINELAS: com o olho fechado nenhum pode sobrar no innerText do
 * dropdown (decisão 13: notificações do sino com pílula). Use
 * `coletarNumerosDaPosicao(page, escopo, { ignorarPercentuais: true })` (helpers/valoresOcultos)
 * — o "(154%)" continua visível.
 */

/** pt-BR no texto: 3.845,67 · 2.500,13 · 1.234,89 (sentinelas com centavos). */
export const SENTINELAS_NOTIFICACOES = {
  gastoOrcamento: 3845.67,
  limiteOrcamento: 2500.13,
  provento: 1234.89,
} as const;

const S = SENTINELAS_NOTIFICACOES;
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const NOTIFICACOES_FIXTURE: NotificationItem[] = [
  {
    id: 'e2e-notif-1',
    title: 'Orçamento de Habitação estourado',
    message: `O orçamento de Habitação de novembro passou do limite: ${brl(S.gastoOrcamento)} de ${brl(S.limiteOrcamento)} (154%). Vale rever os gastos da categoria.`,
    type: 'orcamento',
    metadata: null,
    readAt: null,
    createdAt: '2026-11-01T12:00:00.000Z',
    invite: null,
  },
  {
    id: 'e2e-notif-2',
    title: `Provento de ${brl(S.provento)} pago`,
    message: `PETR4 pagou ${brl(S.provento)} de dividendos. O valor entrou no caixa para investir.`,
    type: 'provento',
    metadata: null,
    readAt: null,
    createdAt: '2026-10-31T12:00:00.000Z',
    invite: null,
  },
  {
    id: 'e2e-notif-3',
    title: 'Bem-vindo ao My Finance',
    message: 'Explore a carteira, o fluxo de caixa e o planejamento.',
    type: 'info',
    metadata: null,
    readAt: '2026-10-01T12:00:00.000Z',
    createdAt: '2026-10-01T12:00:00.000Z',
    invite: null,
  },
];

export interface EscritaNotificacoes {
  metodo: string;
  pathname: string;
}

export async function mockarNotificacoes(page: Page): Promise<{ escritas: EscritaNotificacoes[] }> {
  const escritas: EscritaNotificacoes[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(
    (url) => url.pathname === '/api/notifications',
    async (route: Route, req: Request) => {
      const metodo = req.method();
      if (metodo !== 'GET') {
        escritas.push({ metodo, pathname: '/api/notifications' });
        return json(route, { ok: true });
      }
      return json(route, { notifications: NOTIFICACOES_FIXTURE });
    },
  );

  return { escritas };
}
