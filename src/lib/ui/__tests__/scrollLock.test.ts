// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { lockBodyScroll } from '../scrollLock';

beforeEach(() => {
  document.body.style.overflow = '';
});

describe('lockBodyScroll', () => {
  it('aplica hidden e restaura o overflow anterior no release', () => {
    document.body.style.overflow = 'scroll';
    const release = lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    release();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('locks aninhados só liberam no último release', () => {
    const a = lockBodyScroll();
    const b = lockBodyScroll();
    a();
    expect(document.body.style.overflow).toBe('hidden');
    b();
    expect(document.body.style.overflow).toBe('');
  });

  it('release duplicado é idempotente e não deixa o contador negativo', () => {
    const a = lockBodyScroll();
    a();
    a();
    const b = lockBodyScroll();
    const c = lockBodyScroll();
    b();
    b();
    expect(document.body.style.overflow).toBe('hidden');
    c();
    expect(document.body.style.overflow).toBe('');
  });
});
