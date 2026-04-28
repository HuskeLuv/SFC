import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
    targetUserId: 'user-123',
    actingClient: null,
  }),
);

const mockPrisma = vi.hoisted(() => ({
  portfolio: { findMany: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/utils/auth', () => ({
  requireAuthWithActing: mockRequireAuthWithActing,
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import { GET } from '../route';

const createRequest = () =>
  new NextRequest('http://localhost/api/analises/ir-comecotas', { method: 'GET' });

describe('GET /api/analises/ir-comecotas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthWithActing.mockResolvedValue({
      payload: { id: 'user-123', email: 'test@test.com', role: 'user' },
      targetUserId: 'user-123',
      actingClient: null,
    });
    mockPrisma.portfolio.findMany.mockResolvedValue([]);
  });

  it('retorna lista vazia quando não há fundos', async () => {
    const response = await GET(createRequest());
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.fundos).toEqual([]);
    expect(data.totalProximaCobranca).toBe(0);
    expect(data.proximaCobrancaGlobal).toBeNull();
  });

  it('inclui fundos com asset.type=fund e calcula 15% por default (longo prazo)', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 1000,
        avgPrice: 10,
        lastUpdate: new Date('2025-01-15'),
        assetId: 'a1',
        asset: { id: 'a1', symbol: 'XPCT', name: 'XP CT FIRF', type: 'fund', currentPrice: 12 },
      },
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.fundos).toHaveLength(1);
    expect(data.fundos[0].aliquota).toBe(0.15);
    expect(data.fundos[0].rendimentoEstimado).toBe(200); // 1200 - 1000
    expect(data.fundos[0].irEstimado).toBe(30); // 200 * 0.15
  });

  it('infere fundo de ações pelo nome (sem come-cotas)', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 1000,
        avgPrice: 10,
        lastUpdate: new Date('2025-01-15'),
        assetId: 'a1',
        asset: {
          id: 'a1',
          symbol: 'X',
          name: 'XP Ações Brasil FIA',
          type: 'fund',
          currentPrice: 20,
        },
      },
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.fundos[0].tipo).toBe('acoes');
    expect(data.fundos[0].isentoComeCotas).toBe(true);
    expect(data.fundos[0].irEstimado).toBe(0);
    expect(data.totalProximaCobranca).toBe(0);
  });

  it('infere curto prazo pelo nome', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 100,
        totalInvested: 1000,
        avgPrice: 10,
        lastUpdate: new Date('2025-01-15'),
        assetId: 'a1',
        asset: {
          id: 'a1',
          symbol: 'X',
          name: 'XP Curto Prazo FIRF',
          type: 'fund',
          currentPrice: 11,
        },
      },
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.fundos[0].tipo).toBe('curto-prazo');
    expect(data.fundos[0].aliquota).toBe(0.2);
    expect(data.fundos[0].irEstimado).toBe(20); // 100 * 0.2
  });

  it('ignora posições com quantidade 0', async () => {
    mockPrisma.portfolio.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 'user-123',
        quantity: 0,
        totalInvested: 0,
        avgPrice: 0,
        lastUpdate: new Date('2025-01-15'),
        assetId: 'a1',
        asset: { id: 'a1', symbol: 'X', name: 'X', type: 'fund', currentPrice: 10 },
      },
    ]);
    const response = await GET(createRequest());
    const data = await response.json();
    expect(data.fundos).toEqual([]);
  });
});
