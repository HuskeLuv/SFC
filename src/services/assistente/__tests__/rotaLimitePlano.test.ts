/**
 * Assinaturas F2: o 429 de POST /api/assistente ganha o contrato ErroLimitePlano
 * ({ codigo: 'limite_plano', plano, limite, recurso: 'ia' }) só quando a cota veio do plano
 * (chave ligada). A cota é a do cliente quando o consultor age.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAuthWithActing: vi.fn(),
  logSensitiveEndpointAccess: vi.fn(),
  complete: vi.fn(),
  buildContextoUsuario: vi.fn(),
  usoMensal: vi.fn(),
  registrarMensagem: vi.fn(),
  assistenteHabilitado: vi.fn(),
}));

vi.mock('@/utils/auth', () => ({ requireAuthWithActing: mocks.requireAuthWithActing }));
vi.mock('@/services/impersonationLogger', () => ({
  logSensitiveEndpointAccess: mocks.logSensitiveEndpointAccess,
}));
vi.mock('@/services/assistente/llm', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/services/assistente/llm')>();
  return { ...orig, complete: mocks.complete };
});
vi.mock('@/services/assistente/contexto', () => ({
  buildContextoUsuario: mocks.buildContextoUsuario,
}));
vi.mock('@/services/assistente/limite', () => ({
  usoMensal: mocks.usoMensal,
  registrarMensagem: mocks.registrarMensagem,
  assistenteHabilitado: mocks.assistenteHabilitado,
}));

import { POST } from '@/app/api/assistente/route';

const post = () =>
  new NextRequest('http://localhost/api/assistente', {
    method: 'POST',
    body: JSON.stringify({ mensagem: 'oi' }),
    headers: { 'Content-Type': 'application/json' },
  });

describe('POST /api/assistente — 429 por plano', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assistenteHabilitado.mockReturnValue(true);
    mocks.requireAuthWithActing.mockResolvedValue({
      payload: { id: 'u1', email: 'a@b.c', role: 'user' },
      targetUserId: 'u1',
      actingClient: null,
    });
  });

  it('cota do plano esgotada: 429 com codigo limite_plano, plano, limite e recurso', async () => {
    const uso = { usadas: 30, limite: 30, restantes: 0, economico: true, plano: 'basic' };
    mocks.usoMensal.mockResolvedValue(uso);
    const res = await POST(post());
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: 'Você usou as 30 mensagens deste mês. O limite renova no dia 1º.',
      uso,
      codigo: 'limite_plano',
      plano: 'basic',
      limite: 30,
      recurso: 'ia',
    });
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('chave desligada (uso sem plano): corpo de sempre, sem codigo', async () => {
    const uso = { usadas: 300, limite: 300, restantes: 0, economico: true };
    mocks.usoMensal.mockResolvedValue(uso);
    const res = await POST(post());
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: 'Você usou as 300 mensagens deste mês. O limite renova no dia 1º.',
      uso,
    });
  });

  it('consultor agindo: a cota é a do cliente (usoMensal do targetUserId)', async () => {
    mocks.requireAuthWithActing.mockResolvedValue({
      payload: { id: 'cons', email: 'c@x', role: 'consultant' },
      targetUserId: 'cliente',
      actingClient: { id: 'cliente', name: 'C', email: 'cl@x' },
    });
    mocks.usoMensal.mockResolvedValue({
      usadas: 30,
      limite: 30,
      restantes: 0,
      economico: true,
      plano: 'basic',
    });
    const res = await POST(post());
    expect(res.status).toBe(429);
    expect(mocks.usoMensal).toHaveBeenCalledWith('cliente');
  });
});
