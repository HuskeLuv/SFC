import { describe, expect, it } from 'vitest';
import {
  emissorEhHoldingSeguradora,
  origemReceitaSeguradora,
  templateDoEmissor,
  valoresBanco,
  valoresSeguradora,
} from '@/services/analiseAtivos/regras/acoes/templateFinanceira';
import type { FundamentosPeriodo } from '@/services/analiseAtivos/tipos';

const bi = 1e9;

function periodo(p: Partial<FundamentosPeriodo>): FundamentosPeriodo {
  return {
    emissorId: 'x',
    docTipo: 'DFP',
    tipoPeriodo: 'FY',
    escopo: 'con',
    padraoContabil: 'IFRS',
    dtIni: '2025-01-01',
    dtFim: '2025-12-31',
    anoFiscal: 2025,
    trimestreFiscal: null,
    versao: 1,
    dtEntregaOriginal: '2026-02-01',
    receita: null,
    lucroBruto: null,
    ebit: null,
    depreciacaoAmortizacao: null,
    lucroLiquido: null,
    lucroAtribuivel: null,
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
    fci: null,
    fcf: null,
    capex: null,
    dividendosJcpPagos: null,
    dmplDeclarado: null,
    lpaOn: null,
    lpaPn: null,
    naoSeAplica: [],
    flags: [],
    ...p,
  };
}

describe('templateDoEmissor', () => {
  it('Bancos ⇒ banco; Seguradoras/Resseguradoras ⇒ seguradora; holding financeira ⇒ template de hoje', () => {
    expect(templateDoEmissor({ ehBanco: true, segmento: 'Bancos' })).toBe('banco');
    expect(templateDoEmissor({ ehBanco: false, segmento: 'Seguradoras' })).toBe('seguradora');
    expect(templateDoEmissor({ ehBanco: false, segmento: 'Resseguradoras' })).toBe('seguradora');
    expect(templateDoEmissor({ ehBanco: false, segmento: 'Holdings Diversificadas' })).toBeNull();
    expect(templateDoEmissor({ ehBanco: false, segmento: null })).toBeNull();
  });
});

describe('valoresBanco (ITUB 2025, consolidado)', () => {
  const f = periodo({
    receita: 387.118 * bi,
    pdd: -28.833 * bi,
    ativoTotal: 3_100 * bi,
    pl: 220 * bi,
    plControladora: 215 * bi,
    dividendosJcpPagos: 30 * bi,
  });
  it('PDD em valor absoluto, margem bancária, PDD ÷ lucro (×) e PL ÷ ativo', () => {
    const r = valoresBanco(f, 46 * bi);
    expect(r.pdd).toEqual({ valor: 28.833 * bi });
    expect(r.receitaIntermediacao).toEqual({ valor: 387.118 * bi });
    expect('valor' in r.margemBancariaPct && r.margemBancariaPct.valor).toBeCloseTo(11.88, 2);
    expect('valor' in r.pddLucro && r.pddLucro.valor).toBeCloseTo(0.6268, 3);
    expect('valor' in r.plAtivoPct && r.plAtivoPct.valor).toBeCloseTo(6.935, 2);
    expect(r.patrimonio).toEqual({ valor: 215 * bi });
    expect(r.divJcp).toEqual({ valor: 30 * bi });
  });
  it('lucro ≤ 0 ⇒ PDD ÷ lucro "—" com o motivo; sem DVA ⇒ PDD sem_dva', () => {
    expect(valoresBanco(f, -1 * bi).pddLucro).toEqual({ motivo: 'lucro_nao_positivo' });
    const semDva = valoresBanco(periodo({ receita: 10 * bi }), 1 * bi);
    expect(semDva.pdd).toEqual({ motivo: 'sem_dva' });
    expect(semDva.pddLucro).toEqual({ motivo: 'sem_dva' });
  });
});

describe('seguradora', () => {
  const bbse = periodo({
    receita: 0,
    receitaSeguro: 0,
    receitaComissoesServicos: 4.994545 * bi,
    equivalenciaPatrimonial: 5.340918 * bi,
    resultadoFinanceiro: 1.0756 * bi,
  });
  const pssa25 = periodo({
    receitaSeguro: 32.64179 * bi,
    despesaSeguro: -25.361238 * bi,
    receitaComissoesServicos: 3.424238 * bi,
    sinistrosRetidos: 0,
    equivalenciaPatrimonial: 0.065759 * bi,
  });
  const pssa22 = periodo({
    anoFiscal: 2022,
    premiosGanhos: 19.84134 * bi,
    sinistrosRetidos: -13.681393 * bi,
  });

  it('holding (BBSE): receita = comissões + serviços, equivalência aparece, operação de seguro "—" (holding)', () => {
    expect(emissorEhHoldingSeguradora([bbse])).toBe(true);
    const r = valoresSeguradora(bbse, 2025, 9.017329 * bi, true);
    expect(r.origem).toBe('comissoes_servicos');
    expect(r.receitaOperacional).toEqual({ valor: 4.994545 * bi });
    expect(r.equivalencia).toEqual({ valor: 5.340918 * bi });
    expect(r.margemPct).toEqual({ motivo: 'margem_sem_leitura' });
    expect(r.sinistralidadePct).toEqual({ motivo: 'holding_sem_operacao' });
    expect(r.despesaReceitaSeguroPct).toEqual({ motivo: 'holding_sem_operacao' });
  });

  it('operacional (PSSA) desde 2023: receita de seguro, despesa ÷ receita (IFRS 17); sinistralidade "—" (IFRS 17)', () => {
    expect(emissorEhHoldingSeguradora([pssa25, pssa22])).toBe(false);
    const r = valoresSeguradora(pssa25, 2025, 3.38 * bi, false);
    expect(r.origem).toBe('receita_seguro');
    expect(r.equivalencia).toEqual({ motivo: 'equivalencia_nao_se_aplica' });
    expect('valor' in r.despesaReceitaSeguroPct && r.despesaReceitaSeguroPct.valor).toBeCloseTo(
      77.7,
      1,
    );
    expect(r.sinistralidadePct).toEqual({ motivo: 'ifrs17' });
    expect('valor' in r.margemPct && r.margemPct.valor).toBeCloseTo(10.35, 1);
  });

  it('operacional até 2022: prêmios ganhos e sinistralidade; despesa ÷ receita "—" (IFRS 17)', () => {
    const r = valoresSeguradora(pssa22, 2022, 1.13 * bi, false);
    expect(r.origem).toBe('premios_ganhos');
    expect('valor' in r.sinistralidadePct && r.sinistralidadePct.valor).toBeCloseTo(68.95, 1);
    expect(r.despesaReceitaSeguroPct).toEqual({ motivo: 'ifrs17' });
  });

  it('origem da receita por regime', () => {
    expect(origemReceitaSeguradora(pssa22, 2022, false)).toBe('premios_ganhos');
    expect(origemReceitaSeguradora(pssa25, 2025, false)).toBe('receita_seguro');
    expect(origemReceitaSeguradora(bbse, 2025, true)).toBe('comissoes_servicos');
    expect(origemReceitaSeguradora(periodo({}), 2025, false)).toBeNull();
  });
});
