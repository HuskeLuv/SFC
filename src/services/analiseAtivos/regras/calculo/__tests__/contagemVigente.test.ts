/**
 * Nº de ações vigente (P/L, P/VP e valor de mercado) — casos reais do backtest de 18/10/2026
 * (itens A6, A7 e A8). Contagens, eventos e cotações = produção (somente leitura).
 */
import { describe, expect, it } from 'vitest';
import { SCORING_PARAMS_V2 } from '@/services/analiseAtivos/params/scoringParamsV2';
import {
  fatorEquivalencia,
  valorMercadoDoTicker,
} from '@/services/analiseAtivos/calculo/recalcularDerivados';
import {
  acoesNegociadasDia,
  contagemVigente,
  eventoRefletidoNaContagem,
  FLAG_ALERTA_DESMENTIDA,
  FLAG_ESCALA_VOLUME,
  FLAG_EVENTO_POSTERIOR,
  type EventoParaContagem,
} from '@/services/analiseAtivos/regras/calculo/contagemVigente';
import { verificarEventosCorporativos } from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import type {
  ContagemAcoes,
  EventoCorporativoBruto,
  TickerAcao,
} from '@/services/analiseAtivos/tipos';
import fixture from './fixtures/backtest-out2026-eventos.json';

const P = SCORING_PARAMS_V2;
const DATA_REF = '2026-10-16';
type Caso = (typeof fixture.acoes)['ORVR3'];

function vigente(c: Caso, eventos?: EventoParaContagem[]) {
  const ticker = c.ticker as TickerAcao;
  const evs =
    eventos ??
    verificarEventosCorporativos(
      c.brutos as EventoCorporativoBruto[],
      c.contagens as ContagemAcoes[],
      P,
      undefined,
      ticker.symbol,
      { pregoes: c.pregoes },
    );
  return contagemVigente(
    {
      contagens: c.contagens as ContagemAcoes[],
      eventos: evs,
      dataRef: DATA_REF,
      acoesNegociadasDia: acoesNegociadasDia(c.resumo, fatorEquivalencia(ticker)),
    },
    P,
  );
}

/** P/L e P/VP ∝ nº de ações (LPA = lucro ÷ ações): o múltiplo de prod × razão das contagens. */
const escalar = (x: number, de: number, para: number) => (x * para) / de;

describe('A6 — desdobramento/grupamento depois da última contagem', () => {
  it('ORVR3 ×4 em 11/08/2026 sobre os 137,3 mi de 30/06: 549,3 mi (B3 549.296.404); P/L 54,6 → 218,6', () => {
    const c = fixture.acoes.ORVR3;
    const v = vigente(c);
    expect(v.contagem?.data).toBe('2026-06-30');
    expect(v.fatorEventos).toBe(4);
    expect(v.contagem?.total).toBe(549_296_000);
    expect(v.flags).toContain(FLAG_EVENTO_POSTERIOR);
    expect(escalar(c.prod.pl!, 137_324_000, v.contagem!.total!)).toBeCloseTo(218.6, 1);
    expect(escalar(c.prod.pvp!, 137_324_000, v.contagem!.total!)).toBeCloseTo(2.26, 2);
    // valor de mercado: R$ 1,66 bi → R$ 10,99 bi
    const t = c.ticker as TickerAcao;
    const vm = valorMercadoDoTicker(t, [t], new Map([[t.symbol, 20]]), v.contagem, 20);
    expect(vm! / 1e9).toBeCloseTo(10.986, 3);
  });

  it('ENJU3 grupamento ×0,1 em 09/10/2026: 205,0 mi → 20,5 mi (B3 20.501.799); P/VP 7,32 → 0,73', () => {
    const c = fixture.acoes.ENJU3;
    const v = vigente(c);
    expect(v.contagem?.total).toBeCloseTo(20_501_700, 0);
    expect(escalar(c.prod.pvp!, 205_017_000, v.contagem!.total!)).toBeCloseTo(0.732, 3);
  });

  it('RCSL3: o grupamento ×0,25 de 05/10/2026 entra; o split ×4 de mar/2026 já está nos 127,3 mi de 30/06', () => {
    const v = vigente(fixture.acoes.RCSL3);
    expect(v.fatorEventos).toBe(0.25);
    expect(v.contagem?.total).toBe(31_822_500);
  });

  it('sem cotação (evento não confirmado) a contagem fica como gravada', () => {
    const c = fixture.acoes.ORVR3;
    const evs = verificarEventosCorporativos(
      c.brutos as EventoCorporativoBruto[],
      c.contagens as ContagemAcoes[],
      P,
      undefined,
      'ORVR3',
    );
    const v = vigente(c, evs);
    expect(v.fatorEventos).toBe(1);
    expect(v.contagem?.total).toBe(137_324_000);
  });

  it('eventoRefletidoNaContagem: jan/fev no DFP anterior (SLCE3), dezembro no ano seguinte (CYRE3), pela cotação', () => {
    const slce = {
      dataEvento: '2026-01-02',
      fator: 2,
      status: 'confirmado',
      anoBase: 2025,
      razaoCvm: 2,
    } as const;
    const em = (data: string, total = 1) => ({ data, total });
    expect(eventoRefletidoNaContagem(slce, em('2025-12-31'))).toBe(true);
    const cyre = {
      dataEvento: '2025-12-30',
      fator: 1.1,
      status: 'confirmado',
      anoBase: 2026,
      razaoCvm: 1.1,
    } as const;
    expect(eventoRefletidoNaContagem(cyre, em('2025-12-31'))).toBe(false);
    expect(eventoRefletidoNaContagem(cyre, em('2026-03-31'))).toBe(true);
    const pelaCotacao = {
      dataEvento: '2026-08-11',
      fator: 4,
      status: 'confirmado',
      anoBase: 2026,
      razaoCvm: null,
    } as const;
    expect(eventoRefletidoNaContagem(pelaCotacao, em('2026-06-30'))).toBe(false);
    expect(eventoRefletidoNaContagem(pelaCotacao, em('2026-09-30'))).toBe(true);
  });

  it('LUPA3 ×0,1 em 14/08/2026 já no ITR de 30/06 (entregue depois): confirmado pela razão e não reaplicado', () => {
    const c = fixture.acoes.LUPA3;
    const evs = verificarEventosCorporativos(
      c.brutos as EventoCorporativoBruto[],
      c.contagens as ContagemAcoes[],
      P,
      undefined,
      'LUPA3',
      { pregoes: c.pregoes },
    );
    const ev = evs.find((e) => e.dataEvento === '2026-08-14');
    expect(ev?.status).toBe('confirmado');
    expect(ev?.razaoCvm).toBeCloseTo(0.1014, 3);
    const v = vigente(c, evs);
    expect(v.fatorEventos).toBe(1);
    expect(v.contagem?.total).toBe(4_731_810);
  });

  it("AZTE3 ×0,1 de 09/07/2026 confirmado pela cotação, mas o ITR de 30/06 ('nao_verificavel') já saltou ≈ ×0,1: não reaplica", () => {
    const c = fixture.acoes.AZTE3;
    const evs = verificarEventosCorporativos(
      c.brutos as EventoCorporativoBruto[],
      c.contagens as ContagemAcoes[],
      P,
      undefined,
      'AZTE3',
      { pregoes: c.pregoes },
    );
    const ev = evs.find((e) => e.dataEvento === '2026-07-09');
    expect(ev).toMatchObject({ status: 'confirmado', razaoCvm: null });
    const ultima = { data: '2026-06-30', total: 40_011_514 };
    expect(eventoRefletidoNaContagem(ev!, ultima, { total: 339_094_779 })).toBe(true);
    expect(eventoRefletidoNaContagem(ev!, ultima, { total: 40_011_514 })).toBe(false);
  });
});

describe("A7 — contagem 'alerta' desmentida pelo LPA", () => {
  it('TEND3: ITR 2T26 com tesouraria errada (57,4 mi, razão LPA 0,455) ⇒ vale o 1T26 (122,6 mi); P/L 2,7 → 5,7', () => {
    const c = fixture.acoes.TEND3;
    const v = vigente(c, fixture.checks.TEND3 as EventoParaContagem[]);
    expect(v.flags).toContain(FLAG_ALERTA_DESMENTIDA);
    expect(v.contagem).toMatchObject({ data: '2026-03-31', total: 122_578_000, status: 'ok' });
    expect(escalar(c.prod.pl!, 57_430_000, v.contagem!.total!)).toBeCloseTo(5.71, 2);
    expect(escalar(c.prod.pvp!, 57_430_000, v.contagem!.total!)).toBeCloseTo(2.15, 2);
  });

  it("'alerta' certa continua valendo: SIMH3 583,8 mi (B3 583.759.291) e MOVI3 401,0 mi", () => {
    const simh = vigente(fixture.acoes.SIMH3, fixture.checks.SIMH3 as EventoParaContagem[]);
    expect(simh.contagem).toMatchObject({ data: '2026-06-30', total: 583_759_291 });
    expect(simh.flags).not.toContain(FLAG_ALERTA_DESMENTIDA);
    const movi = vigente(fixture.acoes.MOVI3, fixture.checks.MOVI3 as EventoParaContagem[]);
    expect(movi.contagem).toMatchObject({ data: '2026-06-30', total: 401_036_278 });
  });
});

describe('A8 — valor de mercado: mesma contagem, unit e escala de milhares', () => {
  it('KLBN11 (só a unit no cadastro): ÷ 5 ações por unit ⇒ R$ 111,5 bi → R$ 22,3 bi', () => {
    const c = fixture.acoes.KLBN11;
    const t = c.ticker as TickerAcao;
    const v = vigente(c, []);
    const preco = c.resumo.closeRaw;
    const vm = valorMercadoDoTicker(t, [t], new Map([[t.symbol, preco]]), v.contagem, preco);
    expect(vm! / 1e9).toBeCloseTo((preco * 6_152_895_333) / 5 / 1e9, 6);
    expect(vm! / 1e9).toBeGreaterThan(22);
    expect(vm! / 1e9).toBeLessThan(23);
  });

  it('INEP3: 54.399 "ações" no ITR e ~62 mil negociadas por dia ⇒ escala de milhares (R$ 65 mil → R$ 65 mi)', () => {
    const c = fixture.acoes.INEP3;
    const v = vigente(c, []);
    expect(v.escala).toBe(1000);
    expect(v.flags).toContain(FLAG_ESCALA_VOLUME);
    expect(v.contagem?.total).toBe(54_399_000);
    const t = c.ticker as TickerAcao;
    const preco = c.resumo.closeRaw;
    const vm = valorMercadoDoTicker(t, [t], new Map([[t.symbol, preco]]), v.contagem, preco);
    expect(vm! / 1e6).toBeGreaterThan(50);
    expect(vm! / 1e6).toBeLessThan(80);
  });

  it('CBAV3: 651.073 "ações" e ~4 mi negociadas por dia ⇒ 651,1 mi (P/VP 0,0014 → 1,45)', () => {
    const c = fixture.acoes.CBAV3;
    const v = vigente(c, []);
    expect(v.escala).toBe(1000);
    expect(v.contagem?.total).toBe(651_073_000);
  });

  it('giro normal não mexe na escala (ORVR3: ~0,3% das ações por dia)', () => {
    expect(vigente(fixture.acoes.ORVR3).escala).toBe(1);
  });
});
