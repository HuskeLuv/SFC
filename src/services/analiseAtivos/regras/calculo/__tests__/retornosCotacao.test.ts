/**
 * A6 (fatia C): função pura retornosCotacao — data-alvo com tolerância de pregões, ajuste por
 * eventos, anualização, máxima ajustada e flags de série curta / evento não confirmado.
 */
import { describe, expect, it } from 'vitest';
import {
  PREGOES_SEM_COTACAO_RECENTE,
  inicioCargaRetornos,
  retornosCotacao,
  subtrairMeses,
  type EventoRetorno,
  type PregaoRetorno,
  type ProventoRetorno,
} from '@/services/analiseAtivos/regras/calculo/retornosCotacao';
import { fatorEventosEntre } from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import { pregoesEntre } from '@/services/analiseAtivos/regras/comum/pregoes';
import { TOLERANCIA_PREGOES_RETORNO } from '@/types/analiseAtivosComplementos';

const ATE = '2026-10-16';
const HOJE = '2026-10-19';

/** Série diária de pregões B3 em [de, ate] com preço dado por função da data. */
function serie(de: string, ate: string, preco: (d: string) => number): PregaoRetorno[] {
  return pregoesEntre(de, ate).map((date) => ({ date, closeRaw: preco(date) }));
}

const constante = (v: number) => () => v;

function calc(
  pregoes: PregaoRetorno[],
  eventos: EventoRetorno[] = [],
  classe: 'acao' | 'fii' = 'acao',
) {
  const r = retornosCotacao({ symbol: 'TEST3', classe, pregoes, eventos, hoje: HOJE });
  if (!r) throw new Error('sem resultado');
  return r;
}

describe('subtrairMeses / inicioCargaRetornos', () => {
  it('limita o dia ao fim do mês e cruza o ano', () => {
    expect(subtrairMeses('2026-03-31', 1)).toBe('2026-02-28');
    expect(subtrairMeses('2024-03-31', 1)).toBe('2024-02-29');
    expect(subtrairMeses('2026-01-15', 1)).toBe('2025-12-15');
    expect(subtrairMeses('2026-10-16', 120)).toBe('2016-10-16');
  });

  it('carga desde jan/2015 (máxima) ou antes, se o alvo do 10a for anterior', () => {
    expect(inicioCargaRetornos('2026-10-19')).toBe('2015-01-01');
    expect(inicioCargaRetornos('2030-06-10')).toBe('2015-01-01');
    expect(inicioCargaRetornos('2024-06-10')).toBe('2014-05-10');
  });
});

describe('retornosCotacao', () => {
  it('sem pregão válido ⇒ null', () => {
    expect(
      retornosCotacao({ symbol: 'X', classe: 'acao', pregoes: [], eventos: [], hoje: HOJE }),
    ).toBeNull();
    expect(
      retornosCotacao({
        symbol: 'X',
        classe: 'acao',
        pregoes: [{ date: ATE, closeRaw: 0 }],
        eventos: [],
        hoje: HOJE,
      }),
    ).toBeNull();
  });

  it('janelas simples e anualização de 5a e 10a', () => {
    // 100 até o alvo do 10a, 150 até o 5a, 180 até o 12m, 190 até o 1m, 200 no fim
    const p = serie('2015-01-02', ATE, (d) =>
      d <= '2016-10-16'
        ? 100
        : d <= '2021-10-16'
          ? 150
          : d <= '2025-10-16'
            ? 180
            : d <= '2026-09-16'
              ? 190
              : 200,
    );
    const r = calc(p);
    expect(r.asOf).toBe(ATE);
    expect(r.preco).toBe(200);
    expect(r.ret1mPct).toBeCloseTo((200 / 190 - 1) * 100, 10);
    expect(r.ret12mPct).toBeCloseTo((200 / 180 - 1) * 100, 10);
    expect(r.ret5aAaPct).toBeCloseTo((Math.pow(200 / 150, 1 / 5) - 1) * 100, 10);
    expect(r.ret10aAaPct).toBeCloseTo((Math.pow(200 / 100, 1 / 10) - 1) * 100, 10);
    expect(r.flags).toEqual([]);
    expect(r.inicioSerie).toBe('2015-01-02');
    expect(r.pregoes).toBe(p.length);
  });

  it('desdobramento 1:10 confirmado não gera salto (série ajustada)', () => {
    // preço 100 → 10 no dia do desdobramento, mesmo patamar ajustado
    const p = serie('2015-01-02', ATE, (d) => (d < '2020-03-02' ? 100 : 10));
    const ev: EventoRetorno[] = [{ dataEvento: '2020-03-02', fator: 10, status: 'confirmado' }];
    const r = calc(p, ev);
    expect(r.ret10aAaPct).toBeCloseTo(0, 10);
    expect(r.ret5aAaPct).toBeCloseTo(0, 10);
    expect(r.distMaxPct).toBeCloseTo(0, 10);
    expect(r.precoMaxAjustado).toBeCloseTo(10, 10);
    // sem o evento seria −90% em 10 anos
    const semEvento = calc(p, []);
    expect(semEvento.ret10aAaPct).toBeLessThan(-20);
  });

  it('grupamento 10:1 confirmado (fator 0,1) não gera salto', () => {
    const p = serie('2015-01-02', ATE, (d) => (d < '2022-05-02' ? 1 : 10));
    const ev: EventoRetorno[] = [{ dataEvento: '2022-05-02', fator: 0.1, status: 'confirmado' }];
    const r = calc(p, ev);
    expect(r.ret10aAaPct).toBeCloseTo(0, 10);
    expect(r.ret5aAaPct).toBeCloseTo(0, 10);
    expect(r.distMaxPct).toBeCloseTo(0, 10);
  });

  it('o ajuste é o fatorEventosEntre(dataBase, último pregão)', () => {
    const p = serie('2015-01-02', ATE, (d) => (d < '2018-04-25' ? 52 : d < '2021-04-28' ? 40 : 30));
    const ev: EventoRetorno[] = [
      { dataEvento: '2018-04-25', fator: 1.3, status: 'confirmado' },
      { dataEvento: '2021-04-28', fator: 2, status: 'confirmado' },
      { dataEvento: '2014-04-24', fator: 1.3, status: 'nao_validavel' },
      { dataEvento: '2019-01-10', fator: 5, status: 'descartado' },
    ];
    const r = calc(p, ev);
    const base10a = p.filter((x) => x.date <= '2016-10-16').at(-1)!;
    const esperado = 30 / (base10a.closeRaw / fatorEventosEntre(ev, base10a.date, ATE)) - 1;
    expect(r.ret10aAaPct).toBeCloseTo((Math.pow(1 + esperado, 0.1) - 1) * 100, 10);
    // evento pendente ANTES do período (2014) e o descartado não marcam nada
    expect(r.flags).toEqual([]);
  });

  it('FII: desdobramento de cotas (cvm_cotas, data ex real) ajusta a cota como na ação', () => {
    // HGLG11 2018: 1.300 → 130 com fator 10 (status confirmado)
    const p = serie('2015-01-02', ATE, (d) => (d < '2018-04-18' ? 1300 : 160));
    const ev: EventoRetorno[] = [{ dataEvento: '2018-04-18', fator: 10, status: 'confirmado' }];
    const r = calc(p, ev, 'fii');
    expect(r.classe).toBe('fii');
    expect(r.ret10aAaPct).toBeCloseTo((Math.pow(160 / 130, 0.1) - 1) * 100, 10);
    // emissão/recompra também ajusta série (eventoAjustaSerie)
    const r2 = calc(
      p,
      [{ dataEvento: '2018-04-18', fator: 10, status: 'emissao_recompra' }],
      'fii',
    );
    expect(r2.ret10aAaPct).toBeCloseTo(r.ret10aAaPct!, 10);
  });

  it('série de 9 anos e 11 meses ⇒ 10a sem dado (serie_curta_10a), 5a com dado', () => {
    const inicio = subtrairMeses(ATE, 119);
    const r = calc(serie(inicio, ATE, constante(50)));
    expect(r.ret10aAaPct).toBeNull();
    expect(r.flags).toContain('serie_curta_10a');
    expect(r.ret5aAaPct).toBeCloseTo(0, 10);
    expect(r.flags).not.toContain('serie_curta_5a');
  });

  it(`tolerância de ${TOLERANCIA_PREGOES_RETORNO} pregões antes da data-alvo`, () => {
    const alvo = subtrairMeses(ATE, 12); // 2025-10-16 (quinta)
    const todos = serie('2015-01-02', ATE, constante(10));
    const antesDoAlvo = pregoesEntre('2025-09-01', alvo);
    // lacuna de exatamente 5 pregões: último pregão ≤ alvo está 5 pregões antes
    const corte5 = antesDoAlvo[antesDoAlvo.length - 1 - TOLERANCIA_PREGOES_RETORNO];
    const com5 = todos.filter((p) => p.date <= corte5 || p.date > alvo);
    expect(calc(com5).ret12mPct).toBeCloseTo(0, 10);
    // 6 pregões: fora da tolerância ⇒ sem dado
    const corte6 = antesDoAlvo[antesDoAlvo.length - 2 - TOLERANCIA_PREGOES_RETORNO];
    const com6 = todos.filter((p) => p.date <= corte6 || p.date > alvo);
    const r6 = calc(com6);
    expect(r6.ret12mPct).toBeNull();
    expect(r6.flags).toContain('serie_curta_12m');
  });

  it('alvo em fim de semana usa o pregão anterior (sexta) sem gastar tolerância', () => {
    // último pregão 19/10/2026 (segunda) ⇒ alvo do 1m 19/09 (sábado) ⇒ base = 18/09 (sexta)
    const p = serie('2025-01-02', '2026-10-19', (d) => (d <= '2026-09-18' ? 100 : 110));
    const r = retornosCotacao({
      symbol: 'X',
      classe: 'acao',
      pregoes: p,
      eventos: [],
      hoje: HOJE,
    })!;
    expect(r.ret1mPct).toBeCloseTo(10, 10);
  });

  it('máxima no último pregão ⇒ distância 0 com a data do último pregão', () => {
    const p = serie('2015-01-02', ATE, (d) => (d === ATE ? 99 : 50));
    const r = calc(p);
    expect(r.distMaxPct).toBe(0);
    expect(r.dataMax).toBe(ATE);
    expect(r.precoMaxAjustado).toBe(99);
  });

  it('distância da máxima negativa, com a data da máxima', () => {
    const p = serie('2015-01-02', ATE, (d) => (d === '2020-01-28' ? 200 : 150));
    const r = calc(p);
    expect(r.distMaxPct).toBeCloseTo(-25, 10);
    expect(r.dataMax).toBe('2020-01-28');
  });

  it('evento pendente no período esconde 12m/5a/10a e a máxima (1m segue)', () => {
    const p = serie('2015-01-02', ATE, constante(20));
    const ev: EventoRetorno[] = [{ dataEvento: '2023-03-01', fator: 2, status: 'nao_validavel' }];
    const r = calc(p, ev);
    expect(r.flags).toContain('evento_nao_confirmado');
    expect(r.ret12mPct).toBeNull();
    expect(r.ret5aAaPct).toBeNull();
    expect(r.ret10aAaPct).toBeNull();
    expect(r.distMaxPct).toBeNull();
    expect(r.precoMaxAjustado).toBeNull();
    expect(r.ret1mPct).toBeCloseTo(0, 10);
    // as janelas escondidas pelo evento NÃO são marcadas como série curta
    expect(r.flags.filter((f) => f.startsWith('serie_curta'))).toEqual([]);
  });

  it('evento pendente no último mês esconde o 1m também', () => {
    const p = serie('2015-01-02', ATE, constante(20));
    const r = calc(p, [{ dataEvento: '2026-10-05', fator: 2, status: 'nao_validavel' }]);
    expect(r.ret1mPct).toBeNull();
    expect(r.flags).toEqual(['evento_nao_confirmado']);
  });

  it('último pregão antigo ⇒ sem_cotacao_recente (números até o último pregão)', () => {
    const p = serie('2015-01-02', '2026-08-31', constante(20));
    const r = calc(p);
    expect(r.asOf).toBe('2026-08-31');
    expect(r.flags).toContain('sem_cotacao_recente');
    expect(r.ret12mPct).toBeCloseTo(0, 10);
    // até PREGOES_SEM_COTACAO_RECENTE pregões não marca
    const recente = pregoesEntre('2026-09-20', HOJE);
    const fim = recente[recente.length - 1 - PREGOES_SEM_COTACAO_RECENTE];
    expect(calc(serie('2015-01-02', fim, constante(20))).flags).not.toContain(
      'sem_cotacao_recente',
    );
  });

  it('flags na ordem de FLAGS_RETORNO', () => {
    const r = calc(serie('2026-01-05', '2026-08-31', constante(5)));
    expect(r.flags).toEqual([
      'serie_curta_12m',
      'serie_curta_5a',
      'serie_curta_10a',
      'sem_cotacao_recente',
    ]);
  });
});

describe('retorno total (proventos reinvestidos na data-ex, igual ao Fundamentei)', () => {
  const total = (
    pregoes: PregaoRetorno[],
    proventos: ProventoRetorno[],
    eventos: EventoRetorno[] = [],
  ) => {
    const r = retornosCotacao({
      symbol: 'TEST3',
      classe: 'acao',
      pregoes,
      eventos,
      proventos,
      hoje: HOJE,
    });
    if (!r) throw new Error('sem resultado');
    return r;
  };

  it('preço que cai exatamente o provento na data-ex ⇒ retorno total zero (não perda)', () => {
    // 100 até a véspera da data-ex (2026-06-01), 98 depois: provento de 2
    const p = serie('2015-01-02', ATE, (d) => (d < '2026-06-01' ? 100 : 98));
    const r = total(p, [{ dataEx: '2026-06-01', valor: 2 }]);
    expect(r.ret12mPct).toBeCloseTo(0, 10);
    expect(r.ret1mPct).toBeCloseTo(0, 10);
    // sem os proventos (como era): −2%
    expect(calc(p).ret12mPct).toBeCloseTo(-2, 10);
    // a máxima também é ajustada: 100 × 0,98 = 98 = preço atual ⇒ distância 0
    expect(r.distMaxPct).toBeCloseTo(0, 10);
  });

  it('dois proventos compõem; provento fora da janela não entra no 1m', () => {
    const p = serie('2015-01-02', ATE, constante(50));
    const r = total(p, [
      { dataEx: '2026-03-02', valor: 1 },
      { dataEx: '2026-09-01', valor: 0.5 },
    ]);
    expect(r.ret12mPct).toBeCloseTo((1 / ((1 - 1 / 50) * (1 - 0.5 / 50)) - 1) * 100, 10);
    expect(r.ret1mPct).toBeCloseTo(0, 10);
  });

  it('com desdobramento 1:2 no meio: provento cru da época ÷ fechamento cru da época', () => {
    // 100 cru antes do desdobramento (2026-03-02), 50 depois; provento de 2 em jan (base antiga)
    const p = serie('2015-01-02', ATE, (d) => (d < '2026-03-02' ? 100 : 50));
    const ev: EventoRetorno[] = [{ dataEvento: '2026-03-02', fator: 2, status: 'confirmado' }];
    const r = total(p, [{ dataEx: '2026-01-05', valor: 2 }], ev);
    expect(r.ret12mPct).toBeCloseTo((50 / ((100 / 2) * 0.98) - 1) * 100, 10);
  });

  it('provento futuro, sem pregão anterior ou acima de 50% do preço fica fora', () => {
    const p = serie('2015-01-02', ATE, constante(10));
    const r = total(p, [
      { dataEx: '2026-12-01', valor: 1 },
      { dataEx: '2014-06-02', valor: 1 },
      { dataEx: '2026-06-01', valor: 6 },
    ]);
    expect(r.ret12mPct).toBeCloseTo(0, 10);
  });
});
