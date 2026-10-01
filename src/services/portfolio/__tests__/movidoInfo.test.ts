import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({ userChangeLog: { findMany: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  movidoInfoPorEntidade,
  originalPorEntidade,
  resumirMovido,
  resumirOriginal,
  type EventoMover,
} from '../movidoInfo';
import { MOVER_ACTIONS_LIST, type MoverSnapshotEstado } from '@/lib/carteiraMover';

let t = 0;
const ev = (
  action: string,
  antes: MoverSnapshotEstado,
  depois: MoverSnapshotEstado,
  over: Partial<EventoMover> = {},
): EventoMover => ({
  entityId: 'p-1',
  action,
  createdAt: new Date(Date.UTC(2026, 9, 1, 12, t++)),
  viaConsultant: false,
  snapshot: { v: 1, kind: 'mover', data: antes, meta: { after: depois } },
  ...over,
});

const FII = { symbol: 'KDIF11', type: 'fii', currency: 'BRL', name: 'Kinea Infra' };

describe('resumirMovido', () => {
  beforeEach(() => {
    t = 0;
  });

  it('sem eventos: não movido', () => {
    expect(resumirMovido([])).toEqual({ movido: false, em: null, viaConsultant: false });
  });

  it('troca de aba: movido, com data e autor', () => {
    const e = ev(
      'investimento.mover',
      { categoriaOverride: null, tipoFii: 'tvm' },
      { categoriaOverride: 'fimFia', tipoFii: 'tvm', tipoFundo: 'fiagro' },
      { viaConsultant: true },
    );
    expect(resumirMovido([e])).toEqual({
      movido: true,
      em: e.createdAt.toISOString(),
      viaConsultant: true,
    });
  });

  it('troca só de seção dentro da base: NÃO é movido (selo só na troca de aba)', () => {
    const e = ev(
      'investimento.mover',
      { categoriaOverride: null, tipoFii: 'tvm' },
      { categoriaOverride: null, tipoFii: 'infra' },
    );
    expect(resumirMovido([e]).movido).toBe(false);
  });

  it('último evento é restaurar: não movido', () => {
    const eventos = [
      ev('investimento.mover', { categoriaOverride: null }, { categoriaOverride: 'acoes' }),
      ev('investimento.restaurar', { categoriaOverride: 'acoes' }, { categoriaOverride: null }),
    ];
    expect(resumirMovido(eventos).movido).toBe(false);
  });

  it('mover de volta à base também encerra', () => {
    const eventos = [
      ev('investimento.mover', { categoriaOverride: null }, { categoriaOverride: 'acoes' }),
      ev('investimento.mover', { categoriaOverride: 'acoes' }, { categoriaOverride: null }),
    ];
    expect(resumirMovido(eventos).movido).toBe(false);
  });

  it('seção trocada depois da troca de aba: data continua a da troca de aba', () => {
    const aba = ev(
      'investimento.mover',
      { categoriaOverride: null },
      { categoriaOverride: 'fimFia', tipoFundo: 'fim' },
      { viaConsultant: true },
    );
    const secao = ev(
      'investimento.mover',
      { categoriaOverride: 'fimFia', tipoFundo: 'fim' },
      { categoriaOverride: 'fimFia', tipoFundo: 'fiagro' },
    );
    expect(resumirMovido([aba, secao])).toEqual({
      movido: true,
      em: aba.createdAt.toISOString(),
      viaConsultant: true,
    });
  });

  it('snapshot inválido não vira selo', () => {
    expect(
      resumirMovido([
        {
          ...ev('investimento.mover', { categoriaOverride: null }, { categoriaOverride: 'acoes' }),
          snapshot: null,
        },
      ]).movido,
    ).toBe(false);
  });
});

describe('resumirOriginal', () => {
  it('original = antes do 1º mover depois do último restaurar', () => {
    const eventos = [
      ev(
        'investimento.mover',
        { categoriaOverride: null, tipoFii: 'fofi' },
        { categoriaOverride: 'acoes', tipoFii: 'fofi', estrategia: 'value' },
      ),
      ev(
        'investimento.restaurar',
        { categoriaOverride: 'acoes' },
        { categoriaOverride: null, tipoFii: 'fofi' },
      ),
      ev(
        'investimento.mover',
        { categoriaOverride: null, tipoFii: 'tvm' },
        { categoriaOverride: 'fimFia', tipoFii: 'tvm', tipoFundo: 'fim' },
      ),
      ev(
        'investimento.mover',
        { categoriaOverride: 'fimFia', tipoFii: 'tvm', tipoFundo: 'fim' },
        { categoriaOverride: 'acoes', tipoFii: 'tvm', tipoFundo: 'fim', estrategia: 'growth' },
      ),
    ];
    expect(resumirOriginal(eventos, { asset: FII })).toEqual({
      categoria: 'fiis',
      subgrupo: 'tvm',
      antes: { categoriaOverride: null, tipoFii: 'tvm' },
    });
  });

  it('subgrupo null quando a coluna era null (fallback da rota)', () => {
    const eventos = [
      ev(
        'investimento.mover',
        { categoriaOverride: null, tipoFii: null },
        { categoriaOverride: 'fimFia', tipoFundo: 'fim' },
      ),
    ];
    expect(resumirOriginal(eventos, { asset: FII })?.subgrupo).toBeNull();
  });

  it('planejado usa a secao', () => {
    const eventos = [
      ev(
        'planejado.mover',
        { categoriaOverride: null, secao: 'tijolo', objetivo: 4 },
        { categoriaOverride: 'fimFia', secao: 'fim', objetivo: 4 },
      ),
    ];
    expect(resumirOriginal(eventos, { asset: FII, tipo: 'planejado' })).toMatchObject({
      categoria: 'fiis',
      subgrupo: 'tijolo',
    });
  });

  it('não movido: null', () => {
    expect(resumirOriginal([])).toBeNull();
    expect(
      resumirOriginal([
        ev('investimento.mover', { categoriaOverride: null }, { categoriaOverride: 'acoes' }),
        ev('investimento.restaurar', { categoriaOverride: 'acoes' }, { categoriaOverride: null }),
      ]),
    ).toBeNull();
  });
});

describe('consultas ao UserChangeLog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filtra section, actions, entidades e ignora desfeitos (undoneAt null)', async () => {
    mockPrisma.userChangeLog.findMany.mockResolvedValue([]);
    await movidoInfoPorEntidade('u-1', ['p-1', 'p-2', 'p-1']);
    expect(mockPrisma.userChangeLog.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'u-1',
        section: 'carteira',
        action: { in: [...MOVER_ACTIONS_LIST] },
        entityId: { in: ['p-1', 'p-2'] },
        undoneAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        entityId: true,
        action: true,
        createdAt: true,
        viaConsultant: true,
        snapshot: true,
      },
    });
  });

  it('sem ids não consulta', async () => {
    const out = await movidoInfoPorEntidade('u-1', []);
    expect(out.size).toBe(0);
    expect(mockPrisma.userChangeLog.findMany).not.toHaveBeenCalled();
  });

  it('agrupa por entidade', async () => {
    const e1 = ev(
      'investimento.mover',
      { categoriaOverride: null },
      { categoriaOverride: 'acoes' },
    );
    const e2 = ev(
      'planejado.mover',
      { categoriaOverride: null, secao: 'tvm' },
      { categoriaOverride: null, secao: 'infra' },
      { entityId: 'w-1' },
    );
    mockPrisma.userChangeLog.findMany.mockResolvedValue([e1, e2]);
    const out = await movidoInfoPorEntidade('u-1', ['p-1', 'w-1', 'x']);
    expect(out.get('p-1')?.movido).toBe(true);
    expect(out.get('w-1')?.movido).toBe(false);
    expect(out.has('x')).toBe(false);
  });

  it('originalPorEntidade', async () => {
    mockPrisma.userChangeLog.findMany.mockResolvedValue([
      ev(
        'investimento.mover',
        { categoriaOverride: null, tipoFii: 'tvm' },
        { categoriaOverride: 'fimFia', tipoFundo: 'fiagro' },
      ),
    ]);
    await expect(originalPorEntidade('u-1', 'p-1', { asset: FII })).resolves.toMatchObject({
      categoria: 'fiis',
      subgrupo: 'tvm',
    });
  });
});
