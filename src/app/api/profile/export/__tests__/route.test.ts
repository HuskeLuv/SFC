import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const teses = vi.fn();
  // Qualquer model: findMany → [], findUnique/findFirst → null (o user vem à parte).
  const generico = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
  });
  const models: Record<string, ReturnType<typeof generico>> = {};
  const prisma = new Proxy(
    {},
    {
      get: (_t, nome: string) => {
        if (nome === 'analiseTese') return { findMany: teses };
        models[nome] ??= generico();
        return models[nome];
      },
    },
  ) as Record<string, ReturnType<typeof generico>>;
  return { prisma, teses, requireAuthWithActing: vi.fn() };
});

vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));

import { GET } from '../route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuthWithActing.mockResolvedValue({
    payload: { id: 'u1', role: 'user' },
    targetUserId: 'u1',
    actingClient: null,
  });
  mocks.prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'u1@x', name: 'U' });
  mocks.teses.mockResolvedValue([
    { symbol: 'WEGE3', corpo: 'minha tese', visibilidade: 'privada' },
  ]);
});

describe('GET /api/profile/export (LGPD)', () => {
  it('inclui as teses da Análise de Ativos do usuário logado', async () => {
    const res = await GET(new NextRequest('http://localhost/api/profile/export'));
    expect(res.status).toBe(200);
    const corpo = JSON.parse(await res.text());
    expect(corpo.analiseAtivos.teses).toEqual([
      { symbol: 'WEGE3', corpo: 'minha tese', visibilidade: 'privada' },
    ]);
    expect(mocks.teses.mock.calls[0][0].where).toEqual({ userId: 'u1' });
  });

  it('inclui os cenários salvos (Meus cenários) do usuário logado, sem o valor interno do ativo', async () => {
    const em = new Date('2026-10-08T12:00:00Z');
    mocks.prisma.analiseCenario.findMany.mockResolvedValueOnce([
      {
        symbol: 'WEGE3',
        classe: 'acao',
        premissas: { yieldPct: 4, gPct: 8, kPct: 13, margemPct: 20, plAlvo: 36.9 },
        dadosEditados: { valores: { lpa: 1.44 }, valoresDoAtivoNoSalvamento: { lpa: 1.4 } },
        createdAt: em,
        updatedAt: em,
      },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/profile/export'));
    const corpo = JSON.parse(await res.text());
    expect(mocks.prisma.analiseCenario.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1' });
    expect(corpo.analiseAtivos.analiseCenarios).toEqual([
      {
        symbol: 'WEGE3',
        classe: 'acao',
        premissas: { yieldPct: 4, gPct: 8, kPct: 13, margemPct: 20, plAlvo: 36.9 },
        dadosEditados: { lpa: 1.44 },
        createdAt: em.toISOString(),
        updatedAt: em.toISOString(),
      },
    ]);
  });

  it('inclui o orçamento do usuário logado: metas antigas, orçado v2 e preferências', async () => {
    const em = new Date('2026-10-27T12:00:00Z');
    mocks.prisma.cashflowOrcamento.findMany.mockResolvedValueOnce([
      { groupId: 'g1', tipo: 'grupo', year: 2026, tipoMeta: 'valor', valor: '500.00' },
    ]);
    mocks.prisma.cashflowOrcamentoItem.findMany.mockResolvedValueOnce([
      { itemId: 'i1', ano: 2026, mes: 9, valor: '1200.50', pct: null, createdAt: em },
      { itemId: 'i2', ano: 2026, mes: 9, valor: null, pct: '10.5', createdAt: em },
    ]);
    mocks.prisma.cashflowOrcamentoPrefs.findUnique.mockResolvedValueOnce({
      userId: 'u1',
      categoriasRecolhidas: ['g1'],
      graficoVisivel: false,
      fonte: 'consolidado',
    });

    const res = await GET(new NextRequest('http://localhost/api/profile/export'));
    const corpo = JSON.parse(await res.text());

    const porUsuario = { userId: 'u1' };
    expect(mocks.prisma.cashflowOrcamento.findMany.mock.calls[0][0].where).toEqual(porUsuario);
    expect(mocks.prisma.cashflowOrcamentoItem.findMany.mock.calls[0][0].where).toEqual(porUsuario);
    expect(mocks.prisma.cashflowOrcamentoPrefs.findUnique.mock.calls[0][0].where).toEqual(
      porUsuario,
    );
    // Decimal vira número no JSON.
    expect(corpo.cashflow.orcamento.metas).toEqual([
      expect.objectContaining({ groupId: 'g1', valor: 500 }),
    ]);
    expect(corpo.cashflow.orcamento.orcadoPorSubcategoria).toEqual([
      expect.objectContaining({ itemId: 'i1', valor: 1200.5, pct: null }),
      expect.objectContaining({ itemId: 'i2', valor: null, pct: 10.5 }),
    ]);
    expect(corpo.cashflow.orcamento.preferencias).toEqual(
      expect.objectContaining({ fonte: 'consolidado', categoriasRecolhidas: ['g1'] }),
    );
  });

  it('inclui os relatos de dado incorreto do usuário logado, com o status como ele vê', async () => {
    mocks.prisma.analiseDataReport.findMany.mockResolvedValueOnce([
      {
        protocolo: 'ABCD2345',
        symbol: 'WEGE3',
        bloco: 'valuation',
        campo: 'payout',
        periodo: '2025',
        mensagem: 'payout do release é 52%',
        clienteId: null,
        caso: {
          status: 'rejeitado',
          resolucao: 'dado_confirmado',
          respostaPublica: 'Conferimos com a CVM.',
          resolvidoEm: new Date('2026-10-05T12:00:00Z'),
        },
      },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/profile/export'));
    const corpo = JSON.parse(await res.text());
    expect(mocks.prisma.analiseDataReport.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
    });
    expect(corpo.analiseAtivos.relatos).toEqual([
      expect.objectContaining({
        protocolo: 'ABCD2345',
        mensagem: 'payout do release é 52%',
        agindoPeloCliente: false,
        caso: expect.objectContaining({
          status: 'conferido_sem_alteracao',
          resolucao: 'dado_confirmado',
          respostaPublica: 'Conferimos com a CVM.',
        }),
      }),
    ]);
  });

  it('bloco 1: inclui listas (com itens), filtros salvos, comparações e avisos de 90 dias', async () => {
    const em = new Date('2026-10-15T12:00:00Z');
    mocks.prisma.analiseLista.findMany.mockResolvedValueOnce([
      {
        nome: 'Salvos',
        alertaResultado: true,
        alertaProvento: true,
        alertaCriterios: false,
        createdAt: em,
        itens: [{ symbol: 'WEGE3', classe: 'acao', createdAt: em }],
      },
    ]);
    mocks.prisma.analiseFiltroSalvo.findMany.mockResolvedValueOnce([
      {
        nome: 'Lucro',
        classe: 'acao',
        estado: { janela: 5 },
        createdAt: em,
        updatedAt: em,
        ultimoUsoEm: null,
      },
    ]);
    mocks.prisma.analiseComparacao.findMany.mockResolvedValueOnce([
      {
        nome: 'WEGE3 · ITUB4',
        classe: 'acao',
        tickers: ['WEGE3', 'ITUB4'],
        janela: 5,
        tipoFii: null,
        createdAt: em,
        updatedAt: em,
      },
    ]);
    mocks.prisma.analiseAlertaEnvio.findMany.mockResolvedValueOnce([
      { tipo: 'provento', symbol: 'WEGE3', chave: 'provento:WEGE3:jcp:2026-10-20', createdAt: em },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/profile/export'));
    const corpo = JSON.parse(await res.text());
    for (const m of ['analiseLista', 'analiseFiltroSalvo', 'analiseComparacao']) {
      expect(mocks.prisma[m].findMany.mock.calls[0][0].where).toEqual({ userId: 'u1' });
    }
    expect(mocks.prisma.analiseAlertaEnvio.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      createdAt: { gte: expect.any(Date) },
    });
    expect(corpo.analiseAtivos.listas).toEqual([
      {
        nome: 'Salvos',
        alertas: { resultado: true, provento: true, criterios: false },
        criadaEm: em.toISOString(),
        itens: [{ ticker: 'WEGE3', classe: 'acao', adicionadoEm: em.toISOString() }],
      },
    ]);
    expect(corpo.analiseAtivos.filtrosSalvos[0]).toMatchObject({ nome: 'Lucro', classe: 'acao' });
    expect(corpo.analiseAtivos.comparacoes[0]).toMatchObject({ tickers: ['WEGE3', 'ITUB4'] });
    expect(corpo.analiseAtivos.alertasEnviados).toEqual([
      {
        tipo: 'provento',
        symbol: 'WEGE3',
        chave: 'provento:WEGE3:jcp:2026-10-20',
        data: em.toISOString(),
      },
    ]);
  });

  it('inclui os alvos por ativo do Planejar na carteira (planning_asset_targets)', async () => {
    const em = new Date('2026-10-15T12:00:00Z');
    mocks.prisma.planningAssetTarget.findMany.mockResolvedValueOnce([
      {
        targetPct: '6.000',
        atualizadoPorUserId: null,
        createdAt: em,
        updatedAt: em,
        asset: { symbol: 'WEGE3' },
      },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/profile/export'));
    const corpo = JSON.parse(await res.text());
    expect(mocks.prisma.planningAssetTarget.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
    });
    expect(corpo.analiseAtivos.planningAssetTargets).toEqual([
      {
        ticker: 'WEGE3',
        targetPct: 6,
        atualizadoPorUserId: null,
        createdAt: em.toISOString(),
        updatedAt: em.toISOString(),
      },
    ]);
  });
});
