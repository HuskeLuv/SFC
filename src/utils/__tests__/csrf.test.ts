import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { generateCsrfToken, validateCsrfToken, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../csrf';

function createRequestWithCsrf(cookieToken?: string, headerToken?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (headerToken !== undefined) {
    headers[CSRF_HEADER_NAME] = headerToken;
  }

  const req = new NextRequest(new URL('http://localhost:3000/api/test'), {
    method: 'POST',
    headers,
  });

  if (cookieToken !== undefined) {
    req.cookies.set(CSRF_COOKIE_NAME, cookieToken);
  }

  return req;
}

describe('generateCsrfToken', () => {
  it('should return a hex string of 64 characters (32 bytes)', () => {
    const token = generateCsrfToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should generate unique tokens on each call', () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateCsrfToken()));
    expect(tokens.size).toBe(10);
  });
});

describe('validateCsrfToken', () => {
  it('should return true when header matches cookie', () => {
    const token = generateCsrfToken();
    const req = createRequestWithCsrf(token, token);
    expect(validateCsrfToken(req)).toBe(true);
  });

  it('should return false when header is missing', () => {
    const token = generateCsrfToken();
    const req = createRequestWithCsrf(token, undefined);
    expect(validateCsrfToken(req)).toBe(false);
  });

  it('should return false when cookie is missing', () => {
    const token = generateCsrfToken();
    const req = createRequestWithCsrf(undefined, token);
    expect(validateCsrfToken(req)).toBe(false);
  });

  it('should return false when both are missing', () => {
    const req = createRequestWithCsrf(undefined, undefined);
    expect(validateCsrfToken(req)).toBe(false);
  });

  it('should return false when tokens do not match', () => {
    const req = createRequestWithCsrf(generateCsrfToken(), generateCsrfToken());
    expect(validateCsrfToken(req)).toBe(false);
  });

  it('should return false when tokens differ in length', () => {
    const req = createRequestWithCsrf('abcd', 'abcdef');
    expect(validateCsrfToken(req)).toBe(false);
  });

  it('should perform constant-time comparison (no early exit on first mismatch)', () => {
    // We can only verify correctness, not timing — but ensure partial matches still fail
    const token = 'a'.repeat(64);
    const almostToken = 'a'.repeat(63) + 'b';
    const req = createRequestWithCsrf(token, almostToken);
    expect(validateCsrfToken(req)).toBe(false);
  });
});
