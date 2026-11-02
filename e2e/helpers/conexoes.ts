import type { Page, Request, Route } from '@playwright/test';
import { CONEXAO_ID, carteiraImportada, itensDestinos } from './destinosMock';

/**
 * Apoio dos e2e de Conexões bancárias (/conexoes-bancarias) — esconder valores, Fase 5.
 *
 * O CI (e o dev) rodam com a integração Pluggy DESLIGADA: o servidor responde 503 e a tela cai no
 * aviso "ainda não está disponível". Por isso `mockarConexoes(page)` responde por `page.route`
 * tudo o que a tela pede ao /api/pluggy/*:
 *
 * - GET config / connections (1 banco com conta corrente, poupança e cartão, com SALDO) /
 *   consentimentos / transactions?accountId= (extrato da conta) / caixa-entrada (pendentes) /
 *   carteira (investimentos importados de helpers/destinosMock + 1 empréstimo) / carteira/destinos;
 * - qualquer POST/PATCH/DELETE → NÃO chega ao servidor: responde 200 `{}` e guarda a chamada em
 *   `escritas` (o teste confere que ficou vazio).
 *
 * Os valores em dinheiro DO USUÁRIO são SENTINELAS (improváveis, todos com centavos): com o olho
 * aberto aparecem; com o olho fechado nenhum pode sobrar no innerText. Use
 * `coletarNumerosDaPosicao(page, escopo, { ignorarPercentuais: true })` (helpers/valoresOcultos).
 * Os saldos da carteira importada vêm de destinosMock (11.235, 7.896 …, sem centavos).
 * `comDestinos` = chave PLUGGY_DESTINOS_HABILITADO ligada (aba de destinos / "Novo · conferir").
 */

const AGORA = '2026-10-15T12:00:00.000Z';

/** Valores-sentinela em reais (pt-BR na tela: 18.765,43 · 4.321,87 · 2.468,13 …). */
export const SENTINELAS_CONEXOES = {
  saldoCorrente: 18765.43,
  saldoPoupanca: 4321.87,
  faturaCartao: 2468.13,
  limiteCartao: 9876.54,
  disponivelCartao: 7408.41,
  salario: 8642.19,
  mercado: 387.62,
  energia: 213.47,
  pix: 1357.91,
  emprestimoContratado: 25432.17,
  emprestimoSaldo: 17654.29,
  emprestimoParcela: 987.63,
} as const;

const S = SENTINELAS_CONEXOES;

export const ID_CONTA = {
  corrente: '0d0d0d0d-0000-4000-8000-0000000000c1',
  poupanca: '0d0d0d0d-0000-4000-8000-0000000000c2',
  cartao: '0d0d0d0d-0000-4000-8000-0000000000c3',
} as const;

const conta = (o: Record<string, unknown>) => ({
  connectionId: CONEXAO_ID,
  subtype: null,
  number: null,
  currencyCode: 'BRL',
  balanceAt: AGORA,
  creditLimit: null,
  creditAvailable: null,
  creditBrand: null,
  creditDueDate: null,
  creditClosingDate: null,
  ativa: true,
  ...o,
});

export const CONEXAO_FIXTURE = {
  id: CONEXAO_ID,
  provider: 'pluggy',
  providerItemId: 'item-e2e-valores',
  connectorId: 1,
  connectorName: 'XP Investimentos',
  connectorImageUrl: null,
  isOpenFinance: true,
  isSandbox: true,
  status: 'UPDATED',
  executionStatus: 'SUCCESS',
  errorMessage: null,
  consentExpiresAt: '2027-10-06T00:00:00.000Z',
  providerUpdatedAt: AGORA,
  lastSyncAt: AGORA,
  lastSyncError: null,
  lastManualUpdateAt: null,
  createdAt: AGORA,
  avisos: [],
  accounts: [
    conta({
      id: ID_CONTA.corrente,
      providerAccountId: 'acc-corrente',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      name: 'Conta corrente',
      number: '12345-6',
      balance: S.saldoCorrente,
    }),
    conta({
      id: ID_CONTA.poupanca,
      providerAccountId: 'acc-poupanca',
      type: 'BANK',
      subtype: 'SAVINGS_ACCOUNT',
      name: 'Poupança',
      number: '12345-7',
      balance: S.saldoPoupanca,
    }),
    conta({
      id: ID_CONTA.cartao,
      providerAccountId: 'acc-cartao',
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      name: 'Cartão Black',
      number: '4321',
      balance: S.faturaCartao,
      creditLimit: S.limiteCartao,
      creditAvailable: S.disponivelCartao,
      creditBrand: 'VISA',
      creditDueDate: '2026-11-10T00:00:00.000Z',
      creditClosingDate: '2026-11-03T00:00:00.000Z',
    }),
  ],
};

const transacao = (o: Record<string, unknown>) => ({
  accountId: ID_CONTA.corrente,
  status: 'POSTED',
  currencyCode: 'BRL',
  providerCategory: null,
  merchantName: null,
  paymentMethod: null,
  counterpartName: null,
  installmentNumber: null,
  installmentTotal: null,
  ignorada: false,
  cashflowItemId: null,
  appliedAt: null,
  duplicadaDe: null,
  ...o,
});

/** Extrato (GET /api/pluggy/transactions?accountId=): mesmo conteúdo para qualquer conta. */
export function extratoFixture(accountId: string) {
  const transactions = [
    transacao({
      id: 'tx-e2e-1',
      date: '2026-10-05T12:00:00.000Z',
      description: 'Salário',
      amount: S.salario,
      type: 'CREDIT',
      providerCategory: 'Salary',
    }),
    transacao({
      id: 'tx-e2e-2',
      date: '2026-10-08T12:00:00.000Z',
      description: 'Supermercado',
      merchantName: 'Supermercado Exemplo',
      amount: -S.mercado,
      type: 'DEBIT',
      providerCategory: 'Groceries',
    }),
    transacao({
      id: 'tx-e2e-3',
      date: '2026-10-10T12:00:00.000Z',
      description: 'Conta de energia',
      amount: -S.energia,
      type: 'DEBIT',
      providerCategory: 'Electricity',
      cashflowItemId: 'item-e2e-energia',
      appliedAt: AGORA,
    }),
    transacao({
      id: 'tx-e2e-4',
      date: '2026-10-12T12:00:00.000Z',
      description: 'Pix enviado',
      amount: -S.pix,
      type: 'DEBIT',
      providerCategory: 'Transfer - PIX',
      ignorada: true,
    }),
  ].map((t) => ({ ...t, accountId }));
  return {
    transactions,
    pagination: { page: 1, limit: 50, total: transactions.length, totalPages: 1 },
  };
}

const pendente = (o: Record<string, unknown>) => ({
  accountId: ID_CONTA.corrente,
  contaNome: 'Conta corrente',
  merchantName: null,
  providerCategory: null,
  competencia: null,
  sugestao: { tipo: 'nenhuma', itemId: null, rotulo: null },
  ...o,
});

/** Caixa de entrada (GET /api/pluggy/caixa-entrada): sugestão de linha, transferência e sem sugestão. */
export function caixaEntradaFixture() {
  const pendentes = [
    pendente({
      id: 'tx-e2e-1',
      date: '2026-10-05T12:00:00.000Z',
      description: 'Salário',
      amount: S.salario,
      type: 'CREDIT',
      providerCategory: 'Salary',
      sugestao: { tipo: 'linha', itemId: 'item-e2e-salario', rotulo: 'Entradas Fixas › Salário' },
    }),
    pendente({
      id: 'tx-e2e-2',
      date: '2026-10-08T12:00:00.000Z',
      description: 'Supermercado',
      merchantName: 'Supermercado Exemplo',
      amount: -S.mercado,
      type: 'DEBIT',
      providerCategory: 'Groceries',
      sugestao: {
        tipo: 'linha',
        itemId: 'item-e2e-mercado',
        rotulo: 'Despesas Variáveis › Alimentação › Mercado',
      },
    }),
    pendente({
      id: 'tx-e2e-4',
      date: '2026-10-12T12:00:00.000Z',
      description: 'Pix enviado',
      amount: -S.pix,
      type: 'DEBIT',
      providerCategory: 'Transfer - PIX',
      sugestao: { tipo: 'transferencia', itemId: null, rotulo: null },
    }),
  ];
  return { pendentes, total: pendentes.length, page: 1, totalPages: 1 };
}

/** Carteira importada (GET /api/pluggy/carteira): investimentos do destinosMock + 1 empréstimo. */
export function carteiraConexoesFixture(comDestinos: boolean) {
  return {
    ...carteiraImportada(comDestinos),
    emprestimos: [
      {
        id: '0d0d0d0d-0000-4000-8000-0000000000e1',
        banco: 'XP Investimentos',
        productName: 'Crédito pessoal',
        type: 'PERSONAL_LOAN',
        contractAmount: S.emprestimoContratado,
        outstanding: S.emprestimoSaldo,
        nextInstallmentAmount: S.emprestimoParcela,
        cet: 0.0213,
        amortization: 'PRICE',
        totalInstallments: 36,
        paidInstallments: 10,
        dueDate: '2028-08-10T00:00:00.000Z',
        ativo: true,
        dividaId: null,
        importStatus: 'importado',
        importError: null,
        importedAt: AGORA,
      },
    ],
  };
}

export interface MockConexoes {
  /** POST/PATCH/DELETE que a tela tentou (nenhum chega ao servidor). */
  escritas: { metodo: string; pathname: string }[];
}

/** Responde todo o /api/pluggy/* da tela de Conexões com as fixtures acima. Só leitura. */
export async function mockarConexoes(
  page: Page,
  {
    comDestinos = false,
    semConexoes = false,
  }: { comDestinos?: boolean; semConexoes?: boolean } = {},
): Promise<MockConexoes> {
  const escritas: MockConexoes['escritas'] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route(
    (url) => url.pathname.startsWith('/api/pluggy/'),
    async (route: Route, req: Request) => {
      const url = new URL(req.url());
      const { pathname } = url;
      const metodo = req.method();
      if (metodo !== 'GET') {
        escritas.push({ metodo, pathname });
        return json(route, {});
      }
      if (pathname === '/api/pluggy/config') {
        return json(route, { habilitado: true, incluiSandbox: true });
      }
      if (pathname === '/api/pluggy/connections') {
        return json(route, { connections: semConexoes ? [] : [CONEXAO_FIXTURE] });
      }
      if (pathname === '/api/pluggy/consentimentos') {
        return json(route, { consentimentos: [] });
      }
      if (pathname === '/api/pluggy/transactions') {
        return json(route, extratoFixture(url.searchParams.get('accountId') ?? ID_CONTA.corrente));
      }
      if (pathname === '/api/pluggy/caixa-entrada') {
        return json(route, caixaEntradaFixture());
      }
      if (pathname === '/api/pluggy/carteira') {
        return json(route, carteiraConexoesFixture(comDestinos));
      }
      if (pathname === '/api/pluggy/carteira/destinos') {
        if (!comDestinos) return json(route, { habilitado: false, itens: [], paraRevisar: 0 });
        const itens = itensDestinos().filter(
          (i) => url.searchParams.get('paraRevisar') !== '1' || i.situacao === 'para-revisar',
        );
        return json(route, {
          habilitado: true,
          itens,
          paraRevisar: itens.filter((i) => i.situacao === 'para-revisar').length,
        });
      }
      return json(route, { error: `sem mock para GET ${pathname}` }, 404);
    },
  );

  return { escritas };
}
