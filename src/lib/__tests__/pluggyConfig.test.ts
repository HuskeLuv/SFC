import { afterEach, describe, expect, it } from 'vitest';
import {
  PLUGGY_WEBHOOK_IPS,
  pluggyCredenciais,
  pluggyHabilitado,
  pluggyIncluiSandbox,
  pluggyWebhookSecret,
} from '../pluggyConfig';

describe('pluggyConfig', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('habilitado exige flag E as duas credenciais', () => {
    delete process.env.PLUGGY_HABILITADO;
    process.env.PLUGGY_CLIENT_ID = 'id';
    process.env.PLUGGY_CLIENT_SECRET = 'secret';
    expect(pluggyHabilitado()).toBe(false);

    process.env.PLUGGY_HABILITADO = 'true';
    expect(pluggyHabilitado()).toBe(true);

    process.env.PLUGGY_CLIENT_SECRET = '   ';
    expect(pluggyHabilitado()).toBe(false);
    expect(pluggyCredenciais()).toBeNull();
  });

  it('credenciais vêm sem espaços', () => {
    process.env.PLUGGY_CLIENT_ID = ' id ';
    process.env.PLUGGY_CLIENT_SECRET = ' secret ';
    expect(pluggyCredenciais()).toEqual({ clientId: 'id', clientSecret: 'secret' });
  });

  it('sandbox e segredo do webhook são opcionais', () => {
    delete process.env.PLUGGY_INCLUI_SANDBOX;
    delete process.env.PLUGGY_WEBHOOK_SECRET;
    expect(pluggyIncluiSandbox()).toBe(false);
    expect(pluggyWebhookSecret()).toBeNull();
    process.env.PLUGGY_INCLUI_SANDBOX = 'true';
    process.env.PLUGGY_WEBHOOK_SECRET = 'whs';
    expect(pluggyIncluiSandbox()).toBe(true);
    expect(pluggyWebhookSecret()).toBe('whs');
  });

  it('conhece o IP fixo de saída dos webhooks', () => {
    expect(PLUGGY_WEBHOOK_IPS).toContain('52.67.145.81');
  });
});
