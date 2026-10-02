/**
 * Trava de plausibilidade do DY 12m (diagnóstico DY absurdo 02/10/2026): teto por classe, salto de
 * provento recente e o DY que entra no Índice MF.
 */
import { describe, expect, it } from 'vitest';
import {
  dyParaIndice,
  ehFlagProventosEmConferencia,
  flagEmConferencia,
  motivoProventosEmConferencia,
  proventosEmConferencia,
  saltoProventoRecente,
} from '@/services/analiseAtivos/regras/calculo/plausibilidadeProventos';
import { ausente, ok } from '@/services/analiseAtivos/regras/comum/valor';
import { P } from './helpers';

const HOJE = '2026-09-29';

describe('teto do DY 12m', () => {
  it('ações: acima de 25% ⇒ dy_acima_teto (BMKS3 34%, HBTS5 795%); 25% ou menos passa', () => {
    const m = (dy: number) =>
      motivoProventosEmConferencia({ classe: 'acao', dyPct: ok(dy), saltoRecente: false }, P);
    expect(m(34.2)).toBe('dy_acima_teto');
    expect(m(795.4)).toBe('dy_acima_teto');
    expect(m(25)).toBeNull();
    expect(m(8.4)).toBeNull();
  });

  it('FIIs: acima de 20% ⇒ dy_acima_teto (LRDI11 42%); 14% passa', () => {
    const m = (dy: number) =>
      motivoProventosEmConferencia({ classe: 'fii', dyPct: ok(dy), saltoRecente: false }, P);
    expect(m(42.2)).toBe('dy_acima_teto');
    expect(m(20.5)).toBe('dy_acima_teto');
    expect(m(14)).toBeNull();
  });

  it('DY ausente/zero não vira "em conferência"; salto com DY > 0 vira', () => {
    expect(
      motivoProventosEmConferencia(
        { classe: 'acao', dyPct: ausente('fonte_defasada'), saltoRecente: true },
        P,
      ),
    ).toBeNull();
    expect(
      motivoProventosEmConferencia({ classe: 'acao', dyPct: ok(0), saltoRecente: true }, P),
    ).toBeNull();
    expect(
      motivoProventosEmConferencia({ classe: 'acao', dyPct: ok(7.3), saltoRecente: true }, P),
    ).toBe('salto_recente');
  });
});

describe('salto de provento recente', () => {
  const serie = (pares: Array<[number, number | null, number?]>) =>
    pares.map(([anoFiscal, dpaAjHoje, payoutDmplPct]) => ({
      anoFiscal,
      dpaAjHoje,
      payoutDmplPct: payoutDmplPct ?? null,
    }));

  it('ITUB4 2025 = 2,5× 2024 sem payout (financeira) ⇒ salto; com payout de 60% (lucro acompanhou) não', () => {
    const porAno = serie([
      [2023, 1.11],
      [2024, 1.86],
      [2025, 4.73],
    ]);
    expect(saltoProventoRecente({ classe: 'acao', porAno, hoje: HOJE }, P)).toBe(true);
    const comLucro = serie([
      [2023, 1.11, 40],
      [2024, 1.86, 45],
      [2025, 4.73, 60],
    ]);
    expect(saltoProventoRecente({ classe: 'acao', porAno: comLucro, hoje: HOJE }, P)).toBe(false);
  });

  it('salto antigo (2023) não contamina o DY de 2026; ano corrente fora da série', () => {
    const porAno = serie([
      [2022, 0.19],
      [2023, 3.0],
      [2024, 0.4],
      [2025, 0.06],
      [2026, 9.9],
    ]);
    expect(saltoProventoRecente({ classe: 'acao', porAno, hoje: HOJE }, P)).toBe(false);
  });

  it('DPA 12m > 2× o do último ano fechado ⇒ salto (payout TTM > 150% ou desconhecido)', () => {
    const porAno = serie([
      [2024, 0.4],
      [2025, 0.5],
    ]);
    const base = { classe: 'acao' as const, porAno, hoje: HOJE };
    expect(saltoProventoRecente({ ...base, dpa12m: 1.2 }, P)).toBe(true);
    expect(saltoProventoRecente({ ...base, dpa12m: 1.2, payoutTtmPct: 300 }, P)).toBe(true);
    expect(saltoProventoRecente({ ...base, dpa12m: 1.2, payoutTtmPct: 80 }, P)).toBe(false);
    expect(saltoProventoRecente({ ...base, dpa12m: 0.9 }, P)).toBe(false);
  });

  it('FII: ano com informe incompleto sai da série (o 1º ano parcial não vira salto)', () => {
    const porAno = serie([
      [2024, 2.0],
      [2025, 13.0],
    ]);
    const parcial = { 2024: 3, 2025: 12 };
    expect(
      saltoProventoRecente({ classe: 'fii', porAno, hoje: HOJE, mesesPorAno: parcial }, P),
    ).toBe(false);
    const cheio = { 2024: 12, 2025: 12 };
    expect(saltoProventoRecente({ classe: 'fii', porAno, hoje: HOJE, mesesPorAno: cheio }, P)).toBe(
      true,
    );
  });
});

describe('DY no Índice e flags de tela', () => {
  it('em conferência ⇒ ausente(em_conferencia) com o motivo no detalhe; senão o próprio DY', () => {
    expect(dyParaIndice(ok(34), 'dy_acima_teto')).toEqual({
      estado: 'ausente',
      motivo: 'em_conferencia',
      detalhe: 'dy_acima_teto',
    });
    expect(dyParaIndice(ok(8), null)).toEqual({ estado: 'ok', valor: 8 });
    expect(dyParaIndice(undefined, null)).toMatchObject({ estado: 'ausente' });
    expect(dyParaIndice(ausente('fonte_defasada'), 'dy_acima_teto')).toMatchObject({
      motivo: 'fonte_defasada',
    });
  });

  it('flags e motivos que põem os proventos em conferência na tela', () => {
    expect(flagEmConferencia('dy_acima_teto')).toBe('proventos_em_conferencia_dy_acima_teto');
    expect(ehFlagProventosEmConferencia('proventos_em_conferencia_salto_recente')).toBe(true);
    expect(ehFlagProventosEmConferencia('provento_suspeito')).toBe(true);
    expect(ehFlagProventosEmConferencia('proventos_defasados_base_parada')).toBe(true);
    expect(ehFlagProventosEmConferencia('lucro_nao_positivo')).toBe(false);
    expect(proventosEmConferencia([], ['div:em_conferencia'])).toBe(true);
    expect(proventosEmConferencia([], ['div:fonte_defasada'])).toBe(true);
    expect(proventosEmConferencia(['cnpj_em_conferencia'], ['preco:historico_curto'])).toBe(false);
  });
});
