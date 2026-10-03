import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  consultantInvite: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  consultantImpersonationLog: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
  loginEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
  userChangeLog: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
  analiseDataReport: {
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  analiseCasoEvento: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
}));

vi.mock('@/lib/prisma', () => ({ default: mockPrisma }));

import { GET } from '../route';

const DAYS = 24 * 60 * 60 * 1000;

const createRequest = (secret?: string) =>
  new NextRequest('http://localhost/api/cron/lgpd-retention', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/cron/lgpd-retention', () => {
  it('retorna 401 sem o secret', async () => {
    const response = await GET(createRequest('errado'));
    expect(response.status).toBe(401);
  });

  it('purga user_change_logs com cutoff de 365 dias', async () => {
    const response = await GET(createRequest('test-secret'));
    expect(response.status).toBe(200);

    expect(mockPrisma.userChangeLog.deleteMany).toHaveBeenCalledOnce();
    const cutoff = mockPrisma.userChangeLog.deleteMany.mock.calls[0][0].where.createdAt.lt;
    const expectedMs = Date.now() - 365 * DAYS;
    expect(Math.abs(cutoff.getTime() - expectedMs)).toBeLessThan(60_000);

    const body = await response.json();
    expect(body.changeLogsPurged).toBe(4);
    expect(body.cutoffs.changeLogs).toBeDefined();
  });

  it('anonimiza relatos da Análise de Ativos de casos fechados há mais de 12 meses', async () => {
    mockPrisma.analiseDataReport.findMany.mockResolvedValueOnce([
      { id: 'r1', casoId: 'c1' },
      { id: 'r2', casoId: 'c1' },
    ]);
    mockPrisma.analiseDataReport.updateMany.mockResolvedValueOnce({ count: 2 });
    const response = await GET(createRequest('test-secret'));
    const where = mockPrisma.analiseDataReport.findMany.mock.calls[0][0].where;
    expect(where.anonimizadoEm).toBeNull();
    expect(where.caso.status.in).toEqual(['corrigido', 'rejeitado']);
    const corte: Date = where.caso.resolvidoEm.lt;
    expect(Math.abs(corte.getTime() - (Date.now() - 365 * DAYS))).toBeLessThan(2 * DAYS);
    expect(mockPrisma.analiseDataReport.updateMany.mock.calls[0][0].data).toMatchObject({
      mensagem: '[removido]',
      valorEsperado: null,
      fonteEsperada: null,
    });
    // um evento 'anonimizado' por caso (sem texto do usuário)
    expect(mockPrisma.analiseCasoEvento.createMany.mock.calls[0][0].data).toEqual([
      { casoId: 'c1', autorId: null, tipo: 'anonimizado', texto: 'retenção de 12 meses' },
    ]);
    const body = await response.json();
    expect(body.analiseRelatosAnonimizados).toBe(2);
    expect(body.cutoffs.analiseRelatos).toBeDefined();
  });

  it('mantém as purgas pré-existentes (invites, impersonation, login)', async () => {
    await GET(createRequest('test-secret'));
    expect(mockPrisma.consultantInvite.deleteMany).toHaveBeenCalledOnce();
    expect(mockPrisma.consultantImpersonationLog.deleteMany).toHaveBeenCalledOnce();
    expect(mockPrisma.loginEvent.deleteMany).toHaveBeenCalledOnce();
  });
});
