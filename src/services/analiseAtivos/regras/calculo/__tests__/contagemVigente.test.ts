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
  FLAG_ALERTA_SEM_LPA_DESTOA,
  FLAG_ESCALA_VOLUME,
  FLAG_EVENTO_POSTERIOR,
  FLAG_PRECO_ANTES_EVENTO,
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

describe('A6 — cotação congelada ANTERIOR ao evento (fora do Quadro, página do ativo)', () => {
  const cont = (
    cnpj: string,
    linhas: Array<[string, number, string, number, ContagemAcoes['status']]>,
  ): ContagemAcoes[] =>
    linhas.map(([data, total, fonte, razaoLpa, status]) => ({
      cnpj,
      data,
      on: total,
      pn: 0,
      total,
      fonte,
      razaoLpa,
      status,
    }));
  // produção, asset_share_counts e asset_quote_resumo (somente leitura, 18/10/2026)
  const AMBP3 = cont('12648266000124', [
    ['2023-12-31', 167_041_869, 'dfp', 0.9999, 'ok'],
    ['2024-12-31', 166_797_769, 'dfp', 0.9973, 'ok'],
    ['2025-03-31', 166_562_769, 'itr', 0.9966, 'ok'],
    ['2025-06-30', 166_684_471, 'itr', 0.9984, 'ok'],
  ]);
  // desdobramento ×10 de 05/08/2025, confirmado pela cotação (razaoCvm nulo, sem ITR depois)
  const evAmbp: EventoParaContagem = {
    dataEvento: '2025-08-05',
    fator: 10,
    status: 'confirmado',
    anoBase: 2025,
    razaoCvm: null,
  };

  it('AMBP3: cotação R$ 130 de 30/12/2024 e ×10 de 05/08/2025 ⇒ o evento não vale para ela: VM 21,7 bi (era 216,7 bi)', () => {
    const base = { contagens: AMBP3, eventos: [evAmbp], dataRef: DATA_REF };
    const semData = contagemVigente(base, P);
    expect(semData.contagem?.total).toBe(1_666_844_710); // o erro: ×10 sobre a cotação antiga
    const v = contagemVigente({ ...base, dataPreco: '2024-12-30' }, P);
    expect(v.fatorEventos).toBe(1);
    expect(v.contagem?.total).toBe(166_684_471);
    expect(v.flags).not.toContain(FLAG_EVENTO_POSTERIOR);
    expect((130 * v.contagem!.total!) / 1e9).toBeCloseTo(21.669, 3);
  });

  it('AMBP3 com cotação depois do evento: continua ×10 (A6 inalterado)', () => {
    const v = contagemVigente(
      { contagens: AMBP3, eventos: [evAmbp], dataRef: DATA_REF, dataPreco: '2026-10-16' },
      P,
    );
    expect(v.fatorEventos).toBe(10);
    expect(v.flags).toContain(FLAG_EVENTO_POSTERIOR);
  });

  it('LUPA3: R$ 1,00 de 30/12/2025 e ×0,1 de 14/08/2026 já no ITR de 30/06 ⇒ desfaz: 47,3 mi ações, VM R$ 47,3 mi (era 4,7 mi)', () => {
    const c = fixture.acoes.LUPA3;
    const evs = verificarEventosCorporativos(
      c.brutos as EventoCorporativoBruto[],
      c.contagens as ContagemAcoes[],
      P,
      undefined,
      'LUPA3',
      { pregoes: c.pregoes },
    );
    const v = contagemVigente(
      {
        contagens: c.contagens as ContagemAcoes[],
        eventos: evs,
        dataRef: DATA_REF,
        dataPreco: '2025-12-30',
      },
      P,
    );
    expect(v.fatorEventos).toBeCloseTo(10, 9);
    expect(v.contagem?.total).toBeCloseTo(47_318_100, 0);
    expect(v.flags).toContain(FLAG_PRECO_ANTES_EVENTO);
    expect((1.0 * v.contagem!.total!) / 1e6).toBeCloseTo(47.3, 1);
  });

  it('AGXY3: R$ 3,63 de 28/12/2023 e grupamento 15:1 de 06/05/2025 já nas contagens ⇒ VM R$ 911,7 mi (era 60,8 mi)', () => {
    const contagens = cont('21240146000184', [
      ['2023-12-31', 167_429_310, 'dfp', 0.9979, 'ok'],
      ['2024-03-31', 167_429_310, 'itr', 1.0023, 'ok'],
      ['2024-06-30', 251_147_897, 'itr', 1.4461, 'alerta'],
      ['2024-09-30', 251_147_897, 'itr', 1.2779, 'alerta'],
      ['2024-12-31', 251_147_897, 'dfp', 1.1945, 'alerta'],
      ['2025-03-31', 16_743_192, 'itr', 0.067, 'alerta'],
      ['2025-06-30', 16_743_193, 'itr', 0.0788, 'alerta'],
      ['2025-09-30', 16_743_193, 'itr', 0.1211, 'alerta'],
    ]);
    const ev: EventoParaContagem = {
      dataEvento: '2025-05-06',
      fator: 0.06666667,
      status: 'confirmado',
      anoBase: 2025,
      razaoCvm: 0.0667,
    };
    const base = { contagens, eventos: [ev], dataRef: DATA_REF };
    expect((3.63 * contagemVigente(base, P).contagem!.total!) / 1e6).toBeCloseTo(60.8, 1);
    const v = contagemVigente({ ...base, dataPreco: '2023-12-28' }, P);
    // o grupamento sai; a emissão de 2024 (167 → 251 mi) não é evento e fica
    expect(v.contagem!.total! / 1e6).toBeCloseTo(251.15, 1);
    expect((3.63 * v.contagem!.total!) / 1e6).toBeCloseTo(911.7, 0);
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

describe("contagem 'alerta' sem LPA para conferir (prejuízo)", () => {
  // CVM (asset_share_counts do CNPJ 33453598000123, base de 18/10/2026); B3 hoje: 10.352.509.484
  const linha = (
    data: string,
    on: number,
    pn: number,
    fonte: string,
    razaoLpa: number,
    status: ContagemAcoes['status'],
  ): ContagemAcoes => ({
    cnpj: '33453598000123',
    data,
    on,
    pn,
    total: on + pn,
    fonte,
    razaoLpa,
    status,
  });
  const RAIZ = [
    linha('2025-03-31', 8_993_572_584, 1_340_673_226, 'dfp', 1.0002, 'ok'),
    linha('2025-06-30', 8_993_572_584, 1_340_673_226, 'itr', -0.99998, 'alerta'),
    linha('2025-09-30', 8_993_572_584, 1_349_543_297, 'itr', 1.0005, 'ok'),
    linha('2025-12-31', 8_993_572_584, 1_349_543_297, 'itr', 1.0004, 'ok'),
    linha('2026-03-31', 8_993_572_584, 1_349_543_297, 'dfp', 1.0003, 'ok'),
    linha('2026-06-30', 4_496_786_292, 51_417_222, 'itr', -0.2244, 'alerta'),
  ];

  it('RAIZ4: ITR 2T26 com 4,55 bi (razão LPA −0,22) contra 10,34 bi do DFP 31/03/2026 ⇒ vale o DFP; VM R$ 1,68 bi → 3,83 bi', () => {
    const v = contagemVigente({ contagens: RAIZ, eventos: [], dataRef: DATA_REF }, P);
    expect(v.contagem?.data).toBe('2026-03-31');
    expect(v.contagem?.total).toBe(10_343_115_881);
    expect(v.flags).toContain(FLAG_ALERTA_SEM_LPA_DESTOA);
    expect((0.37 * v.contagem!.total!) / 1e9).toBeCloseTo(3.827, 3);
  });

  it("'alerta' sem LPA que bate com a 'ok' anterior continua valendo (RAIZ4 2T25)", () => {
    const v = contagemVigente(
      { contagens: RAIZ.slice(0, 2), eventos: [], dataRef: '2025-08-01' },
      P,
    );
    expect(v.contagem?.data).toBe('2025-06-30');
    expect(v.flags).not.toContain(FLAG_ALERTA_SEM_LPA_DESTOA);
  });

  it("'alerta' com LPA positivo não é afetada (ORVR3 follow-on continua valendo)", () => {
    const v = vigente(fixture.acoes.ORVR3);
    expect(v.contagem?.data).toBe('2026-06-30');
    expect(v.flags).not.toContain(FLAG_ALERTA_SEM_LPA_DESTOA);
  });
});
