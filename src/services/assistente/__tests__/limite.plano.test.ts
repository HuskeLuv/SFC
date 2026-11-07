/**
 * Assinaturas F2: cota mensal da IA por plano. Chave desligada = limiteMensal() de hoje; ligada =
 * min(LIMITES_PLANO.ia[plano] ou override, ASSISTENTE_LIMITE_MENSAL). A cota conta no cliente.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  assistenteMensagem: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
const mockPlano = vi.hoisted(() => ({ planoDoUsuario: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma, default: mockPrisma }));
vi.mock('@/services/planos/resolverPlano', () => mockPlano);

import { limiteMensal, usoMensal } from '../limite';

function ligar() {
  vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');
}

describe('limite mensal da IA × plano', () => {
  beforeEach(() => {
    mockPrisma.assistenteMensagem.count.mockReset();
    mockPlano.planoDoUsuario.mockReset();
    vi.stubEnv('ASSINATURAS_HABILITADAS', '');
    vi.stubEnv('ASSISTENTE_LIMITE_MENSAL', '');
    for (const p of ['BASIC', 'PRO', 'ADV']) vi.stubEnv(`ASSINATURAS_LIMITE_IA_${p}`, '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('chave desligada: o plano é ignorado (limite de hoje)', () => {
    expect(limiteMensal()).toBe(300);
    expect(limiteMensal('basic')).toBe(300);
    vi.stubEnv('ASSISTENTE_LIMITE_MENSAL', '50');
    expect(limiteMensal('adv')).toBe(50);
  });

  it('chave ligada: 30 / 100 / 300 por plano; sem plano, o teto', () => {
    ligar();
    expect(limiteMensal('basic')).toBe(30);
    expect(limiteMensal('pro')).toBe(100);
    expect(limiteMensal('adv')).toBe(300);
    expect(limiteMensal()).toBe(300);
  });

  it('nunca acima de ASSISTENTE_LIMITE_MENSAL (teto global)', () => {
    ligar();
    vi.stubEnv('ASSISTENTE_LIMITE_MENSAL', '80');
    expect(limiteMensal('basic')).toBe(30);
    expect(limiteMensal('pro')).toBe(80);
    expect(limiteMensal('adv')).toBe(80);
  });

  it('override por env (ASSINATURAS_LIMITE_IA_*), ainda limitado pelo teto', () => {
    ligar();
    vi.stubEnv('ASSINATURAS_LIMITE_IA_BASIC', '5');
    vi.stubEnv('ASSINATURAS_LIMITE_IA_ADV', '1000');
    expect(limiteMensal('basic')).toBe(5);
    expect(limiteMensal('adv')).toBe(300);
  });

  it('usoMensal com a chave desligada: não resolve plano e o corpo fica igual ao de antes', async () => {
    mockPrisma.assistenteMensagem.count.mockResolvedValue(3);
    expect(await usoMensal('u1')).toEqual({
      usadas: 3,
      limite: 300,
      restantes: 297,
      economico: false,
    });
    expect(mockPlano.planoDoUsuario).not.toHaveBeenCalled();
  });

  it('usoMensal com a chave ligada: cota do plano do dono dos dados', async () => {
    ligar();
    mockPlano.planoDoUsuario.mockResolvedValue('basic');
    mockPrisma.assistenteMensagem.count.mockResolvedValue(30);
    expect(await usoMensal('cliente')).toEqual({
      usadas: 30,
      limite: 30,
      restantes: 0,
      economico: true,
      plano: 'basic',
    });
    expect(mockPlano.planoDoUsuario).toHaveBeenCalledWith('cliente');
    expect(mockPrisma.assistenteMensagem.count.mock.calls[0][0].where.userId).toBe('cliente');
  });
});
