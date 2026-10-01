import { describe, expect, it } from 'vitest';
import {
  aplicarDecisaoEscala,
  decidirEscala,
  sinalLpa,
  sinalVizinho,
} from '@/services/analiseAtivos/regras/acoes/escalaDeclarada';
import { P } from '@/services/analiseAtivos/regras/acoes/__tests__/helpers';

// PDTC3 (dev): DFP 2023 MIL (ativo ~ R$ 420 mi, PL 152,5 mi); DFP 2024 declarado UNIDADE com PL
// 121.931 e lucro −27.838; LPA publicado −0,3503; 79,47 mi de ações
const DFP2023 = { ativoTotal: 420_000_000, pl: 152_540_000 };
const DFP2024 = { ativoTotal: 402_000, pl: 121_931 };

describe('escala declarada errada', () => {
  it('PDTC3 2024: balanço ~1000× menor que o de 2023 e LPA ≈ 1000 ⇒ corrige ×1000', () => {
    const sv = sinalVizinho(DFP2024, DFP2023);
    const sl = sinalLpa(-27_838, -0.3503, 79_469_626, P);
    expect(sv).toBe(1000);
    expect(sl).toBe(1000);
    expect(decidirEscala(sv, sl, 'UNIDADE')).toEqual({ fator: 1000, flag: 'escala_corrigida' });
    expect(decidirEscala(sv, null, 'UNIDADE')).toEqual({ fator: 1000, flag: 'escala_corrigida' });
  });

  it('mesma escala (crescimento real) ⇒ nada; LPA ≈ 1000 com vizinho OK é só o LPA (regra 11)', () => {
    expect(sinalVizinho({ ativoTotal: 1.5e9, pl: 6e8 }, { ativoTotal: 1e9, pl: 5e8 })).toBe(1);
    expect(decidirEscala(1, 1000, 'MIL')).toEqual({ fator: 1, flag: null });
  });

  it('LPA coerente vence o vizinho (o vizinho é que está errado); sinais opostos ⇒ ambígua', () => {
    expect(decidirEscala(1000, 1, 'UNIDADE')).toEqual({ fator: 1, flag: null });
    expect(decidirEscala(1000, 0.001, 'UNIDADE')).toEqual({ fator: 1, flag: 'escala_ambigua' });
    expect(decidirEscala(null, 1000, 'MIL')).toEqual({ fator: 1, flag: 'escala_ambigua' });
    expect(decidirEscala(null, null, 'MIL')).toEqual({ fator: 1, flag: null });
  });

  it('declarado MIL com valores em unidades (1000× maior) ⇒ fator 0,001; PL contraditório ⇒ inconclusivo', () => {
    expect(sinalVizinho({ ativoTotal: 4.2e11, pl: 1.5e11 }, DFP2023)).toBe(0.001);
    expect(sinalVizinho({ ativoTotal: 402_000, pl: 150_000_000 }, DFP2023)).toBeNull();
  });

  it('aplicarDecisaoEscala multiplica os valores monetários, não o LPA, e marca a flag', () => {
    const f = {
      receita: 298_759,
      lucroBruto: null,
      ebit: null,
      depreciacaoAmortizacao: null,
      lucroLiquido: -27_838,
      lucroAtribuivel: null,
      ativoTotal: 402_000,
      ativoCirculante: null,
      passivoCirculante: null,
      caixa: null,
      aplicacoesFinanceiras: null,
      dividaBrutaCp: null,
      dividaBrutaLp: null,
      pl: 121_931,
      plControladora: null,
      fco: null,
      fci: null,
      fcf: null,
      capex: null,
      dividendosJcpPagos: null,
      dmplDeclarado: null,
      lpaOn: -0.3503,
      flags: [],
    };
    const r = aplicarDecisaoEscala(f, { fator: 1000, flag: 'escala_corrigida' });
    expect(r.receita).toBe(298_759_000);
    expect(r.pl).toBe(121_931_000);
    expect(r.lpaOn).toBe(-0.3503);
    expect(r.flags).toEqual(['escala_corrigida']);
    expect(aplicarDecisaoEscala(f, { fator: 1, flag: null })).toBe(f);
  });

  it('VAMOS3 2019 (MIL, correto) contra o DFP 2018 declarado UNIDADE em milhares, sem ações conhecidas ⇒ não mexe', () => {
    const sv = sinalVizinho(
      { ativoTotal: 3_053_849_000, pl: 490_754_000 },
      { ativoTotal: 2_023_432, pl: 581_483 },
    );
    expect(sv).toBe(0.001);
    expect(decidirEscala(sv, null, 'MIL')).toEqual({ fator: 1, flag: null });
    // MIL declarado nunca é "corrigido para cima"
    expect(decidirEscala(1000, null, 'MIL')).toEqual({ fator: 1, flag: null });
  });
});
