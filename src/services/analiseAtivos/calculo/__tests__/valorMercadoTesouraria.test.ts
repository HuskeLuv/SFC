/**
 * fundamentei-regras (24/10/2026): multiplos.valorMercadoComTesouraria — valor de mercado = Σ classes
 * (preço da classe × ações emitidas da classe INCLUINDO a tesouraria), como o Fundamentei.
 */
import { describe, expect, it } from 'vitest';
import { valorMercadoEmpresa } from '@/services/analiseAtivos/calculo/recalcularDerivados';
import { resolverAcoesExercicio } from '@/services/analiseAtivos/regras/acoes/acoesEmitidas';
import { P } from '@/services/analiseAtivos/regras/acoes/__tests__/helpers';
import type { ContagemAcoes, TickerAcao } from '@/services/analiseAtivos/tipos';

const tickers: TickerAcao[] = [
  { symbol: 'XPTO3', cnpj: '1', classeTitulo: 'ON', unitQtdOn: null, unitQtdPn: null },
  { symbol: 'XPTO4', cnpj: '1', classeTitulo: 'PN', unitQtdOn: null, unitQtdPn: null },
];
const precos = new Map([
  ['XPTO3', 10],
  ['XPTO4', 5],
]);
const cont = (extra: Partial<ContagemAcoes> = {}): ContagemAcoes => ({
  cnpj: '1',
  data: '2025-12-31',
  on: 900,
  pn: 1800,
  total: 2700,
  fonte: 'dfp',
  razaoLpa: 1,
  status: 'ok',
  ...extra,
});

describe('valorMercadoEmpresa com tesouraria', () => {
  it('desligada: ações ex-tesouraria (hoje)', () => {
    const c = cont({ tesourariaOn: 100, tesourariaPn: 200 });
    expect(valorMercadoEmpresa(tickers, precos, c)).toBe(10 * 900 + 5 * 1800);
  });

  it('ligada: soma a tesouraria de cada classe ao preço da própria classe', () => {
    const c = cont({ tesourariaOn: 100, tesourariaPn: 200 });
    expect(valorMercadoEmpresa(tickers, precos, c, true)).toBe(10 * 1000 + 5 * 2000);
  });

  it('ligada sem tesouraria por classe (fonte sem classe ou linha antiga): ex-tesouraria', () => {
    expect(valorMercadoEmpresa(tickers, precos, cont(), true)).toBe(10 * 900 + 5 * 1800);
  });
});

describe('resolverAcoesExercicio leva a tesouraria por classe da composição', () => {
  it('DFP em unidades: on/pn ex-tesouraria + tesouraria ON/PN', () => {
    const r = resolverAcoesExercicio(
      {
        ano: 2025,
        lucroAtribuivel: 2.7e9,
        lucroTotal: 2.7e9,
        lpaOn: 1,
        lpaPn: 1,
        pl: 1e10,
        composicao: { on: 1e9, pn: 2e9, tesOn: 1e8, tesPn: 2e8 },
        freAcoes: null,
        eventos: [],
      },
      P,
    );
    expect(r.fonte).toBe('dfp');
    expect([r.on, r.pn, r.tesouraria, r.tesourariaOn, r.tesourariaPn]).toEqual([
      9e8, 1.8e9, 3e8, 1e8, 2e8,
    ]);
  });
});
