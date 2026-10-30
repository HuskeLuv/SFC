import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { INSTITUTIONS, seedInstitutions } from '../referenceData';

/**
 * Os seeds do catálogo não podem desfazer o import do Bacen (ClickUp 86e2xqh69): cnpj null no
 * seed não apaga o cnpj preenchido, e as colunas do Bacen nunca entram no upsert.
 */

const COLUNAS_BACEN = ['tipoBacen', 'conglomeradoBacen', 'apelidos', 'cnpjCalculado'];

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    institution: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $disconnect: vi.fn(),
  },
}));
vi.mock('../../src/lib/prisma', () => ({ default: prismaMock, prisma: prismaMock }));

type UpsertArgs = {
  where: { codigo: string };
  update: Record<string, unknown>;
  create: Record<string, unknown>;
};

describe('seedInstitutions (prisma/referenceData.ts)', () => {
  it('upsert de linha com cnpj null não manda cnpj no update', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    await seedInstitutions({ institution: { upsert } } as unknown as PrismaClient);

    const chamadas = upsert.mock.calls.map((c) => c[0] as UpsertArgs);
    expect(chamadas).toHaveLength(INSTITUTIONS.length);

    const citi = chamadas.find((c) => c.where.codigo === '477')!;
    expect(INSTITUTIONS.find((i) => i.code === '477')?.cnpj).toBeNull();
    expect(citi.update).not.toHaveProperty('cnpj');
    expect(citi.update).toMatchObject({ nome: 'Citibank N.A. Brasil', status: 'ATIVA' });
    expect(citi.create).toMatchObject({ codigo: '477', cnpj: null });

    const bb = chamadas.find((c) => c.where.codigo === '001')!;
    expect(bb.update).toMatchObject({ cnpj: '00000000000191' });

    for (const c of chamadas) {
      for (const col of COLUNAS_BACEN) {
        expect(c.update).not.toHaveProperty(col);
        expect(c.create).not.toHaveProperty(col);
      }
    }
  });
});

describe('scripts/seed-additional-institutions.ts --apply', () => {
  const argvOriginal = process.argv;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    process.argv = [...argvOriginal, '--apply'];
    prismaMock.institution.upsert.mockResolvedValue({});
  });

  afterEach(() => {
    process.argv = argvOriginal;
    vi.restoreAllMocks();
  });

  it('linha que o import completou (cnpj preenchido, seed null) fica igual; nada apaga cnpj', async () => {
    prismaMock.institution.findUnique.mockImplementation(
      async ({ where }: { where: { codigo: string } }) => {
        // Banco Pine: seed tem cnpj null; o import preencheu o cnpj calculado.
        if (where.codigo === '643') {
          return { id: 'i643', nome: 'Banco Pine', cnpj: '62144175000120', status: 'ATIVA' };
        }
        // Topázio: nome mudou à mão; o seed renomeia, mas não mexe no cnpj do import.
        if (where.codigo === '082') {
          return { id: 'i082', nome: 'Topázio', cnpj: '07679404000100', status: 'ATIVA' };
        }
        return null;
      },
    );

    const { default: main } = await import('../../scripts/seed-additional-institutions');
    await main();

    const chamadas = prismaMock.institution.upsert.mock.calls.map((c) => c[0] as UpsertArgs);
    expect(chamadas.find((c) => c.where.codigo === '643')).toBeUndefined();

    const topazio = chamadas.find((c) => c.where.codigo === '082')!;
    expect(topazio.update).toEqual({ nome: 'Banco Topázio', status: 'ATIVA' });

    const pagbank = chamadas.find((c) => c.where.codigo === '290')!;
    expect(pagbank.update).toMatchObject({ cnpj: '08561701000101' });

    for (const c of chamadas) {
      if (c.create.cnpj === null) expect(c.update).not.toHaveProperty('cnpj');
      for (const col of COLUNAS_BACEN) expect(c.update).not.toHaveProperty(col);
    }
  });
});
