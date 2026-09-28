import { afterEach, describe, expect, it } from 'vitest';
import {
  PLUGGY_WEBHOOK_IPS,
  pluggyCredenciais,
  pluggyHabilitado,
  pluggyIncluiSandbox,
  pluggyOauthRedirectUrl,
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

  it('oauthRedirectUrl: produção tem default, dev só com override https', () => {
    delete process.env.PLUGGY_OAUTH_REDIRECT_URL;
    expect(pluggyOauthRedirectUrl()).toBeUndefined(); // NODE_ENV=test

    process.env.PLUGGY_OAUTH_REDIRECT_URL = 'https://tunel.exemplo.dev/conexoes-bancarias';
    expect(pluggyOauthRedirectUrl()).toBe('https://tunel.exemplo.dev/conexoes-bancarias');

    // A Pluggy rejeita HTTP/localhost: override que não é https é descartado.
    process.env.PLUGGY_OAUTH_REDIRECT_URL = 'http://localhost:3000/conexoes-bancarias';
    expect(pluggyOauthRedirectUrl()).toBeUndefined();

    delete process.env.PLUGGY_OAUTH_REDIRECT_URL;
    process.env.NODE_ENV = 'production';
    expect(pluggyOauthRedirectUrl()).toBe('https://appmyfinance.com.br/conexoes-bancarias');
  });
});
