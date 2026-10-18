/**
 * Textos da feature Stocks e REITs (fatia 0): linguagem v2, nenhum nome de índice de mercado,
 * placeholders registrados, literais novos e a frase de fonte das classes EUA.
 */
import { describe, expect, it } from 'vitest';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import {
  PLACEHOLDERS_EUA,
  TEXTOS_EUA,
  setorDoSic,
  textoCorteFloat,
  textoExercicio,
  textoUniverso,
} from '@/services/analiseAtivos/textosEua';
import { TEXTOS_CRITERIOS, textoNotaFonte } from '@/services/analiseAtivos/textosCriterios';
import {
  TEXTOS_LITERAIS_OBRIGATORIOS,
  textoLiteral,
} from '@/services/analiseAtivos/textosLiterais';
import { CRITERIA_PARAMS_V3 } from '@/services/analiseAtivos/params/criteriaParamsV3';
import { UNIVERSO_EUA_PADRAO } from '@/types/analiseAtivosEua';

function folhas(obj: unknown, caminho: string): Array<[string, string]> {
  if (typeof obj === 'string') return [[caminho, obj]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => folhas(v, `${caminho}[${i}]`));
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) => folhas(v, `${caminho}.${k}`));
  }
  return [];
}

const TEXTOS_NOVOS = [
  ...folhas(TEXTOS_EUA, 'TEXTOS_EUA'),
  ...folhas(CRITERIA_PARAMS_V3.perfis.stock, 'v3.stock'),
  ...folhas(CRITERIA_PARAMS_V3.perfis.reit, 'v3.reit'),
  ['fatos.caixaOperacionalNaoPositivo', TEXTOS_CRITERIOS.fatos.caixaOperacionalNaoPositivo],
  ['motivos.ocup', TEXTOS_CRITERIOS.motivos.sem_fonte_confiavel.ocup],
] as Array<[string, string]>;

const RE_INDICE_MERCADO = /S&P|MSCI|Dow Jones|Russell|Nasdaq[\s-]?100/i;

describe('textos EUA', () => {
  it('linguagem v2: nenhuma palavra proibida (nota, ranking, recomendação, melhor…)', () => {
    const achados = TEXTOS_NOVOS.flatMap(([c, t]) => {
      const p = encontrarProibidasV2(t, { ignorarLiterais: true });
      return p.length ? [`${c}: ${p.join(', ')}`] : [];
    });
    expect(achados).toEqual([]);
    expect(TEXTOS_NOVOS.filter(([, t]) => /\bnotas?\b/i.test(t))).toEqual([]);
  });

  it('nenhum nome de índice de mercado (texto, literal ou rótulo de critério)', () => {
    const literaisEua = [
      'rodape-quadro-eua',
      'aviso-legal-eua',
      'instrucao-comparador-stocks',
      'instrucao-comparador-reits',
    ];
    const todos = [
      ...TEXTOS_NOVOS,
      ...literaisEua.map((id) => [id, textoLiteral(id) ?? ''] as [string, string]),
    ];
    expect(todos.filter(([, t]) => RE_INDICE_MERCADO.test(t))).toEqual([]);
    // e a varredura v2 passa a acusar nome de índice
    expect(encontrarProibidasV2('Universo: empresas do S&P 500')).toContain('S&P 500');
    expect(encontrarProibidasV2('fora do MSCI World')).toContain('MSCI');
    expect(encontrarProibidasV2('listadas na NYSE ou na Nasdaq')).toEqual([]);
  });

  it('placeholders só da lista registrada', () => {
    const usados = new Set(
      folhas(TEXTOS_EUA, '').flatMap(([, t]) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1])),
    );
    for (const p of usados) expect(PLACEHOLDERS_EUA as readonly string[]).toContain(p);
  });

  it('universo pela regra, com o corte vigente (US$ 2 bi), e exercício', () => {
    expect(textoCorteFloat(2e9)).toBe('US$ 2 bi');
    expect(textoCorteFloat(1.6e9)).toBe('US$ 1,6 bi');
    expect(textoUniverso('stock', UNIVERSO_EUA_PADRAO.stock.floatEntradaUsd)).toBe(
      'Universo: empresas listadas na NYSE ou na Nasdaq que entregam o relatório anual 10-K à SEC, com free float a partir de US$ 2 bi na capa do último 10-K.',
    );
    expect(textoUniverso('reit', 2e9)).toMatch(/^Universo: REITs de patrimônio/);
    expect(textoExercicio('0927')).toBe('FY termina em set');
    expect(textoExercicio('13xx')).toBeNull();
    expect(setorDoSic(3571)).toBe('Indústria');
    expect(setorDoSic(6798)).toBe('Finanças, seguros e imóveis');
    expect(setorDoSic(null)).toBe('Não classificado');
  });

  it('frase de fonte: SEC nas classes EUA; o Brasil não muda', () => {
    expect(textoNotaFonte('stock')).toBe('Fonte: relatório anual 10-K (SEC).');
    expect(textoNotaFonte('reit', ['sec'])).toBe('Fonte: relatório anual 10-K (SEC).');
    expect(textoNotaFonte('acao')).toBe('Fonte: DFP/ITR (CVM).');
    expect(textoNotaFonte('fii', ['cvm'])).toBe(
      'Fonte: informes mensais e trimestrais dos FIIs (CVM).',
    );
    expect(textoNotaFonte('acao', ['provedor_x', 'cvm'], { provedor_x: 'Provedor X' })).toBe(
      'Fonte: Provedor X · DFP/ITR (CVM).',
    );
  });

  it('literais EUA registrados (o aviso legal fica provisório para o jurídico)', () => {
    expect(TEXTOS_LITERAIS_OBRIGATORIOS['rodape-quadro-eua'].texto).toMatch(/10-K entregues à SEC/);
    expect(TEXTOS_LITERAIS_OBRIGATORIOS['aviso-legal-eua'].provisorio).toBe(true);
    expect(textoLiteral('instrucao-comparador-reits')).toMatch(/^Compare até 4 REITs/);
  });
});
