import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    analiseTese: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));
vi.mock('@/lib/prisma', () => ({ default: mocks.prisma, prisma: mocks.prisma }));

import {
  TESE_VAZIA,
  TesePutSchema,
  apagarTese,
  lerTese,
  salvarTese,
  tesesParaExportacao,
} from '../teseService';

const ATUALIZADO = new Date('2026-10-02T14:32:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.analiseTese.upsert.mockResolvedValue({ updatedAt: ATUALIZADO });
  mocks.prisma.analiseTese.deleteMany.mockResolvedValue({ count: 1 });
});

describe('TesePutSchema', () => {
  it('faz trim e aceita até 10.000 caracteres', () => {
    expect(TesePutSchema.parse({ corpo: '  minha tese \n' })).toEqual({ corpo: 'minha tese' });
    expect(TesePutSchema.safeParse({ corpo: 'x'.repeat(10_000) }).success).toBe(true);
    // espaços nas pontas não contam
    expect(TesePutSchema.safeParse({ corpo: ` ${'x'.repeat(10_000)} ` }).success).toBe(true);
  });

  it('recusa mais de 10.000 caracteres e corpo que não é texto', () => {
    const r = TesePutSchema.safeParse({ corpo: 'x'.repeat(10_001) });
    expect(r.success).toBe(false);
    expect(TesePutSchema.safeParse({}).success).toBe(false);
    expect(TesePutSchema.safeParse({ corpo: 12 }).success).toBe(false);
  });
});

describe('lerTese', () => {
  it('sem tese: corpo vazio, privada', async () => {
    mocks.prisma.analiseTese.findUnique.mockResolvedValue(null);
    expect(await lerTese('u1', 'WEGE3')).toEqual(TESE_VAZIA);
    expect(mocks.prisma.analiseTese.findUnique.mock.calls[0][0].where).toEqual({
      userId_symbol: { userId: 'u1', symbol: 'WEGE3' },
    });
  });

  it('com tese: corpo e data ISO', async () => {
    mocks.prisma.analiseTese.findUnique.mockResolvedValue({ corpo: 'abc', updatedAt: ATUALIZADO });
    expect(await lerTese('u1', 'WEGE3')).toEqual({
      corpo: 'abc',
      atualizadoEm: ATUALIZADO.toISOString(),
      visibilidade: 'privada',
    });
  });
});

describe('salvarTese', () => {
  it('cria ou atualiza pela chave (userId, symbol), com o texto sem espaços nas pontas', async () => {
    const r = await salvarTese('u1', 'WEGE3', '  texto  ');
    expect(r).toEqual({ atualizadoEm: ATUALIZADO.toISOString() });
    const arg = mocks.prisma.analiseTese.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId_symbol: { userId: 'u1', symbol: 'WEGE3' } });
    expect(arg.create).toEqual({
      userId: 'u1',
      symbol: 'WEGE3',
      corpo: 'texto',
      visibilidade: 'privada',
    });
    expect(arg.update).toEqual({ corpo: 'texto' });
  });

  it('corpo vazio apaga (e não faz upsert)', async () => {
    const r = await salvarTese('u1', 'WEGE3', '   \n ');
    expect(r).toEqual({ atualizadoEm: null });
    expect(mocks.prisma.analiseTese.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.analiseTese.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', symbol: 'WEGE3' },
    });
  });
});

describe('apagarTese / exportação', () => {
  it('apaga só a do usuário', async () => {
    await apagarTese('u2', 'WEGE3');
    expect(mocks.prisma.analiseTese.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u2', symbol: 'WEGE3' },
    });
  });

  it('exportação lista as teses do usuário', async () => {
    mocks.prisma.analiseTese.findMany.mockResolvedValue([]);
    await tesesParaExportacao('u1');
    expect(mocks.prisma.analiseTese.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1' });
  });
});
