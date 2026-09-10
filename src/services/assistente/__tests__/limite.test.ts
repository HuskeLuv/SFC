import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  assistenteMensagem: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));

import {
  assistenteHabilitado,
  inicioDoMes,
  limiteMensal,
  marcarPropostaConfirmada,
  registrarMensagem,
  usoMensal,
} from '../limite';

describe('limite mensal', () => {
  const env = { ...process.env };
  beforeEach(() => {
    mockPrisma.assistenteMensagem.count.mockReset();
    mockPrisma.assistenteMensagem.create.mockReset();
    mockPrisma.assistenteMensagem.update.mockReset();
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('lê o limite do ambiente com fallback 300', () => {
    delete process.env.ASSISTENTE_LIMITE_MENSAL;
    expect(limiteMensal()).toBe(300);
    process.env.ASSISTENTE_LIMITE_MENSAL = '50';
    expect(limiteMensal()).toBe(50);
    process.env.ASSISTENTE_LIMITE_MENSAL = 'x';
    expect(limiteMensal()).toBe(300);
  });

  it('habilitado exige flag E chave', () => {
    process.env.ASSISTENTE_HABILITADO = 'true';
    process.env.ANTHROPIC_API_KEY = 'k';
    expect(assistenteHabilitado()).toBe(true);
    delete process.env.ANTHROPIC_API_KEY;
    expect(assistenteHabilitado()).toBe(false);
  });

  it('conta só mensagens ok do mês corrente e sinaliza modo econômico a 80%', async () => {
    process.env.ASSISTENTE_LIMITE_MENSAL = '10';
    mockPrisma.assistenteMensagem.count.mockResolvedValue(8);
    const agora = new Date(2026, 8, 10);
    const uso = await usoMensal('u1', agora);
    expect(mockPrisma.assistenteMensagem.count).toHaveBeenCalledWith({
      where: { userId: 'u1', ok: true, createdAt: { gte: inicioDoMes(agora) } },
    });
    expect(inicioDoMes(agora)).toEqual(new Date(2026, 8, 1));
    expect(uso).toEqual({ usadas: 8, limite: 10, restantes: 2, economico: true });
  });

  it('registrarMensagem grava métricas e nunca lança', async () => {
    mockPrisma.assistenteMensagem.create.mockResolvedValue({ id: 'm1' });
    const id = await registrarMensagem({
      userId: 'u1',
      actorId: 'u1',
      viaConsultant: false,
      intencao: 'outro',
      motor: 'ia',
      textoUsuario: 'x'.repeat(500),
      propostaGerada: false,
      resposta: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        text: 'oi',
        toolCalls: [],
        stopReason: 'end',
        usage: {
          inputTokens: 1,
          cachedInputTokens: 2,
          cacheWriteTokens: 3,
          outputTokens: 4,
          reasoningTokens: 0,
        },
        costUsd: 0.001,
        costBrl: 0.005,
        latencyMs: 123,
      },
    });
    expect(id).toBe('m1');
    const data = mockPrisma.assistenteMensagem.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      modelo: 'claude-haiku-4-5',
      cachedInputTokens: 2,
      custoBrl: 0.005,
      ok: true,
    });
    expect(data.textoUsuario).toHaveLength(300);

    mockPrisma.assistenteMensagem.create.mockRejectedValue(new Error('db down'));
    await expect(
      registrarMensagem({
        userId: 'u1',
        actorId: 'u1',
        viaConsultant: false,
        intencao: 'outro',
        motor: 'ia',
        textoUsuario: null,
        propostaGerada: false,
        resposta: null,
        erro: 'falhou',
      }),
    ).resolves.toBeNull();
  });

  it('marcarPropostaConfirmada é best-effort', async () => {
    mockPrisma.assistenteMensagem.update.mockRejectedValue(new Error('x'));
    await expect(marcarPropostaConfirmada('m1')).resolves.toBeUndefined();
  });
});
