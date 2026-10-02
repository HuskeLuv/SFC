import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({ stockTransaction: { findMany: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  ORDEM_COMPRAS_TESOURO_DESTINO,
  getTesouroDestinoByAssetId,
  parseTesouroDestino,
  primeiroDestinoPorAsset,
  reservaDestinoPorAsset,
} from '../tesouroDestino';

type Compra = { id: string; assetId: string; date: Date; createdAt: Date; notes: string | null };

const compra = (id: string, assetId: string, data: string, destino: string | null): Compra => ({
  id,
  assetId,
  date: new Date(`${data}T00:00:00Z`),
  createdAt: new Date(`${data}T12:00:00Z`),
  notes: destino ? JSON.stringify({ tesouroDestino: destino }) : JSON.stringify({ x: 1 }),
});

/**
 * Simula o banco: devolve as compras na ordem FÍSICA dada (fora de ordem), mas
 * respeita o `orderBy` se a consulta pedir — como o Postgres.
 */
const bancoCom = (fisico: Compra[]) => {
  mockPrisma.stockTransaction.findMany.mockImplementation(
    async (args: { orderBy?: Record<string, 'asc' | 'desc'>[] }) => {
      const linhas = [...fisico];
      if (!args.orderBy) return linhas;
      const chaves = args.orderBy.map((o) => Object.entries(o)[0]);
      return linhas.sort((x, y) => {
        for (const [k, dir] of chaves) {
          const vx = x[k as keyof Compra] as Date | string;
          const vy = y[k as keyof Compra] as Date | string;
          const cmp = vx < vy ? -1 : vx > vy ? 1 : 0;
          if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    },
  );
};

beforeEach(() => {
  mockPrisma.stockTransaction.findMany.mockReset();
});

describe('aba base determinística do Tesouro (1ª compra marcada por data)', () => {
  // Prod 02/10/2026: 1 posição com destinos MISTOS (emergência + oportunidade).
  const MISTO = [
    compra('tx-b', 'tes-1', '2026-03-10', 'reserva-oportunidade'), // gravada antes no disco
    compra('tx-a', 'tes-1', '2025-11-05', 'reserva-emergencia'), // mas a 1ª compra por data
    compra('tx-c', 'tes-2', '2026-01-01', 'renda-fixa-hibrida'), // não é marcador de reserva
    compra('tx-d', 'tes-3', '2026-02-01', null),
    compra('tx-e', 'tes-3', '2026-04-01', 'reserva-oportunidade'),
  ];

  it('pede orderBy date, createdAt, id e a 1ª compra marcada vence', async () => {
    bancoCom(MISTO);
    const mapa = await getTesouroDestinoByAssetId('u1', ['tes-1', 'tes-2', 'tes-3']);
    const args = mockPrisma.stockTransaction.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]);
    expect(args.where).toMatchObject({ userId: 'u1', type: 'compra', notes: { not: null } });
    expect(mapa.get('tes-1')).toBe('reserva-emergencia');
    expect(mapa.has('tes-2')).toBe(false);
    expect(mapa.get('tes-3')).toBe('reserva-oportunidade');
  });

  it('o resultado não depende da ordem física do banco', async () => {
    bancoCom(MISTO);
    const a = await getTesouroDestinoByAssetId('u1');
    bancoCom([...MISTO].reverse());
    const b = await getTesouroDestinoByAssetId('u1');
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it('mesma data: desempata por createdAt e depois id', async () => {
    const mesmaData = [
      { ...compra('tx-2', 'tes-9', '2026-05-05', 'reserva-oportunidade') },
      { ...compra('tx-1', 'tes-9', '2026-05-05', 'reserva-emergencia') },
    ];
    bancoCom(mesmaData);
    expect((await getTesouroDestinoByAssetId('u1')).get('tes-9')).toBe('reserva-emergencia');
  });

  it('reservaDestinoPorAsset devolve no formato do BaseCtx', async () => {
    bancoCom(MISTO);
    const mapa = await reservaDestinoPorAsset('u1');
    expect(mapa.get('tes-1')).toBe('emergencia');
    expect(mapa.get('tes-3')).toBe('oportunidade');
  });

  it('lista vazia de ativos não consulta', async () => {
    expect((await getTesouroDestinoByAssetId('u1', [])).size).toBe(0);
    expect(mockPrisma.stockTransaction.findMany).not.toHaveBeenCalled();
  });

  it('puros', () => {
    expect(ORDEM_COMPRAS_TESOURO_DESTINO).toHaveLength(3);
    expect(parseTesouroDestino('{lixo')).toBeNull();
    expect(
      primeiroDestinoPorAsset([
        { assetId: null, notes: '{"tesouroDestino":"reserva-emergencia"}' },
        { assetId: 'x', notes: '{"tesouroDestino":"reserva-oportunidade"}' },
        { assetId: 'x', notes: '{"tesouroDestino":"reserva-emergencia"}' },
      ]).get('x'),
    ).toBe('reserva-oportunidade');
  });
});
