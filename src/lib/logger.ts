/**
 * Logger central com **redaction de PII** (LGPD ATENÇÃO).
 *
 * Em produção (NODE_ENV === 'production'), antes de chamar `console.*`,
 * cada argumento passa por `redactPII` que mascara:
 *  - E-mails: `name@host.tld` → `***@host.tld`
 *  - JWTs (3 segmentos base64 separados por `.`): `***JWT***`
 *  - CPFs com pontuação ou só dígitos
 *  - Chaves comuns em objetos (`password`, `senha`, `token`, `secret`,
 *    `authorization`, `cookie`, `totpSecret`, `apikey`, `cpf`)
 *
 * Em dev/test, passa direto pro `console.*` original sem máscara — facilita
 * debugging local sem perder rastreabilidade em incidentes que aconteçam
 * via logs Vercel/CloudWatch.
 *
 * NÃO é blindagem completa — campos arbitrários ainda podem conter PII.
 * Use estruturas controladas (objetos com chaves conhecidas) em vez de
 * concatenar dados crus na mensagem.
 */

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Chaves que sempre são mascaradas em qualquer profundidade.
const SENSITIVE_KEYS = new Set([
  'password',
  'senha',
  'newpassword',
  'currentpassword',
  'token',
  'jwt',
  'secret',
  'totpsecret',
  'authorization',
  'cookie',
  'set-cookie',
  'apikey',
  'api_key',
  'apitoken',
  'cpf',
]);

const EMAIL_REGEX = /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
// JWT = 3 segmentos base64url separados por `.`. Min 10 chars cada pra
// reduzir falso-positivo com versões tipo "1.2.3".
const JWT_REGEX = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
// CPF com ou sem pontuação.
const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

const redactString = (s: string): string =>
  s.replace(EMAIL_REGEX, '***@$2').replace(JWT_REGEX, '***JWT***').replace(CPF_REGEX, '***CPF***');

/**
 * Profundidade máxima da recursão pra evitar stack overflow em estruturas
 * circulares ou muito profundas. Estruturas além disso são representadas
 * como `'[Object]'`.
 */
const MAX_DEPTH = 6;

const redactPII = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  if (depth > MAX_DEPTH) return '[Truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactPII(item, depth + 1, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '***REDACTED***';
      } else {
        out[k] = redactPII(v, depth + 1, seen);
      }
    }
    return out;
  }
  return value;
};

const redactAll = (args: unknown[]): unknown[] => (isProd ? args.map((a) => redactPII(a)) : args);

export const logger = {
  debug: (...args: unknown[]) => {
    if (isProd) return;
    console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (isTest) return;
    console.log(...redactAll(args));
  },
  warn: (...args: unknown[]) => {
    console.warn(...redactAll(args));
  },
  error: (...args: unknown[]) => {
    console.error(...redactAll(args));
  },
};

// Exportado pra teste e pra eventual uso direto fora do logger
// (ex.: middleware de error que quer só sanitizar antes de enviar a
// telemetria externa).
export { redactPII };
