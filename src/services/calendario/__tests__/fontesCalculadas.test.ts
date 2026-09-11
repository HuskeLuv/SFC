import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    divida: { findMany: vi.fn() },
    portfolio: { findMany: vi.fn() },
    fixedIncomeAsset: { findMany: vi.fn() },
    event: { findMany: vi.fn() },
  },
  resolveProventoEvents: vi.fn(),
  monthlyIndexFactors: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('@/services/portfolio/resolveProventos', () => ({
  resolveProventoEvents: mocks.resolveProventoEvents,
}));
vi.mock('@/services/dividas/indexacaoDivida', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/services/dividas/indexacaoDivida')>();
  return { ...orig, monthlyIndexFactors: mocks.monthlyIndexFactors };
});

import { gerarCronograma } from '@/services/dividas/amortizacao';
import {
  diaDoMes,
  eventosDividas,
  parcelasComoEventos,
  rotativaComoEventos,
} from '../fontes/dividas';
import { eventosProventos, proventosComoEventos } from '../fontes/proventos';
import { eventosRendaFixa, taxaLegivel, titulosComoEventos } from '../fontes/rendaFixa';
import { montarAgenda, parseTipos } from '../agenda';
import { deDataCivil } from '../datas';

const periodoSet = { de: '2026-09-01', ate: '2026-09-30' };

beforeEach(() => vi.clearAllMocks());
const divida = {
  id: 'd1',
  nome: 'Apartamento',
  instituicao: 'Caixa',
  modalidade: 'financiamento',
  indexador: 'PREFIXADO',
  diaVencimento: null,
};

describe('fonte divida', () => {
  it('diaDoMes limita ao tamanho do mês', () => {
    expect(diaDoMes('2026-02', 31)).toBe('2026-02-28');
    expect(diaDoMes('2026-09', 10)).toBe('2026-09-10');
  });

  it('parcelas do período com paga/pendente, amortizadas do fim excluídas, dia 1 sem dia informado', () => {
    const cronograma = gerarCronograma({
      principal: 12000,
      taxaAm: 0.01,
      prazoMeses: 12,
      primeiroVencimento: '2026-01',
      sistema: 'SAC',
    });
    const pagamentos = [
      { valor: 1120, parcelaNumero: 1, tipo: 'pagamento', month: '2026-01' },
      { valor: 1000, parcelaNumero: 9, tipo: 'pagamento', month: '2026-09' },
      // amortização com redução de prazo: corta 2 parcelas do fim (11 e 12)
      { valor: 2000, parcelaNumero: 2, tipo: 'amortizacao_prazo', month: '2026-03' },
    ];
    const set = parcelasComoEventos(divida, cronograma, pagamentos, periodoSet);
    expect(set).toHaveLength(1);
    expect(set[0]).toMatchObject({
      id: 'divida:d1:9',
      tipo: 'divida',
      titulo: 'Apartamento · parcela 9/10',
      data: '2026-09-01',
      valor: 1040,
      descricao: 'Parcela paga',
      link: '/dividas',
      detalhe: expect.objectContaining({
        numero: 9,
        total: 10,
        paga: true,
        diaInformado: false,
        amortizacao: 1000,
        juros: 40,
      }),
    });
    const out = parcelasComoEventos(divida, cronograma, pagamentos, {
      de: '2026-10-01',
      ate: '2026-12-31',
    });
    expect(out.map((e) => [e.detalhe.numero, e.descricao])).toEqual([[10, 'Parcela a pagar']]);
    const comDia = parcelasComoEventos(
      { ...divida, diaVencimento: 10 },
      cronograma,
      [],
      periodoSet,
    );
    expect(comDia[0].data).toBe('2026-09-10');
    expect(comDia[0].detalhe.diaInformado).toBe(true);
  });

  it('rotativa: um vencimento por mês a partir do saldo inicial', () => {
    const r = { ...divida, id: 'd2', nome: 'Cartão', modalidade: 'rotativa' };
    const out = rotativaComoEventos(r, '2026-09', { de: '2026-08-01', ate: '2026-10-31' });
    expect(out.map((e) => e.data)).toEqual(['2026-09-01', '2026-10-01']);
    expect(out[0]).toMatchObject({
      id: 'divida:d2:2026-09',
      titulo: 'Cartão · vencimento',
      valor: null,
    });
  });

  it('eventosDividas: só dívidas ativas; indexada passa pela correção do índice', async () => {
    mocks.prisma.divida.findMany.mockResolvedValue([
      {
        id: 'd1',
        nome: 'Apartamento',
        instituicao: null,
        modalidade: 'financiamento',
        indexador: 'IPCA',
        principal: 12000,
        taxaAm: 0.01,
        prazoMeses: 12,
        sistema: 'PRICE',
        primeiroVencimento: '2026-01',
        dataSaldoInicial: null,
        pagamentos: [],
      },
    ]);
    mocks.monthlyIndexFactors.mockResolvedValue(new Map([['2026-09', 1.1]]));
    const out = await eventosDividas('u1', periodoSet);
    expect(mocks.prisma.divida.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', status: 'ativa' },
      include: { pagamentos: true },
    });
    expect(mocks.monthlyIndexFactors).toHaveBeenCalledWith('IPCA', '2026-01', '2026-12');
    expect(out).toHaveLength(1);
    expect(out[0].detalhe.numero).toBe(9);
  });
});

describe('fonte provento', () => {
  const dia = (s: string) => deDataCivil(s).getTime();
  const eventos = [
    {
      symbol: 'ITSA4',
      tipo: 'Dividendo',
      paymentDay: dia('2026-09-15'),
      bookingDay: dia('2026-08-28'),
      exDay: 0,
      net: 312,
      gross: 312,
    },
    {
      symbol: 'BBAS3',
      tipo: 'JCP',
      paymentDay: dia('2026-10-05'),
      bookingDay: dia('2026-09-21'),
      exDay: 0,
      net: 87.4,
      gross: 100,
    },
    {
      symbol: 'XPML11',
      tipo: 'Rendimento',
      paymentDay: dia('2026-09-14'),
      bookingDay: dia('2026-09-14'),
      exDay: 0,
      net: 50,
      gross: 50,
    },
  ];

  it('gera pagamento (com valor líquido) e data-com (sem valor), marca provisionado, link por posição', () => {
    const out = proventosComoEventos(
      eventos,
      periodoSet,
      new Map([['ITSA4', '/ativos/p1']]),
      '2026-09-10',
    );
    expect(out.map((e) => [e.id, e.data, e.valor, e.link])).toEqual([
      ['provento:ITSA4:Dividendo:2026-09-15:pagamento', '2026-09-15', 312, '/ativos/p1'],
      ['provento:BBAS3:JCP:2026-10-05:data-com', '2026-09-21', null, '/carteira'],
      ['provento:XPML11:Rendimento:2026-09-14:pagamento', '2026-09-14', 50, '/carteira'],
    ]);
    expect(out[0].descricao).toBe('Pagamento previsto (provisionado)');
    expect(out[1].detalhe).toMatchObject({
      evento: 'data-com',
      bruto: 100,
      liquido: 87.4,
      dataPagamento: '2026-10-05',
      provisionado: true,
    });
    expect(out[2].detalhe.evento).toBe('pagamento');
  });

  it('eventosProventos: resolve uma vez (cache) e monta os links', async () => {
    mocks.resolveProventoEvents.mockResolvedValue({ events: eventos, total: 0 });
    mocks.prisma.portfolio.findMany.mockResolvedValue([
      { id: 'p-itsa', asset: { symbol: 'ITSA4' } },
    ]);
    const a = await eventosProventos('u-cache', periodoSet);
    const b = await eventosProventos('u-cache', periodoSet);
    expect(mocks.resolveProventoEvents).toHaveBeenCalledTimes(1);
    expect(a.find((e) => e.titulo.startsWith('ITSA4'))?.link).toBe('/ativos/p-itsa');
    expect(b).toHaveLength(a.length);
  });
});

describe('fonte rf', () => {
  it('taxa legível por indexador', () => {
    expect(taxaLegivel({ annualRate: 0, indexer: 'CDI', indexerPercent: 135 })).toBe('135% do CDI');
    expect(taxaLegivel({ annualRate: 6.2, indexer: 'IPCA', indexerPercent: null })).toBe(
      'IPCA + 6.2% a.a.',
    );
    expect(taxaLegivel({ annualRate: 13.5, indexer: null, indexerPercent: null })).toBe(
      '13.5% a.a.',
    );
  });

  it('vencimento no período com valor aplicado e link para a posição', () => {
    const out = titulosComoEventos(
      [
        {
          id: 'f1',
          assetId: 'a1',
          portfolioId: 'p1',
          description: 'CDB Sofisa 2026',
          type: 'CDB',
          maturityDate: deDataCivil('2026-09-30'),
          investedAmount: 12480,
          annualRate: 0,
          indexer: 'CDI',
          indexerPercent: 110,
          taxExempt: false,
        },
        {
          id: 'f2',
          assetId: 'a2',
          portfolioId: null,
          description: 'LCI',
          type: 'LCI',
          maturityDate: deDataCivil('2027-01-10'),
          investedAmount: 5000,
          annualRate: 9,
          indexer: null,
          indexerPercent: null,
          taxExempt: true,
        },
      ],
      periodoSet,
    );
    expect(out).toEqual([
      expect.objectContaining({
        id: 'rf:f1',
        tipo: 'rf',
        titulo: 'CDB Sofisa 2026 · vencimento',
        data: '2026-09-30',
        valor: 12480,
        link: '/ativos/p1',
        descricao: 'CDB, 110% do CDI. Valor aplicado.',
      }),
    ]);
  });

  it('eventosRendaFixa: ignora título já resgatado (posição zerada)', async () => {
    mocks.prisma.fixedIncomeAsset.findMany.mockResolvedValue([
      {
        id: 'f1',
        assetId: 'a1',
        description: 'CDB',
        type: 'CDB',
        maturityDate: deDataCivil('2026-09-30'),
        investedAmount: 100,
        annualRate: 10,
        indexer: null,
        indexerPercent: null,
        taxExempt: false,
      },
      {
        id: 'f2',
        assetId: 'a2',
        description: 'LCA',
        type: 'LCA',
        maturityDate: deDataCivil('2026-09-15'),
        investedAmount: 100,
        annualRate: 10,
        indexer: null,
        indexerPercent: null,
        taxExempt: true,
      },
    ]);
    mocks.prisma.portfolio.findMany.mockResolvedValue([{ id: 'p1', assetId: 'a1' }]);
    const out = await eventosRendaFixa('u1', periodoSet);
    expect(mocks.prisma.fixedIncomeAsset.findMany.mock.calls[0][0].where.maturityDate).toEqual({
      gte: deDataCivil('2026-09-01'),
      lte: deDataCivil('2026-09-30'),
    });
    expect(mocks.prisma.portfolio.findMany.mock.calls[0][0].where.quantity).toEqual({ gt: 0 });
    expect(out.map((e) => e.id)).toEqual(['rf:f1']);
  });
});

describe('agenda com fontes calculadas', () => {
  beforeEach(() => {
    mocks.prisma.event.findMany.mockResolvedValue([]);
    mocks.prisma.divida.findMany.mockResolvedValue([]);
    mocks.prisma.fixedIncomeAsset.findMany.mockResolvedValue([]);
    mocks.resolveProventoEvents.mockResolvedValue({ events: [], total: 0 });
  });

  it('parseTipos valida e filtra as fontes', async () => {
    expect(parseTipos(new URLSearchParams())).toBeUndefined();
    expect(parseTipos(new URLSearchParams('tipos=manual,rf'))).toEqual(['manual', 'rf']);
    expect(() => parseTipos(new URLSearchParams('tipos=banana'))).toThrow(/desconhecido/);
    await montarAgenda('u-filtro', periodoSet, ['rf']);
    expect(mocks.prisma.fixedIncomeAsset.findMany).toHaveBeenCalled();
    expect(mocks.prisma.divida.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('uma fonte quebrada não derruba as outras', async () => {
    mocks.prisma.divida.findMany.mockRejectedValueOnce(new Error('db'));
    const r = await montarAgenda('u-erro', periodoSet);
    expect(r.fontesComErro).toEqual(['divida']);
  });
});
