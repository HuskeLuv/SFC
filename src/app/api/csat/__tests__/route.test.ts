import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  csatResposta: { findMany: vi.fn(), create: vi.fn() },
}));
const mockRequireAuthWithActing = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));

import { GET, POST } from '../route';

const DIA = 86_400_000;
const comoUsuario = () =>
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'user-1', email: 'u@x', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  });
const comoConsultorAgindo = () =>
  mockRequireAuthWithActing.mockResolvedValue({
    payload: { id: 'cons-1', email: 'c@x', role: 'consultant' },
    targetUserId: 'user-1',
    actingClient: { id: 'user-1', name: 'Cliente', email: 'u@x' },
  });

const reqGet = () => new NextRequest('http://localhost/api/csat');
const reqPost = (body: unknown) =>
  new NextRequest('http://localhost/api/csat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  comoUsuario();
  mockPrisma.user.findUnique.mockResolvedValue({
    createdAt: new Date(Date.now() - 60 * DIA),
    email: 'u@gmail.com',
  });
  mockPrisma.csatResposta.findMany.mockResolvedValue([]);
  mockPrisma.csatResposta.create.mockResolvedValue({ id: 'r1', createdAt: new Date() });
});

describe('GET /api/csat', () => {
  it('mostra para cliente ativo que nunca respondeu', async () => {
    const res = await GET(reqGet());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ mostrar: true });
  });

  it('não mostra para cadastro recente', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - 2 * DIA),
      email: 'u@gmail.com',
    });
    expect(await (await GET(reqGet())).json()).toEqual({ mostrar: false });
  });

  it('não mostra para o usuário do seed/e2e', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      createdAt: new Date(Date.now() - 60 * DIA),
      email: 'usuario.demo@finapp.local',
    });
    expect(await (await GET(reqGet())).json()).toEqual({ mostrar: false });
  });

  it('não mostra (nem consulta o banco) com consultor agindo por cliente', async () => {
    comoConsultorAgindo();
    expect(await (await GET(reqGet())).json()).toEqual({ mostrar: false });
    expect(mockPrisma.csatResposta.findMany).not.toHaveBeenCalled();
  });

  it('não mostra para quem respondeu há 10 dias', async () => {
    mockPrisma.csatResposta.findMany.mockResolvedValue([
      { nota: 3, createdAt: new Date(Date.now() - 10 * DIA) },
    ]);
    expect(await (await GET(reqGet())).json()).toEqual({ mostrar: false });
  });

  it('401 sem sessão', async () => {
    mockRequireAuthWithActing.mockRejectedValue(new Error('Não autorizado'));
    expect((await GET(reqGet())).status).toBe(401);
  });
});

describe('POST /api/csat', () => {
  it('grava a resposta com nota e comentário (origem app)', async () => {
    const res = await POST(reqPost({ acao: 'responder', nota: 5, comentario: '  ótimo  ' }));
    expect(res.status).toBe(201);
    expect(mockPrisma.csatResposta.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: 'user-1', nota: 5, comentario: 'ótimo', origem: 'app' },
      }),
    );
  });

  it('comentário vazio vira null', async () => {
    await POST(reqPost({ acao: 'responder', nota: 2, comentario: '   ' }));
    expect(mockPrisma.csatResposta.create.mock.calls[0][0].data.comentario).toBeNull();
  });

  it('"Agora não" grava evento sem nota', async () => {
    const res = await POST(reqPost({ acao: 'adiar' }));
    expect(res.status).toBe(201);
    expect(mockPrisma.csatResposta.create.mock.calls[0][0].data).toMatchObject({
      userId: 'user-1',
      nota: null,
    });
  });

  it.each([{ nota: 0 }, { nota: 6 }, { nota: 3.5 }, {}])('400 para nota inválida %o', async (b) => {
    const res = await POST(reqPost({ acao: 'responder', ...b }));
    expect(res.status).toBe(400);
    expect(mockPrisma.csatResposta.create).not.toHaveBeenCalled();
  });

  it('400 para comentário acima de 1000 caracteres', async () => {
    const res = await POST(reqPost({ acao: 'responder', nota: 3, comentario: 'x'.repeat(1001) }));
    expect(res.status).toBe(400);
  });

  it('403 com consultor agindo por cliente', async () => {
    comoConsultorAgindo();
    const res = await POST(reqPost({ acao: 'responder', nota: 5 }));
    expect(res.status).toBe(403);
    expect(mockPrisma.csatResposta.create).not.toHaveBeenCalled();
  });

  it('409 quando a pesquisa não está disponível (já respondeu no mês)', async () => {
    mockPrisma.csatResposta.findMany.mockResolvedValue([
      { nota: 4, createdAt: new Date(Date.now() - DIA) },
    ]);
    const res = await POST(reqPost({ acao: 'responder', nota: 4 }));
    expect(res.status).toBe(409);
    expect(mockPrisma.csatResposta.create).not.toHaveBeenCalled();
  });
});
