import type { Page, Request, Route } from '@playwright/test';
import type { EventoAgenda } from '../../src/services/calendario/types';

/**
 * Apoio dos e2e da Agenda (/calendario) — esconder valores, Fase 6.
 *
 * O seed do CI não tem dívida e os proventos/vencimentos dependem do mês corrente (início do mês:
 * pode não haver nada). `mockarAgenda(page)` responde por `page.route`:
 *
 * - GET /api/calendar?de=&ate= → eventos MONTADOS DENTRO do período pedido (a partir de hoje, ou
 *   do `de` se for futuro), um de cada tipo com valor: parcela de dívida (a pagar e paga), provento
 *   (pagamento + data-com), vencimento de RF, DARF e um evento manual (sem valor). Serve tanto
 *   para a grade/lista do mês quanto para o painel "Próximos 30 dias" (que pede outro período);
 * - POST/PATCH/DELETE em /api/calendar* → NÃO chega ao servidor: responde 200 e guarda a chamada
 *   em `escritas`.
 *
 * Os valores em dinheiro são SENTINELAS (improváveis, com centavos): com o olho aberto aparecem;
 * com o olho fechado nenhum pode sobrar no innerText. Use
 * `coletarNumerosDaPosicao(page, escopo, { ignorarPercentuais: true })` (helpers/valoresOcultos).
 * Datas, horas, nomes, tickers e "parcela 3/120" continuam visíveis.
 */

/** pt-BR na tela: 3.456,78 · 1.234,56 · 2.222,22 · 187.654,32 · 876,54 · 23.456,78 · 789,01 … */
export const SENTINELAS_AGENDA = {
  parcela: 3456.78,
  juros: 1234.56,
  amortizacao: 2222.22,
  saldoDevedor: 187654.32,
  parcelaPaga: 3398.17,
  proventoLiquido: 876.54,
  proventoBruto: 931.47,
  rfVencimento: 23456.78,
  rfAplicado: 20123.45,
  darf: 789.01,
} as const;

const S = SENTINELAS_AGENDA;

const pad = (n: number) => String(n).padStart(2, '0');
const civil = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const somarDias = (s: string, dias: number) => {
  const [a, m, d] = s.split('-').map(Number);
  return civil(new Date(a, m - 1, d + dias));
};

/** Eventos do período [de, ate], começando em max(de, hoje). */
export function eventosAgendaFixture(de: string, ate: string): EventoAgenda[] {
  const hoje = civil(new Date());
  const inicio = de > hoje ? de : hoje;
  const dia = (n: number) => {
    const d = somarDias(inicio, n);
    return d <= ate ? d : null;
  };
  const passado = de < hoje ? de : null;
  const ev = (
    o: Partial<EventoAgenda> & Pick<EventoAgenda, 'id' | 'tipo' | 'titulo'>,
    data: string | null,
  ) =>
    data
      ? ({
          dataFim: null,
          hora: null,
          valor: null,
          descricao: null,
          link: null,
          detalhe: {},
          ...o,
          data,
        } as EventoAgenda)
      : null;

  const lista = [
    ev(
      {
        id: 'divida:e2e-apto:14',
        tipo: 'divida',
        titulo: 'Financiamento do apê · parcela 14/360',
        valor: S.parcela,
        descricao: 'Parcela a pagar',
        link: '/dividas/e2e-apto',
        detalhe: {
          instituicao: 'Banco E2E',
          numero: 14,
          total: 360,
          paga: false,
          juros: S.juros,
          amortizacao: S.amortizacao,
          saldoDevedor: S.saldoDevedor,
          indexador: 'TR',
        },
      },
      dia(1),
    ),
    ev(
      {
        id: 'divida:e2e-apto:13',
        tipo: 'divida',
        titulo: 'Financiamento do apê · parcela 13/360',
        valor: S.parcelaPaga,
        descricao: 'Parcela paga',
        link: '/dividas/e2e-apto',
        detalhe: { instituicao: 'Banco E2E', numero: 13, total: 360, paga: true, indexador: 'TR' },
      },
      passado,
    ),
    ev(
      {
        id: 'provento:e2e-petr4:pagamento',
        tipo: 'provento',
        titulo: 'PETR4 · Dividendo',
        valor: S.proventoLiquido,
        descricao: 'Pagamento previsto (provisionado)',
        link: '/carteira',
        detalhe: {
          evento: 'pagamento',
          symbol: 'PETR4',
          tipoProvento: 'Dividendo',
          bruto: S.proventoBruto,
          liquido: S.proventoLiquido,
          dataCom: inicio,
          dataPagamento: dia(3) ?? inicio,
          provisionado: true,
        },
      },
      dia(3),
    ),
    ev(
      {
        id: 'provento:e2e-petr4:data-com',
        tipo: 'provento',
        titulo: 'PETR4 · data-com',
        descricao: 'Dividendo: último dia com direito',
        link: '/carteira',
        detalhe: { evento: 'data-com', symbol: 'PETR4', tipoProvento: 'Dividendo' },
      },
      dia(0),
    ),
    ev(
      {
        id: 'rf:e2e-cdb:vencimento',
        tipo: 'rf',
        titulo: 'CDB Banco E2E · vencimento',
        valor: S.rfVencimento,
        descricao: 'CDB, 110% do CDI. Valor aplicado.',
        link: '/carteira',
        detalhe: {
          tipoTitulo: 'CDB',
          taxa: '110% do CDI',
          investedAmount: S.rfAplicado,
          isentoIr: false,
        },
      },
      dia(5),
    ),
    ev(
      {
        id: 'ir:e2e-darf',
        tipo: 'ir',
        titulo: 'DARF de renda variável',
        valor: S.darf,
        descricao: 'Imposto sobre vendas do mês anterior',
        link: '/carteira',
        detalhe: {},
      },
      dia(7),
    ),
    ev(
      {
        id: 'manual:e2e-seguro:1',
        tipo: 'manual',
        titulo: 'Renovar seguro',
        hora: '10:00',
        detalhe: { categoria: 'outro', recorrencia: 'nenhuma', lembrete: true },
      },
      dia(2),
    ),
  ];
  return lista.filter((e): e is EventoAgenda => e !== null);
}

export interface EscritaAgenda {
  metodo: string;
  pathname: string;
}

export async function mockarAgenda(page: Page): Promise<{ escritas: EscritaAgenda[] }> {
  const escritas: EscritaAgenda[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(
    (url) => url.pathname === '/api/calendar' || url.pathname.startsWith('/api/calendar/'),
    async (route: Route, req: Request) => {
      const url = new URL(req.url());
      const metodo = req.method();
      if (url.pathname.startsWith('/api/calendar/ical')) return route.continue();
      if (metodo !== 'GET') {
        escritas.push({ metodo, pathname: url.pathname });
        return json(route, { ok: true });
      }
      const de = url.searchParams.get('de') ?? civil(new Date());
      const ate = url.searchParams.get('ate') ?? somarDias(de, 30);
      return json(route, {
        eventos: eventosAgendaFixture(de, ate),
        periodo: { de, ate },
        fontesComErro: [],
      });
    },
  );

  return { escritas };
}
