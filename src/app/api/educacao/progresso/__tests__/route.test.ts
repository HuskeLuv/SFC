import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  courseLesson: { findUnique: vi.fn() },
  lessonProgress: { upsert: vi.fn() },
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

import { POST } from '../route';

const LESSON_ID = 'a3bb189e-8bf9-3888-9912-ace4e6543002';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/educacao/progresso', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const makeLesson = (over: Record<string, unknown> = {}) => ({
  id: LESSON_ID,
  requiredLevel: 0,
  module: { course: { requiredLevel: 0, published: true } },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ accessLevel: 0 });
  mockPrisma.courseLesson.findUnique.mockResolvedValue(makeLesson());
  mockPrisma.lessonProgress.upsert.mockImplementation(({ update }) =>
    Promise.resolve({ lessonId: LESSON_ID, completedAt: update.completedAt }),
  );
});

describe('POST /api/educacao/progresso', () => {
  it('marca aula como concluída via upsert', async () => {
    const res = await POST(req({ lessonId: LESSON_ID, concluida: true }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.progresso).toEqual({ lessonId: LESSON_ID, concluida: true });
    expect(mockPrisma.lessonProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_lessonId: { userId: 'user-1', lessonId: LESSON_ID } },
      }),
    );
  });

  it('desmarca conclusão (completedAt = null)', async () => {
    const res = await POST(req({ lessonId: LESSON_ID, concluida: false }));
    const data = await res.json();

    expect(data.progresso.concluida).toBe(false);
    const call = mockPrisma.lessonProgress.upsert.mock.calls[0][0];
    expect(call.update.completedAt).toBeNull();
  });

  it('400 para body inválido', async () => {
    const res = await POST(req({ lessonId: 'não-é-uuid', concluida: true }));
    expect(res.status).toBe(400);
    expect(mockPrisma.lessonProgress.upsert).not.toHaveBeenCalled();
  });

  it('404 para aula inexistente ou de curso não publicado', async () => {
    mockPrisma.courseLesson.findUnique.mockResolvedValue(null);
    const res = await POST(req({ lessonId: LESSON_ID, concluida: true }));
    expect(res.status).toBe(404);
  });

  it('403 quando o nível do usuário não alcança o exigido pela aula/curso', async () => {
    mockPrisma.courseLesson.findUnique.mockResolvedValue(
      makeLesson({ module: { course: { requiredLevel: 1, published: true } } }),
    );

    const res = await POST(req({ lessonId: LESSON_ID, concluida: true }));

    expect(res.status).toBe(403);
    expect(mockPrisma.lessonProgress.upsert).not.toHaveBeenCalled();
  });
});
