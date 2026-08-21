import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  course: { findUnique: vi.fn() },
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

const req = () => new NextRequest('http://localhost/api/educacao/cursos/curso-teste');
const ctx = { params: Promise.resolve({ slug: 'curso-teste' }) };

const makeLesson = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  moduleId: 'm-1',
  title: `Aula ${id}`,
  description: null,
  vturbEmbed: `<div id="vid_${id}"></div>`,
  durationSeconds: 300,
  orderIndex: 0,
  requiredLevel: 0,
  ...over,
});

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
    {
      id: 'm-1',
      title: 'Módulo 1',
      orderIndex: 0,
      lessons: [makeLesson('l-1'), makeLesson('l-2', { requiredLevel: 1 })],
    },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ accessLevel: 0 });
  mockPrisma.course.findUnique.mockResolvedValue(makeCourse());
  mockPrisma.lessonProgress.findMany.mockResolvedValue([]);
});

describe('GET /api/educacao/cursos/[slug]', () => {
  it('devolve a árvore do curso com aulas e progresso', async () => {
    mockPrisma.lessonProgress.findMany.mockResolvedValue([
      { lessonId: 'l-1', completedAt: new Date() },
    ]);

    const res = await GET(req(), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.curso.modulos).toHaveLength(1);
    expect(data.curso.modulos[0].aulas[0]).toMatchObject({ id: 'l-1', concluida: true });
    expect(data.curso.aulasConcluidas).toBe(1);
    expect(data.curso.progresso).toBe(50);
  });

  it('aula bloqueada pelo nível NÃO leva o embed VTurb no payload', async () => {
    const res = await GET(req(), ctx);
    const data = await res.json();

    const aulas = data.curso.modulos[0].aulas;
    expect(aulas[0].bloqueada).toBe(false);
    expect(aulas[0].vturbEmbed).toContain('vid_l-1');
    expect(aulas[1].bloqueada).toBe(true);
    expect(aulas[1].vturbEmbed).toBeNull();
  });

  it('requiredLevel do curso se propaga para todas as aulas', async () => {
    mockPrisma.course.findUnique.mockResolvedValue(makeCourse({ requiredLevel: 2 }));

    const res = await GET(req(), ctx);
    const data = await res.json();

    expect(data.curso.bloqueado).toBe(true);
    for (const aula of data.curso.modulos[0].aulas) {
      expect(aula.bloqueada).toBe(true);
      expect(aula.vturbEmbed).toBeNull();
    }
  });

  it('404 para curso inexistente ou não publicado', async () => {
    mockPrisma.course.findUnique.mockResolvedValue(makeCourse({ published: false }));
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);

    mockPrisma.course.findUnique.mockResolvedValue(null);
    const res2 = await GET(req(), ctx);
    expect(res2.status).toBe(404);
  });
});
