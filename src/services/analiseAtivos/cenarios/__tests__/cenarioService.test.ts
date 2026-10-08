import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  analiseCenario: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  MENSAGEM_LIMITE_CENARIOS,
  apagarCenario,
  cenariosParaExportacao,
  lerCenario,
  salvarCenario,
} from '@/services/analiseAtivos/cenarios/cenarioService';
import { ApiError } from '@/utils/apiErrorHandler';

const EM = new Date('2026-10-08T12:00:00Z');
const PREMISSAS = { yieldPct: 6, gPct: 8, kPct: 13, margemPct: 20, plAlvo: 36.9 };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn(mockPrisma),
  );
  mockPrisma.analiseCenario.upsert.mockResolvedValue({ updatedAt: EM });
});

describe('lerCenario', () => {
  it('devolve premissas, editados e o valor do ativo no salvamento', async () => {
    mockPrisma.analiseCenario.findUnique.mockResolvedValue({
      classe: 'acao',
      premissas: PREMISSAS,
      dadosEditados: { valores: { lpa: 1.44 }, valoresDoAtivoNoSalvamento: { lpa: 1.4 } },
      updatedAt: EM,
    });
    expect(await lerCenario('u1', 'WEGE3', 'acao')).toEqual({
      premissas: PREMISSAS,
      dadosEditados: { lpa: 1.44 },
      atualizadoEm: EM.toISOString(),
      valoresDoAtivoNoSalvamento: { lpa: 1.4 },
    });
    expect(mockPrisma.analiseCenario.findUnique.mock.calls[0][0].where).toEqual({
      userId_symbol: { userId: 'u1', symbol: 'WEGE3' },
    });
  });

  it('classe trocada ou JSON fora do schema ⇒ null (nunca quebra a tela)', async () => {
    mockPrisma.analiseCenario.findUnique.mockResolvedValue({
      classe: 'fii',
      premissas: PREMISSAS,
      dadosEditados: null,
      updatedAt: EM,
    });
    expect(await lerCenario('u1', 'WEGE3', 'acao')).toBeNull();
    mockPrisma.analiseCenario.findUnique.mockResolvedValue({
      classe: 'acao',
      premissas: { yieldPct: 'x' },
      dadosEditados: null,
      updatedAt: EM,
    });
    expect(await lerCenario('u1', 'WEGE3', 'acao')).toBeNull();
  });

  it('dadosEditados na forma simples ainda é lido', async () => {
    mockPrisma.analiseCenario.findUnique.mockResolvedValue({
      classe: 'acao',
      premissas: PREMISSAS,
      dadosEditados: { dpa: 1.5 },
      updatedAt: EM,
    });
    expect(await lerCenario('u1', 'WEGE3', 'acao')).toMatchObject({
      dadosEditados: { dpa: 1.5 },
      valoresDoAtivoNoSalvamento: null,
    });
  });
});

describe('salvarCenario', () => {
  it('cria com os editados + valor do ativo no salvamento, dentro da transação', async () => {
    mockPrisma.analiseCenario.findUnique.mockResolvedValue(null);
    mockPrisma.analiseCenario.count.mockResolvedValue(3);
    const r = await salvarCenario(
      'u1',
      'WEGE3',
      { classe: 'acao', premissas: PREMISSAS, dados: { lpa: 1.44 } },
      { lpa: 1.49, vpa: 4.5, dpa: 2 },
    );
    expect(r).toEqual({ atualizadoEm: EM.toISOString() });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.analiseCenario.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId_symbol: { userId: 'u1', symbol: 'WEGE3' } });
    expect(arg.create).toMatchObject({
      userId: 'u1',
      symbol: 'WEGE3',
      classe: 'acao',
      premissas: PREMISSAS,
      dadosEditados: { valores: { lpa: 1.44 }, valoresDoAtivoNoSalvamento: { lpa: 1.49 } },
      versaoSchema: 1,
    });
  });

  it('sem editados ⇒ dadosEditados nulo no banco', async () => {
    mockPrisma.analiseCenario.findUnique.mockResolvedValue({ id: 'x' });
    await salvarCenario('u1', 'WEGE3', { classe: 'acao', premissas: PREMISSAS, dados: {} });
    expect(mockPrisma.analiseCenario.upsert.mock.calls[0][0].update.dadosEditados).toBe(
      Prisma.DbNull,
    );
    expect(mockPrisma.analiseCenario.count).not.toHaveBeenCalled();
  });

  it('criação do 301º ⇒ ApiError 409 sem gravar', async () => {
    mockPrisma.analiseCenario.findUnique.mockResolvedValue(null);
    mockPrisma.analiseCenario.count.mockResolvedValue(300);
    const p = salvarCenario('u1', 'NOVO3', { classe: 'acao', premissas: PREMISSAS });
    await expect(p).rejects.toBeInstanceOf(ApiError);
    await expect(p).rejects.toMatchObject({ statusCode: 409, message: MENSAGEM_LIMITE_CENARIOS });
    expect(mockPrisma.analiseCenario.upsert).not.toHaveBeenCalled();
  });
});

describe('apagar e exportar', () => {
  it('apagar é preso ao userId', async () => {
    mockPrisma.analiseCenario.deleteMany.mockResolvedValue({ count: 0 });
    await apagarCenario('u1', 'WEGE3');
    expect(mockPrisma.analiseCenario.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', symbol: 'WEGE3' },
    });
  });

  it('exportação LGPD: symbol, classe, premissas, dadosEditados (só os valores) e datas', async () => {
    mockPrisma.analiseCenario.findMany.mockResolvedValue([
      {
        symbol: 'WEGE3',
        classe: 'acao',
        premissas: PREMISSAS,
        dadosEditados: { valores: { lpa: 1.44 }, valoresDoAtivoNoSalvamento: { lpa: 1.4 } },
        createdAt: EM,
        updatedAt: EM,
      },
    ]);
    expect(await cenariosParaExportacao('u1')).toEqual([
      {
        symbol: 'WEGE3',
        classe: 'acao',
        premissas: PREMISSAS,
        dadosEditados: { lpa: 1.44 },
        createdAt: EM,
        updatedAt: EM,
      },
    ]);
    expect(mockPrisma.analiseCenario.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1' });
  });
});
