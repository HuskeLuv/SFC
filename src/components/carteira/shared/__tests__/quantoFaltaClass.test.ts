import { describe, it, expect } from 'vitest';
import { quantoFaltaClass, quantoFaltaMobile, quantoFaltaMobileClass } from '../quantoFaltaClass';

describe('quantoFaltaClass (cores da coluna Quanto Falta, 16/09/2026)', () => {
  it('azul de 1% para cima', () => {
    expect(quantoFaltaClass(1)).toContain('#0079F2');
    expect(quantoFaltaClass(12.5)).toContain('#0079F2');
  });

  it('âmbar entre 0% e 1% (0,1% a 0,99%)', () => {
    expect(quantoFaltaClass(0.1)).toContain('amber');
    expect(quantoFaltaClass(0.99)).toContain('amber');
    expect(quantoFaltaClass(0.01)).toContain('amber');
  });

  it('vermelho abaixo de 0%', () => {
    expect(quantoFaltaClass(-0.01)).toContain('red');
    expect(quantoFaltaClass(-40)).toContain('red');
  });

  it('sem cor no objetivo exato ou valor inválido', () => {
    expect(quantoFaltaClass(0)).toBe('');
    expect(quantoFaltaClass(null)).toBe('');
    expect(quantoFaltaClass(Number.NaN)).toBe('');
  });
});

describe('quantoFaltaMobile (pílula do celular, PWA fase 1)', () => {
  it('≥ 1%: Falta, texto da paleta e ponto #0079F2 (não textual)', () => {
    const r = quantoFaltaMobile(12.5);
    expect(r.label).toBe('Falta');
    expect(r.tone).toBe('falta');
    expect(r.textClass).toBe('text-mf-patrimonio dark:text-mf-tranquilidade');
    expect(r.textClass).not.toContain('#0079F2');
    expect(r.dotClass).toBe('bg-[#0079F2]');
  });

  it('entre 0 e 1%: Falta em âmbar-700 (AA), ponto âmbar', () => {
    const r = quantoFaltaMobile(0.5);
    expect(r).toMatchObject({ label: 'Falta', tone: 'quase' });
    expect(r.textClass).toContain('#B45309');
    expect(r.dotClass).toContain('#D97706');
  });

  it('< 0: Acima no vermelho semântico', () => {
    const r = quantoFaltaMobile(-3);
    expect(r).toMatchObject({ label: 'Acima', tone: 'acima' });
    expect(r.textClass).toBe('text-[#D92D20] dark:text-[#F97066]');
  });

  it('0 (e o que arredonda para 0,00): No objetivo, neutro', () => {
    expect(quantoFaltaMobile(0)).toMatchObject({ label: 'No objetivo', tone: 'ok' });
    expect(quantoFaltaMobile(0.004)).toMatchObject({ label: 'No objetivo', tone: 'ok' });
    expect(quantoFaltaMobile(-0.004).label).toBe('No objetivo');
  });

  it('ausente: traço', () => {
    expect(quantoFaltaMobile(null).label).toBe('—');
    expect(quantoFaltaMobile(undefined).label).toBe('—');
    expect(quantoFaltaMobile(Number.NaN).label).toBe('—');
  });

  it('quantoFaltaMobileClass é a mesma função; quantoFaltaClass (desktop) intacta', () => {
    expect(quantoFaltaMobileClass).toBe(quantoFaltaMobile);
    expect(quantoFaltaClass(0.5)).toBe('text-amber-600 dark:text-amber-400');
  });
});
