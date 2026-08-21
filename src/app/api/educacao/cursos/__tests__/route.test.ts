import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  course: { findMany: vi.fn() },
  lessonProgress: { findMany: vi.fn() },
}));

const mockRequireAuthWithActing = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    payload: { id: 'user-1', email: 'u@t.com', role: 'user' },
    targetUserId: 'user-1',
    actingClient: null,
  }),
);

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mockRequireAuthWithActing }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import { GET } from '../route';

const BASE = 'http://localhost/api/educacao/cursos';

const makeCourse = (over: Record<string, unknown> = {}) => ({
  id: 'c-1',
  slug: 'curso-teste',
  title: 'Curso Teste',
  description: null,
  coverUrl: null,
  requiredLevel: 0,
  orderIndex: 0,
  published: true,
  modules: [
    { id: 'm-1', lessons: [{ id: 'l-1' }, { id: 'l-2' }] },
    { id: 'm-2', lessons: [{ id: 'l-3' }] },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ accessLevel: 0 });
  mockPrisma.course.findMany.mockResolvedValue([makeCourse()]);
  mockPrisma.lessonProgress.findMany.mockResolvedValue([]);
});

describe('GET /api/educacao/cursos', () => {
  it('lista cursos publicados com totais e progresso zerado', async () => {
    const res = await GET(new NextRequest(BASE));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.cursos).toHaveLength(1);
    expect(data.cursos[0]).toMatchObject({
      slug: 'curso-teste',
      totalAulas: 3,
      aulasConcluidas: 0,
      progresso: 0,
      bloqueado: false,
    });
    expect(mockPrisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { published: true } }),
    );
  });

  it('calcula progresso a partir das aulas concluídas', async () => {
    mockPrisma.lessonProgress.findMany.mockResolvedValue([
      { lessonId: 'l-1' },
      { lessonId: 'l-3' },
    ]);

    const res = await GET(new NextRequest(BASE));
    const data = await res.json();

    expect(data.cursos[0].aulasConcluidas).toBe(2);
    expect(data.cursos[0].progresso).toBe(67);
  });

  it('marca curso como bloqueado quando requiredLevel > accessLevel do usuário', async () => {
    mockPrisma.course.findMany.mockResolvedValue([makeCourse({ requiredLevel: 1 })]);

    const res = await GET(new NextRequest(BASE));
    const data = await res.json();

    expect(data.cursos[0].bloqueado).toBe(true);
    expect(data.accessLevel).toBe(0);
  });

  it('usuário com nível suficiente vê o curso desbloqueado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ accessLevel: 2 });
    mockPrisma.course.findMany.mockResolvedValue([makeCourse({ requiredLevel: 1 })]);

    const res = await GET(new NextRequest(BASE));
    const data = await res.json();

    expect(data.cursos[0].bloqueado).toBe(false);
  });
});
