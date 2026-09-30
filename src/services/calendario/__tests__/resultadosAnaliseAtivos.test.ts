import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    portfolio: { findMany: vi.fn() },
    cvmCompanyTicker: { findMany: vi.fn() },
    assetEvento: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));

import { amostraTextosFixos } from '@/services/analiseAtivos/eventos/textosEventos';
import { encontrarPalavrasProibidas } from '@/services/analiseAtivos/regras/comum/linguagem';
import { eventosResultadosAnaliseAtivos } from '../fontes/resultadosAnaliseAtivos';

const WEG = '84429695000111';
const PETRO = '33000167000101';
const BB = '00000000000191';
const periodo = { de: '2026-10-01', ate: '2026-10-31' };
const d = (s: string) => new Date(`${s}T00:00:00Z`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.portfolio.findMany.mockResolvedValue([
    { asset: { symbol: 'WEGE3' } },
    { asset: { symbol: 'PETR3' } },
    { asset: { symbol: 'PETR4' } },
    { asset: { symbol: 'HGLG11' } },
  ]);
  mocks.prisma.cvmCompanyTicker.findMany.mockResolvedValue([
    { symbol: 'BBAS3', cnpj: BB, classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
    { symbol: 'PETR3', cnpj: PETRO, classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
    { symbol: 'PETR4', cnpj: PETRO, classeTitulo: 'PN', unitQtdOn: null, unitQtdPn: null },
    { symbol: 'WEGE3', cnpj: WEG, classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
  ]);
  mocks.prisma.assetEvento.findMany.mockResolvedValue([
    {
      id: 'e1',
      cnpj: WEG,
      tipo: 'resultado_estimado',
      subtipo: 'ITR3',
      periodoRef: '2026-3T',
      data: d('2026-10-22'),
      estimado: true,
    },
    {
      id: 'e2',
      cnpj: PETRO,
      tipo: 'assembleia',
      subtipo: 'AGE',
      periodoRef: null,
      data: d('2026-10-15'),
      estimado: false,
    },
    {
      id: 'e3',
      cnpj: PETRO,
      tipo: 'resultado',
      subtipo: 'DFP',
      periodoRef: '2025-FY',
      data: d('2026-10-05'),
      estimado: false,
    },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('eventosResultadosAnaliseAtivos', () => {
  it('flag desligada ⇒ [] e o prisma não é chamado', async () => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', '');
    expect(await eventosResultadosAnaliseAtivos('u1', periodo)).toEqual([]);
    expect(mocks.prisma.portfolio.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.cvmCompanyTicker.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.assetEvento.findMany).not.toHaveBeenCalled();
  });

  it('ligada ⇒ só emissores dos ativos da carteira do usuário, com títulos neutros', async () => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
    const eventos = await eventosResultadosAnaliseAtivos('u1', periodo);

    expect(mocks.prisma.portfolio.findMany.mock.calls[0][0].where).toMatchObject({
      userId: 'u1',
      quantity: { gt: 0 },
    });
    const where = mocks.prisma.assetEvento.findMany.mock.calls[0][0].where;
    expect(where.cnpj.in.sort()).toEqual([PETRO, WEG].sort()); // BB não está na carteira
    expect(where.OR).toEqual([
      { tipo: { in: ['assembleia', 'resultado'] } },
      { tipo: 'resultado_estimado', substituidoEm: null },
    ]);

    expect(eventos.map((e) => [e.data, e.titulo])).toEqual([
      ['2026-10-22', 'WEGE3 · resultado do 3T26 (data estimada)'],
      ['2026-10-15', 'PETR3/PETR4 · assembleia (AGE)'],
      ['2026-10-05', 'PETR3/PETR4 · resultado anual de 2025'],
    ]);
    expect(eventos[0]).toMatchObject({
      id: 'mercado:analise-ativos:e1',
      tipo: 'mercado',
      link: '/carteira',
      valor: null,
      detalhe: { evento: 'resultado', estimado: true, periodoRef: '2026-3T', fonte: 'CVM' },
    });
    expect(eventos[0].descricao).toContain('Data estimada');
  });

  it('carteira sem ações do cadastro da análise ⇒ [] sem consultar asset_eventos', async () => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
    mocks.prisma.portfolio.findMany.mockResolvedValue([{ asset: { symbol: 'HGLG11' } }]);
    expect(await eventosResultadosAnaliseAtivos('u1', periodo)).toEqual([]);
    expect(mocks.prisma.assetEvento.findMany).not.toHaveBeenCalled();
  });

  it('nenhuma palavra proibida nos títulos e descrições', async () => {
    vi.stubEnv('ANALISE_ATIVOS_HABILITADA', 'true');
    const eventos = await eventosResultadosAnaliseAtivos('u1', periodo);
    const textos = [
      ...eventos.flatMap((e) => [e.titulo, e.descricao ?? '']),
      ...amostraTextosFixos(),
    ];
    for (const t of textos) expect(encontrarPalavrasProibidas(t)).toEqual([]);
  });
});
