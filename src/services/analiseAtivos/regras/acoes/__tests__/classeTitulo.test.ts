import { describe, expect, it } from 'vitest';
import {
  classeDoTicker,
  parseComposicaoUnit,
} from '@/services/analiseAtivos/regras/acoes/classeTitulo';

describe('classeDoTicker (regra 18: sufixo manda, não o FCA)', () => {
  it('MGLU3 vem como "Ações Preferenciais" no FCA 2026, mas é ON pelo sufixo', () => {
    expect(classeDoTicker('MGLU3')).toBe('ON');
  });

  it('4–8 = PN, 11 = UNIT, 3 = ON', () => {
    expect(classeDoTicker('PETR4')).toBe('PN');
    expect(classeDoTicker('CPLE6')).toBe('PN');
    expect(classeDoTicker('TAEE11')).toBe('UNIT');
    expect(classeDoTicker('WEGE3')).toBe('ON');
  });

  it('sufixos fora do padrão de ações (BDR 34, direitos 1/2/9, recibos 10) ⇒ null', () => {
    expect(classeDoTicker('AAPL34')).toBeNull();
    expect(classeDoTicker('ABCD1')).toBeNull();
    expect(classeDoTicker('ABCD9')).toBeNull();
    expect(classeDoTicker('ABCD10')).toBeNull();
    expect(classeDoTicker('XX3')).toBeNull();
  });
});

describe('parseComposicaoUnit (texto livre do FCA)', () => {
  it("TAEE11 '1 ON / 2 PN' (FCA 2026) ⇒ {on:1, pn:2}", () => {
    expect(parseComposicaoUnit('1 ON / 2 PN')).toEqual({ on: 1, pn: 2 });
  });

  it("KLBN11 '1 KLBN3 + 4 KLBN4' (FCA 2026) ⇒ {on:1, pn:4}", () => {
    expect(parseComposicaoUnit('1 KLBN3 + 4 KLBN4')).toEqual({ on: 1, pn: 4 });
  });

  it('formatos por extenso medidos na Fase A', () => {
    expect(parseComposicaoUnit('1 ação ordinária e 4 ações preferenciais')).toEqual({
      on: 1,
      pn: 4,
    });
    expect(parseComposicaoUnit('1 ON e 2PNs')).toEqual({ on: 1, pn: 2 });
    expect(parseComposicaoUnit('2 ações ordinárias')).toEqual({ on: 2, pn: 0 });
  });

  it('sem formato reconhecível ⇒ null (vira alerta unit_sem_composicao na ingestão)', () => {
    expect(parseComposicaoUnit('')).toBeNull();
    expect(parseComposicaoUnit(null)).toBeNull();
    expect(parseComposicaoUnit('conforme estatuto social')).toBeNull();
  });
});
