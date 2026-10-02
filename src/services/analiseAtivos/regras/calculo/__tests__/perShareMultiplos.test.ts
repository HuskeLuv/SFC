/**
 * Per-share, payout, múltiplos anuais/atuais e sequências com os números reais da Fase A
 * (acoes-cvm.md Tabelas A/B, brapi-precos.md §1.3, fiis-cvm.md).
 */
import { describe, expect, it } from 'vitest';
import { verificarEventosCorporativos } from '@/services/analiseAtivos/regras/calculo/eventosCorporativos';
import {
  achatarValores,
  multiplosAnuais,
  multiplosAtuais,
  plContraMedia10a,
  type BaseFundamentos,
} from '@/services/analiseAtivos/regras/calculo/multiplos';
import { perShareAnual, perShareAnualFii } from '@/services/analiseAtivos/regras/calculo/perShare';
import { precoFimDePeriodo } from '@/services/analiseAtivos/regras/calculo/precoFimPeriodo';
import { auditarProventos } from '@/services/analiseAtivos/regras/calculo/proventos';
import {
  anosLucroConsecutivos,
  mesesComRendimentoConsecutivos,
  mesesComRendimentoDetalhado,
} from '@/services/analiseAtivos/regras/calculo/sequencias';
import { ausente, naoSeAplica, ok } from '@/services/analiseAtivos/regras/comum/valor';
import type { CotacaoDia, Valor } from '@/services/analiseAtivos/tipos';
import {
  P,
  P_LEGADO,
  contagensDe,
  empresa,
  eventosBrutos,
  fiiInforme,
  proventosBrutos,
} from './helpers';

const MI = 1e6;
const val = (x: Valor<number> | undefined) => (x && x.estado === 'ok' ? x.valor : NaN);

function ano(ticker: string, a: number) {
  return empresa(ticker).anos[String(a)] as Record<string, number>;
}

function fund(parcial: Partial<BaseFundamentos>): BaseFundamentos {
  return {
    receita: null,
    lucroLiquido: null,
    lucroAtribuivel: null,
    ebit: null,
    depreciacaoAmortizacao: null,
    ativoTotal: null,
    ativoCirculante: null,
    passivoCirculante: null,
    caixa: null,
    aplicacoesFinanceiras: null,
    dividaBrutaCp: null,
    dividaBrutaLp: null,
    pl: null,
    plControladora: null,
    fco: null,
    capex: null,
    naoSeAplica: [],
    flags: [],
    ...parcial,
  };
}

function cot(symbol: string, date: string, closeRaw: number): CotacaoDia {
  return { symbol, date, closeRaw, volumeFin: 0, negocios: 1, codBdi: '02' };
}

describe('per-share (LPA/VPA ajustados a hoje)', () => {
  const eventosWege = verificarEventosCorporativos(eventosBrutos('WEGE3'), contagensDe('WEGE3'), P);

  it('WEGE3 2016: 1.614,4 mi ações ⇒ LPA 0,6923; ajustado a hoje (÷2,6) 0,2663; VPA ajustado 1,4206', () => {
    const a = ano('WEGE3', 2016);
    expect(a.acoes_mi).toBeCloseTo(1614.4, 1);
    const r = perShareAnual(
      {
        anoFiscal: 2016,
        lucroAtribuivel: ok(a.lucroCtrl_mi * MI),
        plControladora: ok(a.plCtrl_mi * MI),
        acoesFim: a.acoes_mi * MI,
        acoesAnterior: null,
        fatorEquivalencia: 1,
        eventos: eventosWege,
        dpaFimDoAno: ok(a.dpaDbDataCom),
        dpaHoje: ok(a.dpaDbDataCom / 2.6),
        dmplDeclarado: a.dmplDeclarado_mi * MI,
      },
      P,
    );
    expect(val(r.lpa)).toBeCloseTo(0.6923, 4);
    expect(r.fatorAjusteHoje).toBeCloseTo(2.6, 10);
    expect(val(r.lpaAjHoje)).toBeCloseTo(a.lpaCalcAjustado, 4);
    expect(val(r.vpaAjHoje)).toBeCloseTo(a.vpaAjustado, 3);
    expect(r.flags).not.toContain('payout_extraordinario_ou_lucro_negativo');
  });

  it('PETR4 2024: payout DMPL ≈ 275,6% ⇒ selo sem corte; por ação 224,5% ⇒ auditoria_proventos (> 15 p.p.)', () => {
    const a = ano('PETR4', 2024);
    const r = perShareAnual(
      {
        anoFiscal: 2024,
        lucroAtribuivel: ok(a.lucroCtrl_mi * MI),
        plControladora: ok(a.plCtrl_mi * MI),
        acoesFim: a.acoes_mi * MI,
        acoesAnterior: ano('PETR4', 2023).acoes_mi * MI,
        fatorEquivalencia: 1,
        eventos: [],
        dpaFimDoAno: ok(a.dpaDbDataCom),
        dpaHoje: ok(a.dpaDbDataCom),
        dmplDeclarado: a.dmplDeclarado_mi * MI,
      },
      P,
    );
    expect(val(r.payoutDmplPct)).toBeCloseTo(275.6, 1);
    expect(r.flags).toContain('payout_extraordinario_ou_lucro_negativo');
    expect(val(r.payoutPorAcaoPct)).toBeCloseTo(224.5, 1);
    expect(r.flags).toContain('auditoria_proventos');
    expect(r.flags).not.toContain('salto_acoes_sem_evento');
  });

  it('WEGE3 2025: payout 161,3% ⇒ selo, sem auditoria (DPA × ações bate com a DMPL)', () => {
    const a = ano('WEGE3', 2025);
    const r = perShareAnual(
      {
        anoFiscal: 2025,
        lucroAtribuivel: ok(a.lucroCtrl_mi * MI),
        plControladora: ok(a.plCtrl_mi * MI),
        acoesFim: a.acoes_mi * MI,
        acoesAnterior: ano('WEGE3', 2024).acoes_mi * MI,
        fatorEquivalencia: 1,
        eventos: eventosWege,
        dpaFimDoAno: ok(a.dpaDbDataCom),
        dpaHoje: ok(a.dpaDbDataCom),
        dmplDeclarado: a.dmplDeclarado_mi * MI,
      },
      P,
    );
    expect(val(r.payoutDmplPct)).toBeCloseTo(161.3, 1);
    expect(r.flags).toEqual(['payout_extraordinario_ou_lucro_negativo']);
  });

  it('regra 13: salto de ações 2,5× sem evento confirmado ⇒ salto_acoes_sem_evento + dados_incompletos', () => {
    const base = {
      anoFiscal: 2024,
      lucroAtribuivel: ok(1000),
      plControladora: ok(5000),
      acoesFim: 260,
      acoesAnterior: 100,
      fatorEquivalencia: 1,
      dpaFimDoAno: ok(1),
      dpaHoje: ok(1),
      dmplDeclarado: null,
    };
    const sem = perShareAnual({ ...base, eventos: [] }, P);
    expect(sem.flags).toEqual(
      expect.arrayContaining(['salto_acoes_sem_evento', 'dados_incompletos']),
    );
    const com = perShareAnual(
      {
        ...base,
        eventos: [{ dataEvento: '2024-05-01', fator: 2.6, status: 'confirmado', anoBase: 2024 }],
      },
      P,
    );
    expect(com.flags).not.toContain('salto_acoes_sem_evento');
    // evento só "não validável" não explica o salto
    const naoValidado = perShareAnual(
      {
        ...base,
        eventos: [{ dataEvento: '2024-05-01', fator: 2.6, status: 'nao_validavel', anoBase: 2024 }],
      },
      P,
    );
    expect(naoValidado.flags).toContain('salto_acoes_sem_evento');
  });

  it('controladora = 0 (BBAS3 3T25) chega como ausente ⇒ LPA ausente, nunca 0', () => {
    const r = perShareAnual(
      {
        anoFiscal: 2025,
        lucroAtribuivel: ausente('controladora_zero'),
        plControladora: ok(189207.7 * MI),
        acoesFim: 5708.464 * MI,
        acoesAnterior: null,
        fatorEquivalencia: 1,
        eventos: [],
        dpaFimDoAno: ok(1.17),
        dpaHoje: ok(1.17),
        dmplDeclarado: 8021.3 * MI,
      },
      P,
    );
    expect(r.lpa).toEqual({ estado: 'ausente', motivo: 'controladora_zero' });
    expect(r.payoutDmplPct.estado).toBe('ausente');
  });

  it('DMPL = 0 num ano com provento (BBAS3 individual) ⇒ payout DMPL ausente, sem auditoria falsa', () => {
    const r = perShareAnual(
      {
        anoFiscal: 2024,
        lucroAtribuivel: ok(35_262e6),
        plControladora: ok(180_883e6),
        acoesFim: 5708.047 * MI,
        acoesAnterior: null,
        fatorEquivalencia: 1,
        eventos: [],
        dpaFimDoAno: ok(2.5972),
        dpaHoje: ok(2.5972),
        dmplDeclarado: 0,
      },
      P,
    );
    expect(r.payoutDmplPct).toMatchObject({
      estado: 'ausente',
      detalhe: 'dmpl_zero_com_proventos',
    });
    expect(r.flags).toEqual(['dmpl_zero_com_proventos']);
  });

  it('unit: LPA × fator de equivalência (TAEE11 = 1 ON + 2 PN)', () => {
    const r = perShareAnual(
      {
        anoFiscal: 2025,
        lucroAtribuivel: ok(1_000),
        plControladora: ok(10_000),
        acoesFim: 1_000,
        acoesAnterior: null,
        fatorEquivalencia: 3,
        eventos: [],
        dpaFimDoAno: ok(1.5),
        dpaHoje: ok(1.5),
        dmplDeclarado: null,
      },
      P,
    );
    expect(val(r.lpa)).toBeCloseTo(3, 10);
    expect(val(r.payoutPorAcaoPct)).toBeCloseTo(50, 10);
  });
});

describe('preço de fim de ano (regra 5)', () => {
  it('último pregão ≤ 31/12 e ≥ 26/12; > 5 dias antes ⇒ sem ponto', () => {
    const c = [cot('WEGE3', '2024-12-27', 51.9), cot('WEGE3', '2024-12-30', 52.77)];
    expect(precoFimDePeriodo(c, '2024-12-31', P)).toEqual({ preco: 52.77, data: '2024-12-30' });
    expect(precoFimDePeriodo([cot('WEGE3', '2024-12-20', 50)], '2024-12-31', P)).toBeNull();
    expect(precoFimDePeriodo([cot('WEGE3', '2025-01-02', 50)], '2024-12-31', P)).toBeNull();
  });
});

describe('múltiplos anuais (decisão 19: preço cru × ações da mesma data ÷ métrica)', () => {
  it('WEGE3 2024: 52,77 × 4.195,54 mi ÷ 6.042,6 mi ≈ 36,6–36,7 (nunca o 34,7 da BRAPI)', () => {
    const a = ano('WEGE3', 2024);
    const m = multiplosAnuais(
      {
        classe: 'acao',
        preco: 52.77,
        acoesTotais: a.acoes_mi * MI,
        fatorEquivalencia: 1,
        valorMercadoEmpresa: null,
        fund: fund({
          lucroAtribuivel: a.lucroCtrl_mi * MI,
          lucroLiquido: a.lucroCtrl_mi * MI,
          plControladora: a.plCtrl_mi * MI,
          receita: a.receita_mi * MI,
        }),
        dpa: ok(a.dpaDbDataCom),
        ehFinanceira: false,
      },
      P,
    );
    const pl = val(m.pl);
    expect(pl).toBeGreaterThanOrEqual(36.6);
    expect(pl).toBeLessThanOrEqual(36.7);
    expect(Math.abs(pl - 34.7)).toBeGreaterThan(1);
    expect(val(m.pvp)).toBeCloseTo(52.77 / ((a.plCtrl_mi * MI) / (a.acoes_mi * MI)), 8);
    expect(val(m.dyPct)).toBeCloseTo((0.7558 / 52.77) * 100, 6);
  });

  it('WEGE3 2019: cru 34,66 (antes do 2:1 de 2021) × 2.098,7 mi ÷ 1.614,6 mi ≈ 45,1 (não 19,9)', () => {
    const a = ano('WEGE3', 2019);
    const m = multiplosAnuais(
      {
        classe: 'acao',
        preco: 34.66,
        acoesTotais: a.acoes_mi * MI,
        fatorEquivalencia: 1,
        valorMercadoEmpresa: null,
        fund: fund({ lucroAtribuivel: a.lucroCtrl_mi * MI, plControladora: a.plCtrl_mi * MI }),
        dpa: ok(0.3404),
        ehFinanceira: false,
      },
      P,
    );
    expect(val(m.pl)).toBeCloseTo(45.1, 0);
    expect(Math.abs(val(m.pl) - 45.1)).toBeLessThan(0.1);
  });

  it('prejuízo ⇒ P/L n/a (base ≤ 0), nunca múltiplo negativo; PL ≤ 0 ⇒ ROE n/a', () => {
    const m = multiplosAnuais(
      {
        classe: 'acao',
        preco: 10,
        acoesTotais: 100,
        fatorEquivalencia: 1,
        valorMercadoEmpresa: null,
        fund: fund({
          lucroAtribuivel: -50,
          plControladora: -200,
          receita: 1000,
          lucroLiquido: -50,
        }),
        dpa: ok(0),
        ehFinanceira: false,
      },
      P,
    );
    expect(m.pl).toEqual(naoSeAplica('base_nao_positiva'));
    expect(m.pvp).toEqual(naoSeAplica('base_nao_positiva'));
    expect(m.roePct).toEqual(naoSeAplica('base_nao_positiva'));
    expect(m.flags).toEqual(expect.arrayContaining(['pl_nao_positivo', 'lucro_nao_positivo']));
    expect(val(m.dyPct)).toBe(0);
  });

  it('financeira (BBAS3): EV/EBITDA, DL/EBITDA, ROIC e liquidez corrente n/a; ROE calculado', () => {
    const a = ano('BBAS3', 2024);
    const m = multiplosAnuais(
      {
        classe: 'acao',
        preco: 27.5,
        acoesTotais: a.acoes_mi * MI,
        fatorEquivalencia: 1,
        valorMercadoEmpresa: null,
        fund: fund({
          lucroAtribuivel: a.lucroCtrl_mi * MI,
          plControladora: a.plCtrl_mi * MI,
          receita: a.receita_mi * MI,
          ebit: 1,
        }),
        dpa: ok(a.dpaDbDataCom),
        ehFinanceira: true,
      },
      P,
    );
    for (const k of [
      'evEbitda',
      'divLiqEbitda',
      'roicPct',
      'liquidezCorrente',
      'ebitda',
    ] as const) {
      expect(m[k]).toEqual(naoSeAplica('financeira'));
    }
    expect(val(m.roePct)).toBeCloseTo((26358.9 / 179623) * 100, 6);
  });

  it('holding (ITSA4): receita menor que o lucro ⇒ margem e P/Receita n/a', () => {
    const a = ano('ITSA4', 2025);
    expect(a.receita_mi).toBeLessThan(a.lucroCtrl_mi);
    const m = multiplosAnuais(
      {
        classe: 'acao',
        preco: 10,
        acoesTotais: a.acoes_mi * MI,
        fatorEquivalencia: 1,
        valorMercadoEmpresa: null,
        fund: fund({
          lucroAtribuivel: a.lucroCtrl_mi * MI,
          lucroLiquido: a.lucroCtrl_mi * MI,
          plControladora: a.plCtrl_mi * MI,
          receita: a.receita_mi * MI,
        }),
        dpa: ok(0.8),
        ehFinanceira: true,
      },
      P,
    );
    expect(m.margemLiquidaPct).toEqual(naoSeAplica('receita_menor_que_lucro'));
    expect(m.pReceita).toEqual(naoSeAplica('receita_menor_que_lucro'));
  });

  it('EV/EBITDA e DL/EBITDA de não financeira; EBITDA ≤ 0 ⇒ n/a no múltiplo', () => {
    const f = fund({
      lucroAtribuivel: 100,
      plControladora: 1000,
      ebit: 200,
      depreciacaoAmortizacao: 50,
      caixa: 100,
      aplicacoesFinanceiras: 50,
      dividaBrutaCp: 300,
      dividaBrutaLp: 400,
      ativoCirculante: 900,
      passivoCirculante: 600,
    });
    const m = multiplosAnuais(
      {
        classe: 'acao',
        preco: 20,
        acoesTotais: 100,
        fatorEquivalencia: 1,
        valorMercadoEmpresa: 2000,
        fund: f,
        dpa: ok(1),
        ehFinanceira: false,
      },
      P,
    );
    expect(val(m.dividaLiquida)).toBe(550);
    expect(val(m.divLiqEbitda)).toBeCloseTo(2.2, 10);
    expect(val(m.evEbitda)).toBeCloseTo(2550 / 250, 10);
    expect(val(m.liquidezCorrente)).toBeCloseTo(1.5, 10);
    const neg = multiplosAnuais(
      {
        classe: 'acao',
        preco: 20,
        acoesTotais: 100,
        fatorEquivalencia: 1,
        valorMercadoEmpresa: 2000,
        fund: { ...f, ebit: -300 },
        dpa: ok(1),
        ehFinanceira: false,
      },
      P,
    );
    expect(neg.divLiqEbitda).toEqual(naoSeAplica('base_nao_positiva'));
  });

  it('FII HGLG11 2016: P/VP cru ÷ cru da mesma data (1.100 ÷ 1.105,35 ≈ 0,995); VP/cota a hoje ÷10', () => {
    const h = fiiInforme.HGLG11;
    const m = multiplosAnuais(
      {
        classe: 'fii',
        preco: h.precoCru20161229,
        vpCota: h.meses[0].vpCota,
        rendCota: ok(7.8),
        obrigacoesPlPct: 0,
        vacanciaFisicaCvmPct: null,
        nImoveisCvm: null,
        pl: h.meses[0].pl,
      },
      P,
    );
    expect(val(m.pvp)).toBeCloseTo(1100 / 1105.35048723905, 6);
    const evs = verificarEventosCorporativos(
      eventosBrutos('HGLG11'),
      [],
      P,
      h.meses.map((x) => ({ refMonth: x.refMonth, cotas: x.cotas, fatorDesdobramento: null })),
      'HGLG11',
    );
    const ps = perShareAnualFii({
      anoFiscal: 2016,
      vpCotaFim: h.meses[0].vpCota,
      rendCotaAno: ok(7.8),
      rendCotaHoje: ok(0.78),
      eventos: evs,
      pl: h.meses[0].pl,
    });
    expect(ps.fatorAjusteHoje).toBe(10);
    expect(val(ps.vpaAjHoje)).toBeCloseTo(110.535, 3);
  });

  it('PABY11 com PL ≤ 0 ⇒ flag pl_nao_positivo e P/VP n/a', () => {
    const mes = fiiInforme.PABY11.meses[1];
    const m = multiplosAnuais(
      {
        classe: 'fii',
        preco: 50,
        vpCota: mes.vpCota,
        rendCota: ok(0),
        obrigacoesPlPct: null,
        vacanciaFisicaCvmPct: null,
        nImoveisCvm: null,
        pl: mes.pl,
      },
      P,
    );
    expect(m.flags).toContain('pl_nao_positivo');
    expect(m.pvp).toEqual(naoSeAplica('base_nao_positiva'));
  });
});

describe('P/L atual × média de 10 anos (regra 7)', () => {
  it('anos com P/L ≤ 0 (n/a) fora da média e do mínimo de 5 pontos', () => {
    const hist = [15.8, 19.4, 21.0, 27.4, 35.1, 21.9, 19.3, 13.4, 18.1, 31.2].map((pl, i) => ({
      anoFiscal: 2016 + i,
      pl: ok(pl) as Valor<number>,
    }));
    const r = plContraMedia10a(ok(31.2), hist, P);
    expect(r.plPontosHistorico).toBe(10);
    expect(val(r.plMedia10a)).toBeCloseTo(22.26, 2);
    expect(val(r.plVsMedia10aPct)).toBeCloseTo(40.16, 1);

    const curto = [
      ok(12),
      naoSeAplica('base_nao_positiva'),
      ok(14),
      naoSeAplica('base_nao_positiva'),
      ok(16),
      ok(18),
    ].map((pl, i) => ({ anoFiscal: 2020 + i, pl: pl as Valor<number> }));
    const r2 = plContraMedia10a(ok(20), curto, P);
    expect(r2.plPontosHistorico).toBe(4);
    expect(r2.plVsMedia10aPct).toMatchObject({ estado: 'ausente', motivo: 'historico_curto' });
  });

  it('P/L atual com prejuízo ⇒ n/a (não compara)', () => {
    const hist = [10, 11, 12, 13, 14].map((pl, i) => ({
      anoFiscal: 2020 + i,
      pl: ok(pl) as Valor<number>,
    }));
    expect(plContraMedia10a(naoSeAplica('base_nao_positiva'), hist, P).plVsMedia10aPct.estado).toBe(
      'nao_se_aplica',
    );
  });

  it('multiplosAtuais junta TTM e histórico', () => {
    const hist = [20, 22, 24, 26, 28].map((pl, i) => ({
      anoFiscal: 2021 + i,
      pl: ok(pl) as Valor<number>,
    }));
    const m = multiplosAtuais(
      {
        classe: 'acao',
        preco: 36,
        acoesTotais: 100,
        fatorEquivalencia: 1,
        valorMercadoEmpresa: null,
        fund: fund({ lucroAtribuivel: 100, plControladora: 1000 }),
        dpa: ok(0.9),
        ehFinanceira: false,
        historicoPl: hist,
      },
      P,
    );
    expect(val(m.pl)).toBe(36);
    expect(val(m.plVsMedia10aPct)).toBeCloseTo(50, 10);
    expect(val(m.dyPct)).toBeCloseTo(2.5, 10);
  });
});

describe('três estados em colunas', () => {
  it('ok ⇒ número; n/a ⇒ null + nome na lista; ausente ⇒ null fora da lista; zero ⇒ 0', () => {
    const r = achatarValores({
      pl: ok(10),
      evEbitda: naoSeAplica('financeira'),
      roePct: ausente('sem_dado_fonte'),
      dyPct: ok(0),
    });
    expect(r.colunas).toEqual({ pl: 10, evEbitda: null, roePct: null, dyPct: 0 });
    expect(r.naoSeAplica).toEqual(['evEbitda']);
  });
});

describe('sequências', () => {
  it('anos de lucro consecutivos: WEGE3 10 (2016–2025); MGLU3 2 (prejuízo em 2023)', () => {
    const serie = (t: string) =>
      Object.entries(empresa(t).anos).map(([a, v]) => ({
        anoFiscal: Number(a),
        lucro: ok(v.lucroCtrl_mi as number) as Valor<number>,
      }));
    expect(anosLucroConsecutivos(serie('WEGE3'))).toEqual(ok(10));
    expect(anosLucroConsecutivos(serie('MGLU3'))).toEqual(ok(2));
    expect(
      anosLucroConsecutivos([{ anoFiscal: 2025, lucro: ausente('controladora_zero') }]).estado,
    ).toBe('ausente');
    expect(anosLucroConsecutivos([{ anoFiscal: 2025, lucro: ok(-1) }])).toEqual(ok(0));
  });

  it('XPML11/VISC11 pagando todo mês ⇒ contagem contínua (não os 7/52 da CVM)', () => {
    for (const t of ['XPML11', 'VISC11']) {
      const aud = auditarProventos(proventosBrutos(t), [], P, { classe: 'fii' });
      // base do dev: um pagamento por mês desde jan/2024 (XPML11 até mai/26, VISC11 até jun/26)
      const meses = new Set(aud.map((a) => a.dataPagamento!.slice(0, 7))).size;
      expect(meses).toBeGreaterThanOrEqual(29);
      expect(mesesComRendimentoConsecutivos(aud, '2026-06-30', P)).toBe(meses);
    }
  });

  it('mês corrente sem pagamento é tolerado; mês faltando no meio corta a sequência', () => {
    const aud = auditarProventos(proventosBrutos('VISC11'), [], P_LEGADO, { classe: 'fii' });
    expect(mesesComRendimentoConsecutivos(aud, '2026-07-10', P)).toBe(30);
    // dois meses seguidos sem pagamento (jul e ago) ⇒ 0
    expect(mesesComRendimentoConsecutivos(aud, '2026-08-10', P)).toBe(0);
    const semMarco = aud.filter((a) => a.dataPagamento?.slice(0, 7) !== '2026-03');
    expect(mesesComRendimentoConsecutivos(semMarco, '2026-06-30', P)).toBe(3);
  });

  it('YAHOO sem pagamento: mês = data-com + 1, com mesEstimado', () => {
    const aud = auditarProventos(proventosBrutos('TGAR11'), [], P_LEGADO, { classe: 'fii' });
    const r = mesesComRendimentoDetalhado(aud, '2026-06-30', P);
    expect(r.meses).toBeGreaterThanOrEqual(17);
    expect(r.mesEstimado).toBe(true);
  });
});
