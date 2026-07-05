import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  aposentadoriaPlano: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  aposentadoriaPlanoEntry: {
    createMany: vi.fn(),
  },
  userChangeLog: { create: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'u1', email: 'u@t.com', role: 'user' },
    targetUserId: 'u1',
    actingClient: null,
  }),
);

const mockDerive = vi.hoisted(() => vi.fn());

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/planejamento/acompanhamentoAuto', () => ({
  deriveAcompanhamentoEntries: mockDerive,
}));

import { GET, POST } from '../route';

const planoTrack = {
  id: 'plan-1',
  trackStartMonth: 1,
  trackStartYear: 2026,
  idade: 30,
  apos: 65,
  entries: [{ off: 1 }], // fev já registrado manualmente
};

const derived = [
  { off: 1, year: 2026, month: 2, aporteReal: 0, patFinal: 1100, hasData: true },
  { off: 2, year: 2026, month: 3, aporteReal: 500, patFinal: null, hasData: false },
  { off: 3, year: 2026, month: 4, aporteReal: -200, patFinal: 1300, hasData: true },
];

const updatedPlano = {
  id: 'plan-1',
  idade: 30,
  apos: 65,
  vida: 90,
  rentNom: 12,
  inflacao: 4.5,
  rentNomRetiro: null,
  patrimonio: 1000,
  aporteM: 500,
  renda: 5000,
  trackStartMonth: 1,
  trackStartYear: 2026,
  eventos: [],
  fieldLocks: [],
  entries: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-06-15'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.aposentadoriaPlano.findUnique.mockResolvedValue(planoTrack);
  mockPrisma.aposentadoriaPlano.findUniqueOrThrow.mockResolvedValue(updatedPlano);
  mockPrisma.aposentadoriaPlanoEntry.createMany.mockResolvedValue({ count: 1 });
  mockDerive.mockResolvedValue(derived);
});

describe('GET /api/aposentadoria/entries/auto', () => {
  it('retorna derivados e quantos meses são preenchíveis (com snapshot e sem registro)', async () => {
    const res = await GET(new NextRequest('http://localhost/api/aposentadoria/entries/auto'));
    const data = await res.json();
    // off=1 tem registro (skip), off=3 tem snapshot e sem registro → fillable=1
    expect(data.fillable).toBe(1);
    expect(data.derived).toHaveLength(3);
  });

  it('404 quando não há plano', async () => {
    mockPrisma.aposentadoriaPlano.findUnique.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/aposentadoria/entries/auto'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/aposentadoria/entries/auto', () => {
  it('preenche apenas meses com snapshot e sem registro existente', async () => {
    const res = await POST(
      new NextRequest('http://localhost/api/aposentadoria/entries/auto', { method: 'POST' }),
    );
    const data = await res.json();

    expect(mockPrisma.aposentadoriaPlanoEntry.createMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.aposentadoriaPlanoEntry.createMany.mock.calls[0][0];
    // só off=3 (off=1 já existe, off=2 sem snapshot)
    expect(arg.data).toHaveLength(1);
    expect(arg.data[0]).toMatchObject({ off: 3, patFinal: 1300, aporteReal: -200 });
    expect(data.filled).toBe(1);
    expect(data.plano.id).toBe('plan-1');
  });

  it('não chama createMany quando não há nada a preencher', async () => {
    mockDerive.mockResolvedValue([
      { off: 1, year: 2026, month: 2, aporteReal: 0, patFinal: 1100, hasData: true },
    ]); // off=1 já registrado
    const res = await POST(
      new NextRequest('http://localhost/api/aposentadoria/entries/auto', { method: 'POST' }),
    );
    const data = await res.json();
    expect(mockPrisma.aposentadoriaPlanoEntry.createMany).not.toHaveBeenCalled();
    expect(data.filled).toBe(0);
  });

  it('404 quando não há plano', async () => {
    mockPrisma.aposentadoriaPlano.findUnique.mockResolvedValue(null);
    const res = await POST(
      new NextRequest('http://localhost/api/aposentadoria/entries/auto', { method: 'POST' }),
    );
    expect(res.status).toBe(404);
  });
});
