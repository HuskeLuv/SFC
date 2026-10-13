/**
 * Caso 30 da spec v2.4 (§4.5) — fatia B: regra E dos filtros de critérios e o formato do contador
 * 'X de N atendem a k critérios em J anos', sobre uma base SINTÉTICA de 312 ações (o '22 de 312'
 * da spec é da base ilustrativa; no DEV real dá cerca de 14/330).
 */
import { describe, expect, it } from 'vitest';
import type { AnaliseQuadroLinha } from '@prisma/client';
import { paraLinhaQuadroApiNaJanela } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { CRITERIA_PARAMS_V1 } from '@/services/analiseAtivos/params/criteriaParamsV1';
import { consultarQuadro } from '../consultaQuadro';
import { textoContadorQuadro } from '@/services/analiseAtivos/textosQuadro';
import { linhaQuadroDb } from '@/test/fixtures/analiseAtivos/linhasDb';
import type {
  CriteriosCompactos,
  EstadoCriterio,
  IdCriterio,
  Janela,
} from '@/types/analiseAtivosCriterios';

const IDS: IdCriterio[] = ['rec', 'luc', 'ebitda', 'mg', 'dl', 'fcl'];

/**
 * 312 ações: as 22 primeiras atendem a Receita, Lucro e Margem na janela 5; as demais falham em
 * pelo menos um dos três de formas diferentes (não atende, sem dado, sem avaliação). As financeiras
 * (a cada 10) têm EBITDA/Dív./FCL 'não se aplica'.
 */
function base(): AnaliseQuadroLinha[] {
  return Array.from({ length: 312 }, (_, i) => {
    const symbol = `A${String(i).padStart(3, '0')}3`;
    if (i % 50 === 49) return linhaQuadroDb({ symbol }); // job ainda não avaliou
    const financeira = i % 10 === 3;
    const estado = (id: IdCriterio): EstadoCriterio => {
      if (financeira && (id === 'ebitda' || id === 'dl' || id === 'fcl')) return 'nao_se_aplica';
      if (i < 22) return 'atende';
      if (id === 'rec') return i % 3 === 0 ? 'sem_dado' : 'atende';
      if (id === 'luc') return i % 3 === 1 ? 'nao_atende' : 'atende';
      if (id === 'mg') return i % 3 === 2 ? 'nao_atende' : 'atende';
      return i % 2 ? 'atende' : 'nao_atende';
    };
    const m = IDS.map((id) => [id, estado(id), 'fato'] as [IdCriterio, EstadoCriterio, string]);
    const criterios: CriteriosCompactos = {
      '5': {
        n: m.filter(([, e]) => e === 'atende').length,
        de: m.filter(([, e]) => e !== 'nao_se_aplica').length,
        m,
      },
    };
    return linhaQuadroDb({
      symbol,
      perfilCriterios: financeira ? 'acao_financeira' : 'acao',
      criterios,
    });
  });
}

function consultar(criterios: string, janela: Janela = 5) {
  return consultarQuadro({
    params: { classe: 'acao', criterios, janela, limite: 100 },
    linhas: base().map((r) => paraLinhaQuadroApiNaJanela(r, janela)),
    versao: 'v',
    dataRef: null,
    hoje: '2026-10-13',
    criteriaParams: CRITERIA_PARAMS_V1,
  });
}

describe('caso 30 — filtros E e contador', () => {
  it('22 de 312 atendem a 3 critérios em 5 anos', () => {
    const r = consultar('rec,luc,mg');
    expect(r.total).toBe(22);
    expect(r.totalClasse).toBe(312);
    expect(r.itens.map((l) => l.ticker)).toEqual(
      Array.from({ length: 22 }, (_, i) => `A${String(i).padStart(3, '0')}3`),
    );
    expect(
      textoContadorQuadro({ n: r.total, total: r.totalClasse!, criterios: 3, janela: r.janela! }),
    ).toBe('22 de 312 atendem a 3 critérios em 5 anos');
  });

  it('é E lógico: cada critério ligado só pode tirar ativos, nunca acrescentar', () => {
    const um = consultar('rec').total;
    const dois = consultar('rec,luc').total;
    const tres = consultar('rec,luc,mg').total;
    expect(um).toBeGreaterThanOrEqual(dois);
    expect(dois).toBeGreaterThanOrEqual(tres);
    // a ordem dos chips não muda o resultado
    expect(consultar('mg,rec,luc').total).toBe(tres);
  });

  it('não se aplica (financeiras) e sem dado nunca passam', () => {
    const r = consultar('ebitda');
    expect(r.itens.some((l) => l.criterios?.perfil === 'acao_financeira')).toBe(false);
    const rec = consultar('rec');
    expect(
      rec.itens.every((l) => l.criterios?.marcas.find((m) => m.id === 'rec')?.estado === 'atende'),
    ).toBe(true);
  });

  it('sem critério ligado o contador é "X de N"; janela sem avaliação = lista vazia', () => {
    const r = consultar('');
    expect(
      textoContadorQuadro({ n: r.total, total: r.totalClasse!, criterios: 0, janela: 5 }),
    ).toBe('312 de 312');
    const dez = consultar('rec', 10);
    expect(dez.total).toBe(0);
    expect(
      textoContadorQuadro({ n: dez.total, total: dez.totalClasse!, criterios: 1, janela: 10 }),
    ).toBe('0 de 312 atendem a 1 critério em 10 anos');
  });
});
