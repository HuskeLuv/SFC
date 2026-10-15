import { describe, expect, it } from 'vitest';
import { PLACEHOLDERS_ATIVO, TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import { TEXTOS_CRITERIOS, formatarTexto } from '@/services/analiseAtivos/textosCriterios';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { folhasTexto } from '@/services/analiseAtivos/regras/comum/varreduraTextos';

const FOLHAS = folhasTexto(TEXTOS_ATIVO, 'TEXTOS_ATIVO');

describe('textosAtivo (fatia C2)', () => {
  it('nenhuma palavra proibida (linguagemV2) em nenhuma folha', () => {
    const achados = FOLHAS.map(([k, v]) => [k, encontrarProibidasV2(v)] as const).filter(
      ([, p]) => p.length > 0,
    );
    expect(achados).toEqual([]);
  });

  it('sem Índice, nota, semáforo nem destaque (nem em minúsculas)', () => {
    for (const [k, v] of FOLHAS) {
      expect(v, k).not.toMatch(/índice|indice|\bnota\b|semáforo|destaque|ranking|★/i);
    }
  });

  it('placeholders: só os permitidos e todos preenchidos', () => {
    const vars = Object.fromEntries(PLACEHOLDERS_ATIVO.map((p) => [p, 'X']));
    for (const [k, v] of FOLHAS) {
      for (const m of v.matchAll(/\{(\w+)\}/g)) {
        expect(PLACEHOLDERS_ATIVO as readonly string[], `${k}: {${m[1]}}`).toContain(m[1]);
      }
      expect(formatarTexto(v, vars), k).not.toMatch(/[{}]/);
    }
  });

  it('Essencial na ordem da §3.2 com "Lucro descontado ⓘ" e "Margem descontada ⓘ" (v2.5)', () => {
    expect(Object.values(TEXTOS_ATIVO.essencial.colunas)).toEqual([
      'Receita líq.',
      'EBITDA',
      'Lucro descontado ⓘ',
      'Margem descontada ⓘ',
      'Dívida líq. ⓘ',
      'Dív. líq./EBITDA',
      'FCL/CAPEX ⓘ',
      'ROE',
      'LPA (R$)',
      'Div./ação (R$)',
      'Payout',
      'P/L',
      'P/VP',
      'DY',
    ]);
    expect(TEXTOS_ATIVO.essencial.tooltips.lucro).toBe(TEXTOS_CRITERIOS.tooltips.lucroDescontado);
    expect(TEXTOS_ATIVO.essencial.tooltips.fallbackLucro).toBe(
      TEXTOS_CRITERIOS.tooltips.fallbackLucro,
    );
    expect(TEXTOS_ATIVO.essencial.tooltips.margem).toBe(TEXTOS_CRITERIOS.tooltips.margemDescontada);
    expect(TEXTOS_ATIVO.essencial.unidadeAcao).toMatch(/R\$ bi/);
  });

  it('"Área (CVM)" no lugar de ABL (rec. 7)', () => {
    expect(TEXTOS_ATIVO.essencial.areaFii).toBe('Área (CVM)');
    expect(TEXTOS_ATIVO.essencial.tooltipAreaFii).toMatch(/não é a ABL/);
  });

  it('resumo literal do Valuation (§3.2 bloco 6)', () => {
    expect(
      formatarTexto(TEXTOS_ATIVO.valuation.resumo, {
        n: 3,
        total: 6,
        valor: 'Preço',
        anos: 10,
      }),
    ).toBe('3 de 6 indicadores de Preço estão abaixo da própria média de 10 anos');
    expect(TEXTOS_ATIVO.valuation.legenda).toBe('marcador azul = valor atual · traço = média');
  });

  it('sem dado conta como não atende', () => {
    expect(
      formatarTexto(TEXTOS_ATIVO.criterios.fatoSemDado, {
        fato: TEXTOS_CRITERIOS.fatos.semDado,
      }),
    ).toBe(TEXTOS_CRITERIOS.estados.sem_dado);
  });
});
