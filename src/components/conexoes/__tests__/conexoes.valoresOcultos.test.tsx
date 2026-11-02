// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ComValoresOcultos,
  expectPilulas,
  expectSemValoresExpostos,
  representacoesDoSentinela,
} from '@/test/valoresOcultos';
import type {
  BankAccountDTO,
  BankConnectionDTO,
  BankTransactionDTO,
  CarteiraImportadaResposta,
  EmprestimoImportadoDTO,
  InvestimentoImportadoDTO,
  PendenteDTO,
} from '@/hooks/useConexoesBancarias';
import type { DestinoImportadoItem } from '@/lib/pluggyDestinos';
import { ASSETS, itemDe, listaPadrao } from '../destinos/__tests__/fixtures';

/**
 * Esconder valores (Fase 5, fatia 3): Conexões bancárias com o olho fechado. Fixtures com
 * SENTINELAS (saldos e limite das contas, valores do extrato e da caixa de entrada, saldo dos
 * investimentos importados e do empréstimo, saldo no destino): nenhum R$ nem sentinela no texto
 * nem em title/aria-label; nomes, datas, contagens, CET e parcelas continuam. Olho aberto: os
 * valores aparecem como hoje e não há pílula.
 */

const h = vi.hoisted(() => ({
  belowLg: false,
  extrato: null as unknown,
  caixa: null as unknown,
  carteira: null as unknown,
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/conexoes-bancarias' }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => h.belowLg,
  useMediaQuery: () => h.belowLg,
}));
vi.mock('@/hooks/useConexoesBancarias', async (orig) => {
  const real = await orig<typeof import('@/hooks/useConexoesBancarias')>();
  const mutacao = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    ...real,
    useExtrato: () => ({
      data: h.extrato,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
    }),
    useDesaplicarTransacoes: mutacao,
    useCaixaEntrada: () => ({
      data: h.caixa,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
    }),
    useLinhasFluxo: () => ({
      data: [{ itemId: 'item-mercado', rotulo: 'Despesas Variáveis › Mercado', tipo: 'despesa' }],
    }),
    useAplicarTransacoes: mutacao,
    useIgnorarTransacoes: mutacao,
    useCarteiraImportada: () => ({
      data: h.carteira,
      isLoading: false,
      isError: false,
      error: null,
    }),
    useImportarCarteira: mutacao,
    useIgnorarInvestimento: mutacao,
  };
});

import ConexaoCard from '../ConexaoCard';
import ExtratoConta from '../ExtratoConta';
import CaixaEntrada from '../CaixaEntrada';
import CarteiraImportada from '../CarteiraImportada';
import RevisarDestinos from '../destinos/RevisarDestinos';
import DestinoPainelLinha from '../destinos/DestinoPainelLinha';

/** Sentinelas desta tela (pt-BR: 18.765,43 · 4.321,87 …). */
const S = {
  saldoCorrente: 18765.43,
  faturaCartao: 2468.13,
  limiteCartao: 9876.54,
  salario: 8642.19,
  mercado: 387.62,
  investimento: 13579.24,
  emprestimoContratado: 25432.17,
  emprestimoSaldo: 17654.29,
  destinoPetr4: 11235.67,
  destinoCdb: 15024.38,
  reservaAtual: 6543.21,
} as const;
const SENTINELAS = Object.values(S);

const conta = (o: Partial<BankAccountDTO>): BankAccountDTO =>
  ({
    connectionId: 'c1',
    providerAccountId: 'p',
    subtype: null,
    number: null,
    currencyCode: 'BRL',
    balanceAt: '2026-10-15T12:00:00.000Z',
    creditLimit: null,
    creditAvailable: null,
    creditBrand: null,
    creditDueDate: null,
    creditClosingDate: null,
    ativa: true,
    ...o,
  }) as BankAccountDTO;

const CORRENTE = conta({
  id: 'a1',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  name: 'Conta corrente',
  number: '12345-6',
  balance: S.saldoCorrente,
});
const CARTAO = conta({
  id: 'a2',
  type: 'CREDIT',
  subtype: 'CREDIT_CARD',
  name: 'Cartão Black',
  number: '4321',
  balance: S.faturaCartao,
  creditLimit: S.limiteCartao,
  creditDueDate: '2026-11-10T00:00:00.000Z',
});

const CONEXAO = {
  id: 'c1',
  provider: 'pluggy',
  providerItemId: 'item',
  connectorId: 1,
  connectorName: 'XP Investimentos',
  connectorImageUrl: null,
  isOpenFinance: true,
  isSandbox: false,
  status: 'UPDATED',
  executionStatus: 'SUCCESS',
  errorMessage: null,
  consentExpiresAt: '2027-10-06T00:00:00.000Z',
  providerUpdatedAt: '2026-10-15T12:00:00.000Z',
  lastSyncAt: '2026-10-15T12:00:00.000Z',
  lastSyncError: null,
  lastManualUpdateAt: null,
  createdAt: '2026-10-15T12:00:00.000Z',
  avisos: [],
  accounts: [CORRENTE, CARTAO],
} as unknown as BankConnectionDTO;

const tx = (o: Partial<BankTransactionDTO>): BankTransactionDTO =>
  ({
    accountId: 'a1',
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
  }) as BankTransactionDTO;

const EXTRATO = {
  transactions: [
    tx({
      id: 't1',
      date: '2026-10-05T12:00:00.000Z',
      description: 'Salário',
      amount: S.salario,
      type: 'CREDIT',
    }),
    tx({
      id: 't2',
      date: '2026-10-08T12:00:00.000Z',
      description: 'Supermercado',
      amount: -S.mercado,
      type: 'DEBIT',
      providerCategory: 'Groceries',
      cashflowItemId: 'item-mercado',
    }),
  ],
  pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
};

const pendente = (o: Partial<PendenteDTO>): PendenteDTO =>
  ({
    accountId: 'a1',
    contaNome: 'Conta corrente',
    merchantName: null,
    providerCategory: null,
    competencia: null,
    sugestao: { tipo: 'nenhuma', itemId: null, rotulo: null },
    ...o,
  }) as PendenteDTO;

const CAIXA = {
  pendentes: [
    pendente({
      id: 't1',
      date: '2026-10-05T12:00:00.000Z',
      description: 'Salário',
      amount: S.salario,
      type: 'CREDIT',
    }),
    pendente({
      id: 't2',
      date: '2026-10-08T12:00:00.000Z',
      description: 'Supermercado',
      amount: -S.mercado,
      type: 'DEBIT',
      sugestao: { tipo: 'linha', itemId: 'item-mercado', rotulo: 'Despesas Variáveis › Mercado' },
    }),
  ],
  total: 2,
  page: 1,
  totalPages: 1,
};

const INVESTIMENTO = {
  id: 'i1',
  banco: 'XP Investimentos',
  type: 'FIXED_INCOME',
  subtype: 'CDB',
  name: 'CDB XP 102% CDI',
  code: null,
  balance: S.investimento,
  quantity: null,
  amountOriginal: null,
  rate: 102,
  rateType: 'CDI',
  dueDate: '2028-01-03T00:00:00.000Z',
  issuer: null,
  status: 'ACTIVE',
  ativo: true,
  assetId: 'as1',
  portfolioId: 'p1',
  importStatus: 'importado',
  importError: null,
  importedAt: '2026-10-06T12:00:00.000Z',
} as unknown as InvestimentoImportadoDTO;

const EMPRESTIMO = {
  id: 'e1',
  banco: 'XP Investimentos',
  productName: 'Crédito pessoal',
  type: 'PERSONAL_LOAN',
  contractAmount: S.emprestimoContratado,
  outstanding: S.emprestimoSaldo,
  nextInstallmentAmount: 987.63,
  cet: 0.0213,
  amortization: 'PRICE',
  totalInstallments: 36,
  paidInstallments: 10,
  dueDate: '2028-08-10T00:00:00.000Z',
  ativo: true,
  dividaId: null,
  importStatus: 'importado',
  importError: null,
  importedAt: '2026-10-06T12:00:00.000Z',
} as unknown as EmprestimoImportadoDTO;

const CARTEIRA = {
  investimentos: [INVESTIMENTO],
  emprestimos: [EMPRESTIMO],
} as unknown as CarteiraImportadaResposta;

function Telas() {
  return (
    <>
      <ConexaoCard
        conexao={CONEXAO}
        contaSelecionada={null}
        ocupada={false}
        onVerExtrato={vi.fn()}
        onAtualizar={vi.fn()}
        onReconectar={vi.fn()}
        onExcluir={vi.fn()}
      />
      <ExtratoConta conta={CORRENTE} onFechar={vi.fn()} />
      <CaixaEntrada onAviso={vi.fn()} />
      <CarteiraImportada onAviso={vi.fn()} />
    </>
  );
}

const textoComSentinela = (container: HTMLElement) =>
  SENTINELAS.flatMap(representacoesDoSentinela).filter((f) =>
    (container.textContent ?? '').includes(f),
  );

beforeEach(() => {
  h.belowLg = false;
  h.extrato = EXTRATO;
  h.caixa = CAIXA;
  h.carteira = CARTEIRA;
});
afterEach(() => cleanup());

describe.each([
  ['computador', false],
  ['celular', true],
])('Conexões bancárias — %s', (_nome, belowLg) => {
  it('olho fechado: saldos, limite, extrato, caixa e carteira importada viram pílula', () => {
    h.belowLg = belowLg;
    render(
      <ComValoresOcultos>
        <Telas />
      </ComValoresOcultos>,
    );
    expectSemValoresExpostos(document.body, { sentinelas: SENTINELAS });
    expectPilulas(document.body);
    // Mercado/contagens/nomes continuam: CET, parcelas, datas, conta.
    expect(document.body.textContent).toContain('CET 2.1% a.a.');
    expect(document.body.textContent).toContain('10/36');
    expect(document.body.textContent).toContain('Cartão Black');
    expect(document.body.textContent).toContain('05/10/2026');
  });

  it('olho aberto: os valores aparecem como hoje, sem pílula', () => {
    h.belowLg = belowLg;
    render(
      <ComValoresOcultos ocultos={false}>
        <Telas />
      </ComValoresOcultos>,
    );
    expectPilulas(document.body, 0);
    expect(textoComSentinela(document.body)).toEqual(
      expect.arrayContaining(['18.765,43', '9.876,54', '8.642,19', '387,62', '25.432,17']),
    );
  });
});

describe('Caixa de entrada no celular — escolha da linha', () => {
  it('o assunto do sheet (descrição · valor) esconde o valor', async () => {
    h.belowLg = true;
    render(
      <ComValoresOcultos>
        <CaixaEntrada onAviso={vi.fn()} />
      </ComValoresOcultos>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Linha para Supermercado/ }));
    await screen.findByRole('dialog');
    expect(document.body.textContent).toContain('Supermercado · −');
    expectSemValoresExpostos(document.body, { sentinelas: SENTINELAS });
  });
});

// ── Revisão de destinos (tabela, cartões e sheet) ────────────────────────────────────────────

function itensComSentinelas(): DestinoImportadoItem[] {
  const lista = listaPadrao();
  lista.petr4.saldo = S.destinoPetr4;
  lista.cdb.saldo = S.destinoCdb;
  return lista.itens;
}

function montarRevisao(itens: DestinoImportadoItem[], ocultos = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            habilitado: true,
            itens,
            paraRevisar: itens.filter((i) => i.situacao === 'para-revisar').length,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ComValoresOcultos ocultos={ocultos}>
        <RevisarDestinos aberto onFechar={vi.fn()} onConcluido={vi.fn()} />
      </ComValoresOcultos>
    </QueryClientProvider>,
  );
}

describe('Revisão de destinos', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['computador', false],
    ['celular', true],
  ])('%s: o saldo de cada investimento vira pílula', async (_n, belowLg) => {
    h.belowLg = belowLg;
    const itens = itensComSentinelas();
    montarRevisao(itens);
    await waitFor(() => expect(document.body.textContent).toContain('PETR4'));
    expectSemValoresExpostos(document.body, { sentinelas: SENTINELAS });
    expect(document.querySelectorAll('.mf-sensivel').length).toBe(itens.length);
  });

  it('celular: o sheet "Onde … vai entrar" esconde o saldo', async () => {
    h.belowLg = true;
    montarRevisao(itensComSentinelas());
    const trocar = await screen.findByRole('button', { name: 'Trocar destino de PETR4' });
    await act(async () => fireEvent.click(trocar));
    await screen.findByText(/Onde PETR4 vai entrar/);
    expectSemValoresExpostos(document.body, { sentinelas: SENTINELAS });
  });

  it('olho aberto: os saldos aparecem como hoje', async () => {
    h.belowLg = false;
    montarRevisao(itensComSentinelas(), false);
    await waitFor(() => expect(document.body.textContent).toContain('PETR4'));
    expectPilulas(document.body, 0);
    expect(document.body.textContent).toContain('11.235,67');
  });
});

describe('Revisão de destinos — "O que muda" com a Reserva de Emergência', () => {
  function montarPainel(ocultos: boolean) {
    const item = itemDe(ASSETS.CDB, { grupo: 'rendaFixa', saldo: S.destinoCdb });
    // Como o servidor manda: valor do item e a prévia da Saúde Financeira (reserva e necessário).
    item.opcoes.item.valorAtualBRL = S.destinoCdb;
    item.opcoes.saudePrevia = { reservaAtual: S.reservaAtual, necessario: 30000 };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ComValoresOcultos ocultos={ocultos}>
          <DestinoPainelLinha
            id="painel-cdb"
            item={item}
            escolha={{ categoria: 'reservaEmergencia', subgrupo: null }}
            mudou
            onEscolher={vi.fn()}
            onVoltarASugestao={vi.fn()}
            onPronto={vi.fn()}
          />
        </ComValoresOcultos>
      </QueryClientProvider>,
    );
  }

  it('olho fechado: reserva antes → depois e o necessário viram pílula', () => {
    montarPainel(true);
    expect(document.body.textContent).toContain('reserva de emergência');
    expectSemValoresExpostos(document.body, { sentinelas: [...SENTINELAS, 30000] });
    expectPilulas(document.body);
  });

  it('olho aberto: os valores aparecem como hoje', () => {
    montarPainel(false);
    expectPilulas(document.body, 0);
    expect(document.body.textContent).toMatch(/R\$\s6\.543,21 → R\$\s21\.567,59/);
  });
});
