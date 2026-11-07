import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const construtor = vi.hoisted(() => vi.fn());
vi.mock('stripe', () => ({
  default: class StripeFalso {
    constructor(...args: unknown[]) {
      construtor(...args);
    }
  },
}));

import { definirStripeParaTestes, obterStripe, STRIPE_API_VERSION } from '../stripe';

describe('obterStripe', () => {
  afterEach(() => {
    definirStripeParaTestes(undefined);
    construtor.mockReset();
    vi.unstubAllEnvs();
  });

  it('sem STRIPE_SECRET_KEY lança e não cria cliente', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    expect(() => obterStripe()).toThrow('STRIPE_SECRET_KEY não configurada');
    expect(construtor).not.toHaveBeenCalled();
  });

  it('cria uma vez (globalThis) com apiVersion fixada, retries e appInfo', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake');
    const a = obterStripe();
    const b = obterStripe();
    expect(a).toBe(b);
    expect(construtor).toHaveBeenCalledTimes(1);
    expect(construtor).toHaveBeenCalledWith('sk_test_fake', {
      apiVersion: STRIPE_API_VERSION,
      maxNetworkRetries: 2,
      appInfo: { name: 'MyFinance' },
      typescript: true,
    });
  });

  it('a apiVersion fixada é a do pacote instalado', () => {
    const fonte = readFileSync(
      path.resolve(process.cwd(), 'node_modules/stripe/esm/apiVersion.js'),
      'utf8',
    );
    expect(fonte).toContain(`ApiVersion = '${STRIPE_API_VERSION}'`);
  });
});
