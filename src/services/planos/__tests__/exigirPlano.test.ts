import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockPlano = vi.hoisted(() => ({
  planoDoUsuario: vi.fn(),
  planoParaRequisicao: vi.fn(),
}));
vi.mock('@/services/planos/resolverPlano', () => mockPlano);

import { ApiError, withErrorHandler } from '@/utils/apiErrorHandler';
import {
  erroPlanoInsuficiente,
  exigirPlano,
  exigirPlanoDaRota,
  exigirPlanoRequisicao,
} from '../exigirPlano';

const AUTH = { payload: { id: 'u1' }, targetUserId: 'u1' };

function ligar() {
  vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');
}

async function erroDe(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('não lançou');
}

describe('exigirPlano', () => {
  beforeEach(() => {
    mockPlano.planoDoUsuario.mockReset();
    mockPlano.planoParaRequisicao.mockReset();
    vi.stubEnv('ASSINATURAS_HABILITADAS', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('chave desligada: libera tudo sem consultar nada', async () => {
    expect(await exigirPlano('u1', 'adv')).toBe('adv');
    expect(await exigirPlanoRequisicao(AUTH, 'adv')).toBe('adv');
    expect(await exigirPlanoDaRota(AUTH, '/api/saude-financeira', 'GET')).toBeNull();
    expect(mockPlano.planoDoUsuario).not.toHaveBeenCalled();
    expect(mockPlano.planoParaRequisicao).not.toHaveBeenCalled();
  });

  it('plano suficiente devolve o plano efetivo', async () => {
    ligar();
    mockPlano.planoDoUsuario.mockResolvedValue('adv');
    expect(await exigirPlano('u1', 'pro')).toBe('adv');
    expect(mockPlano.planoDoUsuario).toHaveBeenCalledWith('u1');
  });

  it('plano insuficiente: ApiError 403 com codigo, need e plano', async () => {
    ligar();
    mockPlano.planoDoUsuario.mockResolvedValue('basic');
    const e = await erroDe(exigirPlano('u1', 'pro'));
    expect(e.statusCode).toBe(403);
    expect(e.message).toBe('Recurso disponível no plano Pro');
    expect(e.extra).toEqual({ codigo: 'plano_insuficiente', need: 'pro', plano: 'basic' });
  });

  it('exigirPlanoRequisicao usa a regra do consultor (planoParaRequisicao)', async () => {
    ligar();
    const auth = { payload: { id: 'consultor' }, targetUserId: 'cliente' };
    mockPlano.planoParaRequisicao.mockResolvedValue('pro');
    expect(await exigirPlanoRequisicao(auth, 'pro')).toBe('pro');
    expect(mockPlano.planoParaRequisicao).toHaveBeenCalledWith(auth);
    const e = await erroDe(exigirPlanoRequisicao(auth, 'adv'));
    expect(e.extra).toEqual({ codigo: 'plano_insuficiente', need: 'adv', plano: 'pro' });
  });

  describe('exigirPlanoDaRota (gate central)', () => {
    beforeEach(() => ligar());

    it('rota basic/isenta não consulta o plano', async () => {
      for (const p of ['/api/cashflow', '/api/auth/me', '/api/saude-financeira/config']) {
        expect(await exigirPlanoDaRota(AUTH, p, 'GET')).toBeNull();
      }
      expect(mockPlano.planoParaRequisicao).not.toHaveBeenCalled();
    });

    it('prefixo mais longo vence', async () => {
      mockPlano.planoParaRequisicao.mockResolvedValue('pro');
      expect(await exigirPlanoDaRota(AUTH, '/api/analises/indicadores', 'GET')).toBeNull();
      expect(await exigirPlanoDaRota(AUTH, '/api/analises/rentabilidade-janelas', 'GET')).toBe(
        'pro',
      );
      const ir = await erroDe(exigirPlanoDaRota(AUTH, '/api/analises/ir-mensal', 'GET'));
      expect(ir.extra).toMatchObject({ need: 'adv', plano: 'pro' });
      const saude = await erroDe(exigirPlanoDaRota(AUTH, '/api/saude-financeira/evolucao', 'GET'));
      expect(saude.extra).toMatchObject({ need: 'adv' });
    });

    it('DELETE livre na carteira para quem caiu de plano', async () => {
      mockPlano.planoParaRequisicao.mockResolvedValue('basic');
      expect(await exigirPlanoDaRota(AUTH, '/api/ativos/abc', 'DELETE')).toBeNull();
      expect(await exigirPlanoDaRota(AUTH, '/api/carteira/operacao', 'delete')).toBeNull();
      const e = await erroDe(exigirPlanoDaRota(AUTH, '/api/carteira/resumo', 'GET'));
      expect(e.extra).toEqual({ codigo: 'plano_insuficiente', need: 'pro', plano: 'basic' });
    });
  });

  it('withErrorHandler devolve o JSON do 403 com os campos extras', async () => {
    const handler = withErrorHandler(async () => {
      throw erroPlanoInsuficiente('adv', 'pro');
    });
    const res = await handler(new NextRequest('http://localhost/api/saude-financeira'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'Recurso disponível no plano Advanced',
      codigo: 'plano_insuficiente',
      need: 'adv',
      plano: 'pro',
    });
  });

  it('extra não sobrescreve error nem details', async () => {
    const handler = withErrorHandler(async () => {
      throw new ApiError(400, 'Mensagem', { campo: ['x'] }, { error: 'outra', details: 'y', a: 1 });
    });
    const res = await handler(new NextRequest('http://localhost/api/x'));
    expect(await res.json()).toEqual({ error: 'Mensagem', details: { campo: ['x'] }, a: 1 });
  });
});
