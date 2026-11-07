import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASSINATURAS_CORTESIA_CORTE_PADRAO,
  assinaturasAppUrl,
  assinaturasHabilitadas,
  carenciaDias,
  cortesiaAte,
  cortesiaCorte,
  cupomOfertaAnual,
  lancamentoAte,
  limiteDoPlano,
  precoParaPlano,
  priceDe,
  stripeModoLive,
} from '../assinaturasConfig';

const PRICES = {
  STRIPE_PRICE_PRO_MENSAL: 'price_test_pro_mes',
  STRIPE_PRICE_PRO_ANUAL: 'price_test_pro_ano',
  STRIPE_PRICE_ADV_MENSAL: 'price_test_adv_mes',
  STRIPE_PRICE_ADV_ANUAL: 'price_test_adv_ano',
};

function ligar() {
  vi.stubEnv('ASSINATURAS_HABILITADAS', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_fake');
}

describe('assinaturasConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('desligada por padrão', () => {
    vi.stubEnv('ASSINATURAS_HABILITADAS', '');
    expect(assinaturasHabilitadas()).toBe(false);
  });

  it('liga só com "true" + chave secreta + segredo do webhook', () => {
    ligar();
    expect(assinaturasHabilitadas()).toBe(true);

    vi.stubEnv('ASSINATURAS_HABILITADAS', '1');
    expect(assinaturasHabilitadas()).toBe(false);

    ligar();
    vi.stubEnv('STRIPE_SECRET_KEY', '  ');
    expect(assinaturasHabilitadas()).toBe(false);

    ligar();
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    expect(assinaturasHabilitadas()).toBe(false);
  });

  it('modo live pela chave', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
    expect(stripeModoLive()).toBe(false);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fake');
    expect(stripeModoLive()).toBe(true);
  });

  it('priceDe e precoParaPlano (ida e volta)', () => {
    for (const [k, v] of Object.entries(PRICES)) vi.stubEnv(k, v);
    expect(priceDe('pro', 'mes')).toBe('price_test_pro_mes');
    expect(priceDe('adv', 'ano')).toBe('price_test_adv_ano');
    expect(precoParaPlano('price_test_pro_ano')).toEqual({ plano: 'pro', intervalo: 'ano' });
    expect(precoParaPlano('price_test_adv_mes')).toEqual({ plano: 'adv', intervalo: 'mes' });
    expect(precoParaPlano('price_desconhecido')).toBeNull();
    expect(precoParaPlano(null)).toBeNull();
    expect(precoParaPlano('')).toBeNull();
  });

  it('price ausente no env = null (e não casa com priceId vazio)', () => {
    vi.stubEnv('STRIPE_PRICE_PRO_MENSAL', '');
    expect(priceDe('pro', 'mes')).toBeNull();
    expect(precoParaPlano(undefined)).toBeNull();
  });

  it('cupom da oferta por plano', () => {
    vi.stubEnv('STRIPE_COUPON_BF_PRO_ANUAL', 'bf_pro');
    vi.stubEnv('STRIPE_COUPON_BF_ADV_ANUAL', '');
    expect(cupomOfertaAnual('pro')).toBe('bf_pro');
    expect(cupomOfertaAnual('adv')).toBeNull();
  });

  it('URL do app: padrão e sem barra final', () => {
    vi.stubEnv('ASSINATURAS_APP_URL', '');
    expect(assinaturasAppUrl()).toBe('https://appmyfinance.com.br');
    vi.stubEnv('ASSINATURAS_APP_URL', 'http://localhost:3000/');
    expect(assinaturasAppUrl()).toBe('http://localhost:3000');
  });

  it('datas da migração: padrão do corte, inválidas = ausentes', () => {
    vi.stubEnv('ASSINATURAS_CORTESIA_CORTE', '');
    vi.stubEnv('ASSINATURAS_CORTESIA_ATE', '');
    vi.stubEnv('ASSINATURAS_LANCAMENTO_ATE', '');
    expect(cortesiaCorte().toISOString()).toBe(
      new Date(ASSINATURAS_CORTESIA_CORTE_PADRAO).toISOString(),
    );
    expect(cortesiaAte()).toBeNull();
    expect(lancamentoAte()).toBeNull();

    vi.stubEnv('ASSINATURAS_CORTESIA_CORTE', '2000-01-01T00:00:00Z');
    vi.stubEnv('ASSINATURAS_CORTESIA_ATE', '2027-01-15T03:00:00Z');
    vi.stubEnv('ASSINATURAS_LANCAMENTO_ATE', 'amanhã');
    expect(cortesiaCorte().toISOString()).toBe('2000-01-01T00:00:00.000Z');
    expect(cortesiaAte()?.toISOString()).toBe('2027-01-15T03:00:00.000Z');
    expect(lancamentoAte()).toBeNull();
  });

  it('carência: padrão 7, override inteiro', () => {
    vi.stubEnv('ASSINATURAS_CARENCIA_DIAS', '');
    expect(carenciaDias()).toBe(7);
    vi.stubEnv('ASSINATURAS_CARENCIA_DIAS', '10');
    expect(carenciaDias()).toBe(10);
    vi.stubEnv('ASSINATURAS_CARENCIA_DIAS', '-3');
    expect(carenciaDias()).toBe(7);
  });

  it('limites: LIMITES_PLANO com override por env', () => {
    vi.stubEnv('ASSINATURAS_LIMITE_IA_PRO', '');
    vi.stubEnv('ASSINATURAS_LIMITE_CONEXOES_BASIC', '');
    expect(limiteDoPlano('ia', 'pro')).toBe(100);
    expect(limiteDoPlano('conexoes', 'basic')).toBe(1);
    vi.stubEnv('ASSINATURAS_LIMITE_IA_PRO', '150');
    vi.stubEnv('ASSINATURAS_LIMITE_CONEXOES_BASIC', '2');
    expect(limiteDoPlano('ia', 'pro')).toBe(150);
    expect(limiteDoPlano('conexoes', 'basic')).toBe(2);
    vi.stubEnv('ASSINATURAS_LIMITE_CONEXOES_ADV', 'muitas');
    expect(limiteDoPlano('conexoes', 'adv')).toBe(6);
  });
});
