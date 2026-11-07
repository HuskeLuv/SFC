import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));

import {
  PLANO_CACHE_TTL_MS,
  PLANO_PADRAO,
  avisarSeOverrideForaDoLocal,
  invalidarPlano,
  planoDoUsuario,
  planoForcado,
  planoParaRequisicao,
  resolverAssinatura,
} from '../resolverPlano';

describe('resolverPlano', () => {
  beforeEach(() => {
    vi.stubEnv('PLANO_FORCADO', '');
    vi.stubEnv('PLANO_FORCADO_PERMITIDO', '');
    vi.stubEnv('ASSINATURAS_HABILITADAS', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('todo usuário é Advanced até o Stripe', async () => {
    vi.stubEnv('RELATORIO_PLANO_FORCADO', '');
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '');
    expect(PLANO_PADRAO).toBe('adv');
    expect(await planoDoUsuario('user-1')).toBe('adv');
  });

  it('ignora o override sem RELATORIO_PLANO_FORCADO_PERMITIDO=1', async () => {
    vi.stubEnv('RELATORIO_PLANO_FORCADO', 'basic');
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '');
    expect(planoForcado()).toBeNull();
    expect(await planoDoUsuario('user-1')).toBe('adv');

    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', 'true');
    expect(await planoDoUsuario('user-1')).toBe('adv');
  });

  it('com PERMITIDO=1 o override vale (basic, pro, adv)', async () => {
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '1');
    for (const p of ['basic', 'pro', 'adv'] as const) {
      vi.stubEnv('RELATORIO_PLANO_FORCADO', p);
      expect(await planoDoUsuario('user-1')).toBe(p);
    }
    vi.stubEnv('RELATORIO_PLANO_FORCADO', ' PRO ');
    expect(await planoDoUsuario('user-1')).toBe('pro');
  });

  it('valor inválido no override cai no padrão', async () => {
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '1');
    vi.stubEnv('RELATORIO_PLANO_FORCADO', 'premium');
    expect(await planoDoUsuario('user-1')).toBe('adv');
  });

  it('avisa no log quando o override está ativo com banco que não é localhost', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '1');
    vi.stubEnv('RELATORIO_PLANO_FORCADO', 'basic');

    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:5433/sfc_test');
    expect(avisarSeOverrideForaDoLocal()).toBe(false);
    expect(warn).not.toHaveBeenCalled();

    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@db.exemplo.com:5432/prod');
    expect(avisarSeOverrideForaDoLocal()).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('sem override não avisa, qualquer que seja o banco', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('RELATORIO_PLANO_FORCADO', 'basic');
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '');
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@db.exemplo.com:5432/prod');
    expect(avisarSeOverrideForaDoLocal()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('resolverPlano com assinaturas', () => {
  const ANTES_CORTE = new Date('2026-08-01T12:00:00Z');
  const DEPOIS_CORTE = new Date('2026-11-20T12:00:00Z');
  const AGORA = new Date('2026-12-01T00:00:00Z');

  function linha(p: Record<string, unknown> = {}) {
    return {
      id: 'a1',
      userId: 'u1',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      plano: 'basic',
      intervalo: null,
      status: 'none',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEnd: null,
      carenciaAte: null,
      primeiraCobrancaEm: null,
      cortesiaPlano: null,
      cortesiaAte: null,
      cortesiaMotivo: null,
      ultimoEventoStripeEm: null,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
      ...p,
    };
  }

  function usuario(p: { role?: string; createdAt?: Date; assinatura?: unknown } = {}) {
    return { role: 'user', createdAt: DEPOIS_CORTE, assinatura: null, ...p };
  }

  function ligar() {
    vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');
  }

  beforeEach(() => {
    mockPrisma.user.findUnique.mockReset();
    invalidarPlano();
    vi.stubEnv('PLANO_FORCADO', '');
    vi.stubEnv('PLANO_FORCADO_PERMITIDO', '');
    vi.stubEnv('RELATORIO_PLANO_FORCADO', '');
    vi.stubEnv('RELATORIO_PLANO_FORCADO_PERMITIDO', '');
    vi.stubEnv('STRIPE_PRICE_PRO_MENSAL', 'price_pro_mes');
    vi.stubEnv('STRIPE_PRICE_PRO_ANUAL', 'price_pro_ano');
    vi.stubEnv('STRIPE_PRICE_ADV_MENSAL', 'price_adv_mes');
    vi.stubEnv('STRIPE_PRICE_ADV_ANUAL', 'price_adv_ano');
    vi.stubEnv('ASSINATURAS_CORTESIA_CORTE', '2026-11-15T03:00:00Z');
    vi.stubEnv('ASSINATURAS_CORTESIA_ATE', '2027-01-15T03:00:00Z');
    vi.stubEnv('ASSINATURAS_LANCAMENTO_ATE', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('chave desligada = adv sem tocar no banco (planoDoUsuario e resolverAssinatura)', async () => {
    vi.stubEnv('ASSINATURAS_HABILITADAS', '');
    expect(await planoDoUsuario('u1')).toBe('adv');
    expect(await resolverAssinatura('u1')).toEqual({
      plano: 'adv',
      origem: 'desligado',
      acessoAte: null,
      planoAssinatura: 'basic',
      assinatura: null,
    });
    // "true" sem os segredos do Stripe também é desligada
    vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
    expect(await planoDoUsuario('u1')).toBe('adv');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('override de QA vence a chave ligada, sem banco; PLANO_FORCADO é alias', async () => {
    ligar();
    vi.stubEnv('PLANO_FORCADO_PERMITIDO', '1');
    vi.stubEnv('PLANO_FORCADO', 'pro');
    vi.stubEnv('RELATORIO_PLANO_FORCADO', 'basic');
    expect(await planoDoUsuario('u1')).toBe('pro');
    expect((await resolverAssinatura('u1')).origem).toBe('forcado');
    vi.stubEnv('PLANO_FORCADO', '');
    expect(await planoDoUsuario('u1')).toBe('basic');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('role consultant/admin = adv', async () => {
    ligar();
    mockPrisma.user.findUnique.mockResolvedValueOnce(usuario({ role: 'consultant' }));
    expect(await resolverAssinatura('c1', { agora: AGORA })).toMatchObject({
      plano: 'adv',
      origem: 'consultor',
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce(usuario({ role: 'admin' }));
    expect(await planoDoUsuario('ad1', { agora: AGORA })).toBe('adv');
  });

  it('lê role, createdAt e a linha da assinatura do usuário', async () => {
    ligar();
    mockPrisma.user.findUnique.mockResolvedValueOnce(usuario());
    await planoDoUsuario('u1', { agora: AGORA });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { role: true, createdAt: true, assinatura: true },
    });
  });

  it('legado antes do CORTE e do ATE = adv; depois do ATE = basic', async () => {
    ligar();
    mockPrisma.user.findUnique.mockResolvedValue(usuario({ createdAt: ANTES_CORTE }));
    expect(await planoDoUsuario('u1', { agora: AGORA, semCache: true })).toBe('adv');
    expect(
      await planoDoUsuario('u1', { agora: new Date('2027-01-15T03:00:00Z'), semCache: true }),
    ).toBe('basic');
  });

  it('LEGADO + linha status none (checkout abandonado) = adv', async () => {
    ligar();
    mockPrisma.user.findUnique.mockResolvedValueOnce(
      usuario({ createdAt: ANTES_CORTE, assinatura: linha({ stripeCustomerId: 'cus_1' }) }),
    );
    const r = await resolverAssinatura('u1', { agora: AGORA });
    expect(r.plano).toBe('adv');
    expect(r.origem).toBe('legado');
    expect(r.assinatura?.stripeCustomerId).toBe('cus_1');
  });

  it('cadastro depois do CORTE sem lançamento = basic; com lançamento = adv', async () => {
    ligar();
    mockPrisma.user.findUnique.mockResolvedValue(usuario());
    expect(await planoDoUsuario('u1', { agora: AGORA, semCache: true })).toBe('basic');
    vi.stubEnv('ASSINATURAS_LANCAMENTO_ATE', '2026-12-20T03:00:00Z');
    expect(await planoDoUsuario('u1', { agora: AGORA, semCache: true })).toBe('adv');
    expect((await resolverAssinatura('u1', { agora: AGORA })).origem).toBe('lancamento');
  });

  it('cortesia da linha com e sem data', async () => {
    ligar();
    mockPrisma.user.findUnique.mockResolvedValue(
      usuario({ assinatura: linha({ cortesiaPlano: 'adv', cortesiaMotivo: 'equipe' }) }),
    );
    expect(await planoDoUsuario('u1', { agora: new Date('2030-01-01Z'), semCache: true })).toBe(
      'adv',
    );
    mockPrisma.user.findUnique.mockResolvedValue(
      usuario({
        assinatura: linha({ cortesiaPlano: 'pro', cortesiaAte: new Date('2026-12-10T00:00:00Z') }),
      }),
    );
    expect(await planoDoUsuario('u1', { agora: AGORA, semCache: true })).toBe('pro');
    expect(
      await planoDoUsuario('u1', { agora: new Date('2026-12-10T00:00:00Z'), semCache: true }),
    ).toBe('basic');
  });

  it('assinatura ativa = plano do price; max das quatro fontes', async () => {
    ligar();
    mockPrisma.user.findUnique.mockResolvedValue(
      usuario({ assinatura: linha({ status: 'active', stripePriceId: 'price_pro_ano' }) }),
    );
    expect(await planoDoUsuario('u1', { agora: AGORA, semCache: true })).toBe('pro');

    mockPrisma.user.findUnique.mockResolvedValue(
      usuario({
        createdAt: ANTES_CORTE,
        assinatura: linha({
          status: 'active',
          stripePriceId: 'price_pro_ano',
          cortesiaPlano: 'pro',
        }),
      }),
    );
    expect(await planoDoUsuario('u1', { agora: AGORA, semCache: true })).toBe('adv');
  });

  it('usuário inexistente = basic', async () => {
    ligar();
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    expect(await planoDoUsuario('nada', { agora: AGORA })).toBe('basic');
  });

  it('cache em globalThis por 60 s; invalidarPlano apaga', async () => {
    ligar();
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    mockPrisma.user.findUnique.mockResolvedValue(usuario());
    expect(await planoDoUsuario('u1')).toBe('basic');
    mockPrisma.user.findUnique.mockResolvedValue(
      usuario({ assinatura: linha({ status: 'active', stripePriceId: 'price_adv_mes' }) }),
    );
    expect(await planoDoUsuario('u1')).toBe('basic'); // do cache
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect((globalThis as { planoCache?: Map<string, unknown> }).planoCache?.has('u1')).toBe(true);

    invalidarPlano('u1');
    expect(await planoDoUsuario('u1')).toBe('adv');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(2);

    mockPrisma.user.findUnique.mockResolvedValue(usuario());
    vi.setSystemTime(new Date(AGORA.getTime() + PLANO_CACHE_TTL_MS - 1));
    expect(await planoDoUsuario('u1')).toBe('adv');
    vi.setSystemTime(new Date(AGORA.getTime() + PLANO_CACHE_TTL_MS + 1));
    expect(await planoDoUsuario('u1')).toBe('basic');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(3);
  });

  it('resolverAssinatura sempre lê o banco e atualiza o cache', async () => {
    ligar();
    mockPrisma.user.findUnique.mockResolvedValue(usuario());
    await planoDoUsuario('u1', { agora: AGORA });
    mockPrisma.user.findUnique.mockResolvedValue(
      usuario({ assinatura: linha({ status: 'trialing', stripePriceId: 'price_pro_mes' }) }),
    );
    expect((await resolverAssinatura('u1', { agora: AGORA })).plano).toBe('pro');
    expect(await planoDoUsuario('u1')).toBe('pro');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  describe('planoParaRequisicao (consultor agindo pelo cliente)', () => {
    beforeEach(() => {
      ligar();
      mockPrisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'consultor'
            ? usuario({ role: 'consultant' })
            : where.id === 'cliente-pro'
              ? usuario({ assinatura: linha({ status: 'active', stripePriceId: 'price_pro_mes' }) })
              : usuario(),
        ),
      );
    });

    it('próprio usuário = plano dele', async () => {
      expect(
        await planoParaRequisicao({ payload: { id: 'cliente' }, targetUserId: 'cliente' }),
      ).toBe('basic');
    });

    it('consultor pelo cliente Basic = max(cliente, consultor) = adv', async () => {
      expect(
        await planoParaRequisicao({ payload: { id: 'consultor' }, targetUserId: 'cliente' }),
      ).toBe('adv');
    });

    it('cotas contam só no cliente (planoDoUsuario(targetUserId))', async () => {
      expect(await planoDoUsuario('cliente-pro')).toBe('pro');
      expect(await planoDoUsuario('cliente')).toBe('basic');
    });
  });
});
