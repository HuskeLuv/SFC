import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cortesiaVigente,
  lancamentoVigente,
  legadoVigente,
  planoDaAssinatura,
  planoEfetivo,
  type LinhaAssinaturaPlano,
} from '../planoEfetivo';

const CORTE = '2026-11-15T03:00:00Z';
const ANTES_CORTE = new Date('2026-08-01T12:00:00Z');
const DEPOIS_CORTE = new Date('2026-11-20T12:00:00Z');

function linha(p: Partial<LinhaAssinaturaPlano> = {}): LinhaAssinaturaPlano {
  return { status: 'none', stripePriceId: null, cortesiaPlano: null, cortesiaAte: null, ...p };
}

describe('planoEfetivo', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_PRICE_PRO_MENSAL', 'price_pro_mes');
    vi.stubEnv('STRIPE_PRICE_PRO_ANUAL', 'price_pro_ano');
    vi.stubEnv('STRIPE_PRICE_ADV_MENSAL', 'price_adv_mes');
    vi.stubEnv('STRIPE_PRICE_ADV_ANUAL', 'price_adv_ano');
    vi.stubEnv('ASSINATURAS_CORTESIA_CORTE', CORTE);
    vi.stubEnv('ASSINATURAS_CORTESIA_ATE', '2027-01-15T03:00:00Z');
    vi.stubEnv('ASSINATURAS_LANCAMENTO_ATE', '2026-12-20T03:00:00Z');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('planoDaAssinatura (status → plano)', () => {
    it.each(['active', 'trialing', 'past_due'])('%s = plano do priceId', (status) => {
      expect(planoDaAssinatura(linha({ status, stripePriceId: 'price_pro_mes' }))).toBe('pro');
      expect(planoDaAssinatura(linha({ status, stripePriceId: 'price_adv_ano' }))).toBe('adv');
    });

    it.each(['incomplete', 'incomplete_expired', 'unpaid', 'canceled', 'paused', 'none', 'xyz'])(
      '%s = basic',
      (status) => {
        expect(planoDaAssinatura(linha({ status, stripePriceId: 'price_adv_ano' }))).toBe('basic');
      },
    );

    it('sem linha = basic', () => {
      expect(planoDaAssinatura(null)).toBe('basic');
      expect(planoDaAssinatura(undefined)).toBe('basic');
    });

    it('cancelAtPeriodEnd não muda o plano (status segue active até o fim)', () => {
      const l = {
        ...linha({ status: 'active', stripePriceId: 'price_pro_ano' }),
        cancelAtPeriodEnd: true,
      };
      expect(planoDaAssinatura(l)).toBe('pro');
    });

    it('priceId desconhecido = log + basic', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(planoDaAssinatura(linha({ status: 'active', stripePriceId: 'price_velho' }))).toBe(
        'basic',
      );
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('fontes gratuitas', () => {
    it('cortesia com e sem data', () => {
      const agora = new Date('2026-12-01T00:00:00Z');
      expect(cortesiaVigente(linha({ cortesiaPlano: 'adv' }), agora)).toBe('adv');
      expect(
        cortesiaVigente(
          linha({ cortesiaPlano: 'pro', cortesiaAte: new Date('2026-12-01T00:00:01Z') }),
          agora,
        ),
      ).toBe('pro');
      expect(
        cortesiaVigente(linha({ cortesiaPlano: 'pro', cortesiaAte: new Date(agora) }), agora),
      ).toBeNull();
      expect(cortesiaVigente(linha({ cortesiaPlano: 'basic' }), agora)).toBeNull();
      expect(cortesiaVigente(linha(), agora)).toBeNull();
      expect(cortesiaVigente(null, agora)).toBeNull();
    });

    it('legado: criado antes do corte, até CORTESIA_ATE', () => {
      expect(legadoVigente(ANTES_CORTE, new Date('2027-01-15T02:59:59Z'))).toBe(true);
      expect(legadoVigente(ANTES_CORTE, new Date('2027-01-15T03:00:00Z'))).toBe(false);
      expect(legadoVigente(new Date(CORTE), new Date('2026-12-01T00:00:00Z'))).toBe(false);
      expect(legadoVigente(new Date('2026-11-15T02:59:59Z'), new Date('2026-12-01Z'))).toBe(true);
    });

    it('legado sem CORTESIA_ATE = sem data', () => {
      vi.stubEnv('ASSINATURAS_CORTESIA_ATE', '');
      expect(legadoVigente(ANTES_CORTE, new Date('2030-01-01T00:00:00Z'))).toBe(true);
    });

    it('lançamento: criado no corte ou depois, até LANCAMENTO_ATE; ausente = não há', () => {
      expect(lancamentoVigente(new Date(CORTE), new Date('2026-12-20T02:59:59Z'))).toBe(true);
      expect(lancamentoVigente(DEPOIS_CORTE, new Date('2026-12-20T03:00:00Z'))).toBe(false);
      expect(lancamentoVigente(ANTES_CORTE, new Date('2026-12-01T00:00:00Z'))).toBe(false);
      vi.stubEnv('ASSINATURAS_LANCAMENTO_ATE', '');
      expect(lancamentoVigente(DEPOIS_CORTE, new Date('2026-12-01T00:00:00Z'))).toBe(false);
    });
  });

  describe('max das quatro fontes', () => {
    const agora = new Date('2026-12-01T00:00:00Z');

    it('legado + linha status none (checkout abandonado) = adv legado', () => {
      const r = planoEfetivo({ createdAt: ANTES_CORTE, assinatura: linha(), agora });
      expect(r).toEqual({
        plano: 'adv',
        origem: 'legado',
        planoAssinatura: 'basic',
        acessoAte: new Date('2027-01-15T03:00:00Z'),
      });
    });

    it('legado + assinatura Pro ativa = adv (assinar não encurta a cortesia)', () => {
      const r = planoEfetivo({
        createdAt: ANTES_CORTE,
        assinatura: linha({ status: 'active', stripePriceId: 'price_pro_ano' }),
        agora,
      });
      expect(r.plano).toBe('adv');
      expect(r.origem).toBe('legado');
      expect(r.planoAssinatura).toBe('pro');
    });

    it('depois do legado, vale a assinatura', () => {
      const r = planoEfetivo({
        createdAt: ANTES_CORTE,
        assinatura: linha({ status: 'active', stripePriceId: 'price_pro_ano' }),
        agora: new Date('2027-02-01T00:00:00Z'),
      });
      expect(r).toMatchObject({ plano: 'pro', origem: 'assinatura', acessoAte: null });
    });

    it('lançamento: cadastro novo sem linha = adv até LANCAMENTO_ATE, depois basic', () => {
      expect(planoEfetivo({ createdAt: DEPOIS_CORTE, assinatura: null, agora })).toMatchObject({
        plano: 'adv',
        origem: 'lancamento',
        acessoAte: new Date('2026-12-20T03:00:00Z'),
      });
      expect(
        planoEfetivo({
          createdAt: DEPOIS_CORTE,
          assinatura: null,
          agora: new Date('2026-12-21T00:00:00Z'),
        }),
      ).toMatchObject({ plano: 'basic', origem: 'basic', acessoAte: null });
    });

    it('cortesia da linha vence a assinatura menor', () => {
      const r = planoEfetivo({
        createdAt: DEPOIS_CORTE,
        assinatura: linha({
          status: 'active',
          stripePriceId: 'price_pro_mes',
          cortesiaPlano: 'adv',
          cortesiaAte: new Date('2027-03-01T00:00:00Z'),
        }),
        agora: new Date('2027-01-01T00:00:00Z'),
      });
      expect(r).toMatchObject({
        plano: 'adv',
        origem: 'cortesia',
        planoAssinatura: 'pro',
        acessoAte: new Date('2027-03-01T00:00:00Z'),
      });
    });

    it('empate: quem paga aparece como assinatura', () => {
      const r = planoEfetivo({
        createdAt: ANTES_CORTE,
        assinatura: linha({
          status: 'past_due',
          stripePriceId: 'price_adv_mes',
          cortesiaPlano: 'adv',
        }),
        agora,
      });
      expect(r).toMatchObject({ plano: 'adv', origem: 'assinatura', acessoAte: null });
    });

    it('nada vigente = basic', () => {
      const r = planoEfetivo({
        createdAt: DEPOIS_CORTE,
        assinatura: linha({ status: 'canceled', stripePriceId: 'price_adv_ano' }),
        agora: new Date('2027-06-01T00:00:00Z'),
      });
      expect(r).toEqual({
        plano: 'basic',
        origem: 'basic',
        planoAssinatura: 'basic',
        acessoAte: null,
      });
    });
  });
});
