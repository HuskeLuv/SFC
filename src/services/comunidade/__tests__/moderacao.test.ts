import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  communityPost: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  communityComment: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  communityReport: { updateMany: vi.fn(), findUnique: vi.fn() },
  communityProfile: { update: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
  notification: { create: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { executarAcao } from '../moderacao';

const MOD = 'mod-1';
const POST_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.communityReport.updateMany.mockResolvedValue({ count: 1 });
});

describe('executarAcao', () => {
  it('ocultar post: tira do topo, resolve denúncias e avisa o autor', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue({ authorId: 'autor-1', ocultoEm: null });

    await executarAcao(MOD, { tipo: 'ocultar', postId: POST_ID, motivo: ' spam ' });

    expect(mockPrisma.communityPost.update).toHaveBeenCalledWith({
      where: { id: POST_ID },
      data: expect.objectContaining({ ocultoPorId: MOD, ocultoMotivo: 'spam', fixadoEm: null }),
    });
    expect(mockPrisma.communityReport.updateMany).toHaveBeenCalledWith({
      where: { status: 'aberta', postId: POST_ID },
      data: expect.objectContaining({ status: 'resolvida', resolvidoPorId: MOD }),
    });
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'autor-1', type: 'comunidade-moderacao' }),
    });
  });

  it('ocultar de novo não reenvia aviso', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue({
      authorId: 'autor-1',
      ocultoEm: new Date(),
    });
    await executarAcao(MOD, { tipo: 'ocultar', postId: POST_ID });
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('exige post OU comentário', async () => {
    await expect(executarAcao(MOD, { tipo: 'ocultar' })).rejects.toThrow(/post OU/);
  });

  it('não suspende alguém da equipe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      role: 'user',
      communityProfile: { cargo: 'equipe' },
    });
    await expect(executarAcao(MOD, { tipo: 'suspender', userId: 'u-2', dias: 7 })).rejects.toThrow(
      /equipe/,
    );
    expect(mockPrisma.communityProfile.update).not.toHaveBeenCalled();
  });

  it('suspende membro pelo número de dias', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      role: 'user',
      communityProfile: { cargo: 'membro' },
    });
    const antes = Date.now();
    await executarAcao(MOD, { tipo: 'suspender', userId: 'u-2', dias: 7, motivo: 'spam' });
    const { data } = mockPrisma.communityProfile.update.mock.calls[0][0];
    const dias = (data.suspensoAte.getTime() - antes) / 86_400_000;
    expect(dias).toBeGreaterThan(6.99);
    expect(dias).toBeLessThan(7.01);
    expect(data.suspensoMotivo).toBe('spam');
  });

  it('descartar denúncia descarta todas as abertas do mesmo conteúdo', async () => {
    mockPrisma.communityReport.findUnique.mockResolvedValue({ postId: POST_ID, commentId: null });
    await executarAcao(MOD, { tipo: 'descartar-denuncia', denunciaId: 'r-1' });
    expect(mockPrisma.communityReport.updateMany).toHaveBeenCalledWith({
      where: { status: 'aberta', postId: POST_ID },
      data: expect.objectContaining({ status: 'descartada' }),
    });
  });
});
