import { describe, expect, it, vi } from 'vitest';
import {
  lerPontosVigentes,
  lerQualidadeFiiVigente,
} from '@/services/analiseAtivos/repositorio/fontesFundamentos';

const dec = (n: number) => ({ toNumber: () => n });

function linha(extra: Record<string, unknown>) {
  return {
    symbol: 'WEGE3',
    serie: 'revenue',
    tipoPeriodo: 'FY',
    anoFiscal: 2024,
    dtFim: new Date('2024-12-31T00:00:00.000Z'),
    valor: dec(1e9),
    fonte: 'prov',
    versao: 1,
    incompleto: false,
    ...extra,
  };
}

describe('repositorio/fontesFundamentos (leitura approved)', () => {
  it('filtra approved no banco, descarta série fora do catálogo e fica com a maior versão', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        linha({ versao: 1, valor: dec(1e9) }),
        linha({ versao: 2, valor: dec(2e9) }),
        linha({ serie: 'rating', versao: 1 }),
        linha({ fonte: 'cvm', valor: null }),
      ]);
    const prisma = { assetFundamentalsSerie: { findMany }, fiiPropertyQuality: {} };
    const r = await lerPontosVigentes(prisma as never, ['WEGE3'], ['revenue'], 2015);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reviewStatus: 'approved', anoFiscal: { gte: 2015 } }),
      }),
    );
    expect(r).toEqual([
      expect.objectContaining({ fonte: 'prov', versao: 2, valor: 2e9, dtFim: '2024-12-31' }),
      expect.objectContaining({ fonte: 'cvm', valor: null }),
    ]);
    expect(r.some((p) => (p.serie as string) === 'rating')).toBe(false);
  });

  it('sem símbolos ou séries não consulta o banco', async () => {
    const findMany = vi.fn();
    const prisma = { assetFundamentalsSerie: { findMany }, fiiPropertyQuality: { findMany } };
    expect(await lerPontosVigentes(prisma as never, [], ['revenue'], 2015)).toEqual([]);
    expect(await lerPontosVigentes(prisma as never, ['X'], [], 2015)).toEqual([]);
    expect(await lerQualidadeFiiVigente(prisma as never, [], '2015-01-01')).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('qualidade de FII: approved e maior versão por cnpj × período × fonte', async () => {
    const base = {
      symbol: 'KNCR11',
      cnpj: '1',
      periodo: new Date('2024-12-31T00:00:00.000Z'),
      fonte: 'prov',
      incompleto: false,
      ltvAvg: 50,
      defaultPct: 1,
      indexMix: null,
      sourcePage: null,
      confianca: null,
    };
    const findMany = vi.fn().mockResolvedValue([
      { ...base, versao: 1, ltvAvg: 50 },
      { ...base, versao: 3, ltvAvg: 58 },
    ]);
    const prisma = { assetFundamentalsSerie: {}, fiiPropertyQuality: { findMany } };
    const r = await lerQualidadeFiiVigente(prisma as never, ['KNCR11'], '2015-01-01');
    expect(findMany.mock.calls[0][0].where.reviewStatus).toBe('approved');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ versao: 3, ltvAvg: 58, periodo: '2024-12-31' });
  });
});
