import { describe, expect, it } from 'vitest';
import { ehLayoutFinanceiro } from '@/services/analiseAtivos/regras/acoes/layoutFinanceiro';
import { CNPJ, filtrar, lerFixture } from '@/services/analiseAtivos/regras/acoes/__tests__/helpers';

describe('ehLayoutFinanceiro (DRE de banco/seguradora)', () => {
  const fin = lerFixture('dre_financeiras.csv');
  const wege = lerFixture('dre_wege_petr_2024.csv');

  it('BBAS3 2024: "Receitas de Intermediação Financeira" em con e ind ⇒ true', () => {
    expect(ehLayoutFinanceiro(filtrar(fin, { cnpj: CNPJ.BBAS3, escopo: 'con' }))).toBe(true);
    expect(ehLayoutFinanceiro(filtrar(fin, { cnpj: CNPJ.BBAS3, escopo: 'ind' }))).toBe(true);
  });

  it('BBSE3 2025: layout de seguradora ("Receitas das Atividades Seguradoras") ⇒ true', () => {
    expect(ehLayoutFinanceiro(filtrar(fin, { cnpj: CNPJ.BBSE3 }))).toBe(true);
  });

  it('WEGE3, PETR4, ITSA4 (holding com "Receita de Venda") e KLBN11 ⇒ false', () => {
    expect(ehLayoutFinanceiro(filtrar(wege, { cnpj: CNPJ.WEGE3 }))).toBe(false);
    expect(ehLayoutFinanceiro(filtrar(wege, { cnpj: CNPJ.PETR4 }))).toBe(false);
    expect(ehLayoutFinanceiro(filtrar(fin, { cnpj: CNPJ.ITSA4 }))).toBe(false);
    expect(ehLayoutFinanceiro(filtrar(fin, { cnpj: CNPJ.KLBN11 }))).toBe(false);
  });

  it('sem DRE ⇒ false', () => {
    expect(ehLayoutFinanceiro([])).toBe(false);
  });
});
