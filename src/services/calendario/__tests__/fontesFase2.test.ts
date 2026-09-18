/**
 * Fontes da Fase 2 da Agenda: IR (DARF, come-cotas, declaração),
 * planejamento (data-alvo dos objetivos + aposentadoria) e eventos
 * corporativos dos ativos em carteira.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    planejamentoObjetivo: { findMany: vi.fn() },
    aposentadoriaPlano: { findUnique: vi.fn() },
    portfolio: { findMany: vi.fn() },
    assetCorporateAction: { findMany: vi.fn() },
  },
  carregarApuracaoRendaVariavel: vi.fn(),
  carregarComecotas: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma, default: mocks.prisma }));
vi.mock('@/services/ir/rendaVariavelLoader', () => ({
  carregarApuracaoRendaVariavel: mocks.carregarApuracaoRendaVariavel,
}));
vi.mock('@/services/ir/comecotasLoader', () => ({
  carregarComecotas: mocks.carregarComecotas,
}));

import {
  comecotasComoEventos,
  darfComoEventos,
  declaracaoComoEventos,
  eventosIr,
  ultimoDiaUtilDoMes,
  vencimentoDarf,
} from '../fontes/ir';
import {
  aposentadoriaComoEvento,
  dataAlvoObjetivo,
  eventosPlanejamento,
  objetivosComoEventos,
} from '../fontes/planejamento';
import { acoesComoEventos, eventosAcoesCorporativas } from '../fontes/acoesCorporativas';

const ano2026 = { de: '2026-01-01', ate: '2026-12-31' };

beforeEach(() => vi.clearAllMocks());

describe('fonte ir', () => {
  it('último dia útil do mês recua fim de semana e feriado B3', () => {
    // 31/05/2026 é domingo → 29/05 (sexta).
    expect(ultimoDiaUtilDoMes(2026, 4)).toBe('2026-05-29');
    // 31/12/2026 é quinta-feira e NÃO está no calendário de feriados nacionais
    // (a B3 fecha, mas o helper só cobre os 12 nacionais) → fica 31/12.
    expect(ultimoDiaUtilDoMes(2026, 11)).toBe('2026-12-31');
    // 30/04/2027 é sexta-feira, dia útil normal.
    expect(ultimoDiaUtilDoMes(2027, 3)).toBe('2027-04-30');
  });

  it('DARF vence no último dia útil do mês SEGUINTE ao da apuração', () => {
    expect(vencimentoDarf('2026-01')).toBe(ultimoDiaUtilDoMes(2026, 1));
    expect(vencimentoDarf('2026-12')).toBe(ultimoDiaUtilDoMes(2027, 0));
  });

  it('só gera DARF de mês com IR devido, com valor e competência', () => {
    const apuracao = {
      meses: [
        {
          year: 2026,
          month: 3,
          yearMonth: '2026-03',
          irTotalDevido: 0,
          porCategoria: {},
        },
        {
          year: 2026,
          month: 4,
          yearMonth: '2026-04',
          irTotalDevido: 150.456,
          porCategoria: {
            fii: { category: 'fii', irDevido: 150.456 },
          },
        },
      ],
      saldosPrejuizoAtual: { rvComum: 0, fii: 0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const eventos = darfComoEventos(apuracao, ano2026);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].data).toBe(ultimoDiaUtilDoMes(2026, 4));
    expect(eventos[0].valor).toBe(150.46);
    expect(eventos[0].detalhe.competencia).toBe('2026-04');
    expect(eventos[0].titulo).toContain('abril/2026');
  });

  it('come-cotas marca 31/05 e 30/11 e só a próxima cobrança leva valor', () => {
    const comecotas = {
      fundos: [
        { symbol: 'FUNDO1', isentoComeCotas: false },
        { symbol: 'FIA1', isentoComeCotas: true },
      ],
      totalProximaCobranca: 320.5,
      proximaCobrancaGlobal: '2026-05-31T23:59:59.000Z',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const eventos = comecotasComoEventos(comecotas, ano2026);
    expect(eventos.map((e) => e.data)).toEqual(['2026-05-31', '2026-11-30']);
    expect(eventos[0].valor).toBe(320.5);
    expect(eventos[1].valor).toBeNull();
    // Fundo isento (FIA) não conta na descrição.
    expect(eventos[0].detalhe.fundos).toBe(1);
  });

  it('sem fundo sujeito a come-cotas não gera evento', () => {
    const comecotas = {
      fundos: [{ symbol: 'FIA1', isentoComeCotas: true }],
      totalProximaCobranca: 0,
      proximaCobrancaGlobal: '2026-05-31T23:59:59.000Z',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(comecotasComoEventos(comecotas, ano2026)).toEqual([]);
  });

  it('declaração anual cai em 31/05 e cita o ano-calendário anterior', () => {
    const eventos = declaracaoComoEventos(ano2026);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].data).toBe('2026-05-31');
    expect(eventos[0].detalhe.anoCalendario).toBe(2025);
  });

  it('declaração aparece mesmo sem carteira (loaders vazios)', async () => {
    mocks.carregarApuracaoRendaVariavel.mockResolvedValue({
      meses: [],
      saldosPrejuizoAtual: { rvComum: 0, fii: 0 },
    });
    mocks.carregarComecotas.mockResolvedValue({
      fundos: [],
      totalProximaCobranca: 0,
      proximaCobrancaGlobal: null,
    });

    const eventos = await eventosIr('u1', { de: '2026-05-01', ate: '2026-05-31' });
    expect(eventos.map((e) => e.detalhe.evento)).toEqual(['declaracao']);
  });
});

describe('fonte planejamento', () => {
  it('data-alvo é o último dia do último mês da janela', () => {
    // Janela de 12 meses começando em jan/2026 → fecha em dez/2026.
    expect(dataAlvoObjetivo('2026-01', 12)).toBe('2026-12-31');
    // Atravessa o ano: 6 meses a partir de out/2026 → mar/2027.
    expect(dataAlvoObjetivo('2026-10', 6)).toBe('2027-03-31');
    // Mês único.
    expect(dataAlvoObjetivo('2026-02', 1)).toBe('2026-02-28');
  });

  it('objetivo sem startDate fica de fora; com startDate leva meta e status', () => {
    const eventos = objetivosComoEventos(
      [
        {
          id: 'o1',
          name: 'Casa',
          target: 300000,
          months: 12,
          startDate: '2026-01',
          status: 'Iniciado',
          category: 'm',
        },
        {
          id: 'o2',
          name: 'Sem data',
          target: 1000,
          months: 6,
          startDate: null,
          status: 'Em espera',
          category: 'c',
        },
      ],
      ano2026,
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0].data).toBe('2026-12-31');
    expect(eventos[0].valor).toBe(300000);
    expect(eventos[0].detalhe.objetivoId).toBe('o1');
  });

  it('aposentadoria cai no mês de início do acompanhamento + anos restantes', () => {
    const eventos = aposentadoriaComoEvento(
      { idade: 40, apos: 60, trackStartMonth: 3, trackStartYear: 2026 },
      { de: '2046-01-01', ate: '2046-12-31' },
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0].data).toBe('2046-03-01');
    expect(eventos[0].detalhe.idadeAlvo).toBe(60);
  });

  it('plano já aposentado (idade > apos) não gera evento', () => {
    expect(
      aposentadoriaComoEvento(
        { idade: 70, apos: 60, trackStartMonth: 1, trackStartYear: 2026 },
        ano2026,
      ),
    ).toEqual([]);
  });

  it('eventosPlanejamento exclui objetivo concluído e sem data na consulta', async () => {
    mocks.prisma.planejamentoObjetivo.findMany.mockResolvedValue([]);
    mocks.prisma.aposentadoriaPlano.findUnique.mockResolvedValue(null);

    await eventosPlanejamento('u1', ano2026);
    expect(mocks.prisma.planejamentoObjetivo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          status: { not: 'Concluído' },
          startDate: { not: null },
        }),
      }),
    );
  });
});

describe('fonte mercado (eventos corporativos)', () => {
  it('monta o evento com proporção legível e link do ativo', () => {
    const eventos = acoesComoEventos(
      [
        {
          id: 'ca1',
          symbol: 'PETR4',
          date: new Date(Date.UTC(2026, 5, 10)),
          type: 'DESDOBRAMENTO',
          factor: 2,
          completeFactor: '2 para 1',
          source: 'B3_COTAHIST',
        },
        {
          id: 'ca2',
          symbol: 'PETR4',
          date: new Date(Date.UTC(2027, 0, 5)),
          type: 'GRUPAMENTO',
          factor: 0.5,
          completeFactor: null,
          source: 'BRAPI',
        },
      ],
      ano2026,
      new Map([['PETR4', '/ativos/p1']]),
    );
    expect(eventos).toHaveLength(1); // o de 2027 está fora do período
    expect(eventos[0].data).toBe('2026-06-10');
    expect(eventos[0].link).toBe('/ativos/p1');
    expect(eventos[0].detalhe.proporcao).toBe('2 para 1');
    expect(eventos[0].detalhe.fonte).toBe('B3_COTAHIST');
  });

  it('sem posição em carteira não consulta eventos corporativos', async () => {
    mocks.prisma.portfolio.findMany.mockResolvedValue([]);
    const eventos = await eventosAcoesCorporativas('u1', ano2026);
    expect(eventos).toEqual([]);
    expect(mocks.prisma.assetCorporateAction.findMany).not.toHaveBeenCalled();
  });

  it('consulta só os símbolos da carteira', async () => {
    mocks.prisma.portfolio.findMany.mockResolvedValue([
      { id: 'p1', asset: { symbol: 'PETR4' } },
      { id: 'p2', asset: { symbol: 'ITUB4' } },
    ]);
    mocks.prisma.assetCorporateAction.findMany.mockResolvedValue([]);

    await eventosAcoesCorporativas('u1', ano2026);
    expect(mocks.prisma.assetCorporateAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ symbol: { in: ['PETR4', 'ITUB4'] } }),
      }),
    );
  });
});
