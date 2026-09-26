import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  communityPost: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  communityComment: { count: vi.fn() },
}));

const mockRequireSession = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'u@t.com',
    role: 'user',
  }),
);

vi.mock('@/utils/auth', () => ({ requireSession: mockRequireSession }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET, POST } from '../route';

const perfil = (over: Record<string, unknown> = {}) => ({
  userId: USER_ID,
  bio: null,
  cargo: 'membro',
  termoVersao: '1.0',
  termoAceitoEm: new Date('2026-09-23T10:00:00Z'),
  suspensoAte: null,
  suspensoMotivo: null,
  ...over,
});

const usuario = (over: Record<string, unknown> = {}) => ({
  id: USER_ID,
  name: 'Maria',
  avatarUrl: null,
  role: 'user',
  accessLevel: 0,
  communityProfile: perfil(),
  ...over,
});

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/comunidade/posts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '200.1.2.3' },
  });

const postRow = (over: Record<string, unknown> = {}) => ({
  id: '22222222-2222-4222-8222-222222222222',
  authorId: USER_ID,
  categoria: 'geral',
  conteudo: 'Olá!',
  fixadoEm: null,
  editadoEm: null,
  excluidoEm: null,
  ocultoEm: null,
  ocultoMotivo: null,
  createdAt: new Date('2026-09-23T12:00:00Z'),
  author: {
    id: USER_ID,
    name: 'Maria',
    avatarUrl: null,
    role: 'user',
    communityProfile: { cargo: 'membro' },
  },
  likes: [],
  _count: { likes: 0, comments: 0 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('COMUNIDADE_HABILITADA', 'true');
  mockPrisma.user.findUnique.mockResolvedValue(usuario());
  mockPrisma.communityPost.count.mockResolvedValue(0);
  mockPrisma.communityPost.create.mockImplementation(({ data }) =>
    Promise.resolve(postRow({ categoria: data.categoria, conteudo: data.conteudo })),
  );
});

describe('POST /api/comunidade/posts', () => {
  it('publica normalizando o texto e gravando o IP', async () => {
    const res = await POST(req({ categoria: 'geral', conteudo: '  Olá!\r\n  ' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.post).toMatchObject({ conteudo: 'Olá!', meu: true, curtidas: 0, fixado: false });
    expect(mockPrisma.communityPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { authorId: USER_ID, categoria: 'geral', conteudo: 'Olá!', ipAddress: '200.1.2.3' },
      }),
    );
  });

  it('recusa texto vazio', async () => {
    const res = await POST(req({ categoria: 'geral', conteudo: '   ' }));
    expect(res.status).toBe(400);
    expect(mockPrisma.communityPost.create).not.toHaveBeenCalled();
  });

  it('membro comum não publica em "servicos" (só consultores)', async () => {
    const res = await POST(req({ categoria: 'servicos', conteudo: 'Ofereço consultoria' }));
    expect(res.status).toBe(403);
  });

  it('consultor publica em "servicos"', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(usuario({ role: 'consultant' }));
    const res = await POST(req({ categoria: 'servicos', conteudo: 'Ofereço consultoria' }));
    expect(res.status).toBe(201);
  });

  it('suspenso não publica', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      usuario({ communityProfile: perfil({ suspensoAte: new Date(Date.now() + 86_400_000) }) }),
    );
    const res = await POST(req({ categoria: 'geral', conteudo: 'oi' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/suspensa/);
  });

  it('sem termo aceito → 403', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(usuario({ communityProfile: null }));
    const res = await POST(req({ categoria: 'geral', conteudo: 'oi' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/termo/);
  });

  it('limite de posts por hora → 429', async () => {
    mockPrisma.communityPost.count.mockResolvedValue(10);
    const res = await POST(req({ categoria: 'geral', conteudo: 'oi' }));
    expect(res.status).toBe(429);
  });

  it('trava de plano: accessLevel abaixo do exigido → 403', async () => {
    // hoje o nível exigido é 0; simula um usuário com nível negativo para exercitar a trava
    mockPrisma.user.findUnique.mockResolvedValue(usuario({ accessLevel: -1 }));
    const res = await POST(req({ categoria: 'geral', conteudo: 'oi' }));
    expect(res.status).toBe(403);
  });
});

describe('flag COMUNIDADE_HABILITADA', () => {
  it('desligada → 503 sem tocar no banco', async () => {
    vi.stubEnv('COMUNIDADE_HABILITADA', '');
    const res = await POST(req({ categoria: 'geral', conteudo: 'oi' }));
    expect(res.status).toBe(503);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('GET /api/comunidade/posts', () => {
  it('traz fixados na 1ª página e esconde ocultos de quem não modera', async () => {
    mockPrisma.communityPost.findMany
      .mockResolvedValueOnce([
        postRow({ id: '33333333-3333-4333-8333-333333333333', fixadoEm: new Date() }),
      ])
      .mockResolvedValueOnce([postRow()]);
    const res = await GET(new NextRequest('http://localhost/api/comunidade/posts'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.fixados).toHaveLength(1);
    expect(data.posts).toHaveLength(1);
    expect(data.nextCursor).toBeNull();
    const whereFeed = mockPrisma.communityPost.findMany.mock.calls[1][0].where;
    expect(whereFeed).toMatchObject({ excluidoEm: null, ocultoEm: null, fixadoEm: null });
  });

  it('categoria inválida → 400', async () => {
    const res = await GET(new NextRequest('http://localhost/api/comunidade/posts?categoria=xyz'));
    expect(res.status).toBe(400);
  });
});
