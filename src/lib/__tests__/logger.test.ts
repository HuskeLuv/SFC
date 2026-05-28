import { describe, it, expect } from 'vitest';
import { redactPII } from '../logger';

describe('redactPII', () => {
  it('mascara email em string', () => {
    expect(redactPII('contact me at alice@example.com please')).toBe(
      'contact me at ***@example.com please',
    );
  });

  it('mascara JWT em string', () => {
    const jwt = 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc';
    expect(redactPII(`Bearer ${jwt}`)).toBe('Bearer ***JWT***');
  });

  it('mascara CPF com e sem pontuação', () => {
    expect(redactPII('CPF: 123.456.789-00')).toBe('CPF: ***CPF***');
    expect(redactPII('12345678900')).toBe('***CPF***');
  });

  it('mascara chaves sensíveis em objeto (case insensitive)', () => {
    const out = redactPII({
      email: 'a@b.com',
      Password: 'p',
      currentPassword: 'p2',
      Token: 'tok',
      cookie: 'sess=xyz',
      apiKey: 'k',
      cpf: '12345678900',
      keep: 'visible',
    }) as Record<string, unknown>;
    expect(out.Password).toBe('***REDACTED***');
    expect(out.currentPassword).toBe('***REDACTED***');
    expect(out.Token).toBe('***REDACTED***');
    expect(out.cookie).toBe('***REDACTED***');
    expect(out.apiKey).toBe('***REDACTED***');
    expect(out.cpf).toBe('***REDACTED***');
    expect(out.keep).toBe('visible');
    // email NÃO está na lista de chaves; o valor é redatado via regex.
    expect(out.email).toBe('***@b.com');
  });

  it('recursa em arrays e objetos aninhados', () => {
    const out = redactPII({
      users: [
        { email: 'a@b.com', name: 'Alice' },
        { email: 'c@d.com', password: 'x' },
      ],
    }) as { users: Array<Record<string, unknown>> };
    expect(out.users[0].email).toBe('***@b.com');
    expect(out.users[0].name).toBe('Alice');
    expect(out.users[1].password).toBe('***REDACTED***');
    expect(out.users[1].email).toBe('***@d.com');
  });

  it('lida com referência circular sem stack overflow', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    const out = redactPII(a) as Record<string, unknown>;
    expect(out.name).toBe('a');
    expect(out.self).toBe('[Circular]');
  });

  it('transforma Error em objeto serializável com mensagem redatada', () => {
    const err = new Error('login failed for alice@example.com');
    const out = redactPII(err) as { name: string; message: string };
    expect(out.name).toBe('Error');
    expect(out.message).toBe('login failed for ***@example.com');
  });

  it('preserva tipos primitivos', () => {
    expect(redactPII(42)).toBe(42);
    expect(redactPII(true)).toBe(true);
    expect(redactPII(null)).toBe(null);
    expect(redactPII(undefined)).toBe(undefined);
  });

  it('trunca além de MAX_DEPTH', () => {
    type Nested = { next?: Nested; v: number };
    const deep: Nested = { v: 0 };
    let cur: Nested = deep;
    for (let i = 0; i < 10; i++) {
      cur.next = { v: i + 1 };
      cur = cur.next;
    }
    // A profundidade > 6 cai em '[Truncated]'.
    const out = JSON.stringify(redactPII(deep));
    expect(out).toContain('[Truncated]');
  });
});
