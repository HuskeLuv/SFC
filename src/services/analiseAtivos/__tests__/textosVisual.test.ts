/**
 * fundamentei-regras (F4, item C): textos do visual v2 passam pela varredura linguagemV2 e pelos
 * termos em inglês proibidos (cheap, fair value, buy, undervalued…), com os placeholders preenchidos.
 */
import { describe, expect, it } from 'vitest';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { TERMOS_EN_PROIBIDOS } from '@/services/analiseAtivos/textosEuaEn';
import { TEXTOS_VISUAL, textoVisual } from '@/services/analiseAtivos/textosVisual';

function folhas(obj: unknown, caminho: string): Array<[string, string]> {
  if (typeof obj === 'string') return [[caminho, obj]];
  if (obj && typeof obj === 'object')
    return Object.entries(obj).flatMap(([k, v]) => folhas(v, `${caminho}.${k}`));
  return [];
}

const PREENCHER = {
  contador: '12 de 312',
  ticker: 'WEGE3',
  nome: 'WEG',
  unidade: 'R$ bi',
  fonte: 'CVM',
};

describe('textosVisual (F4)', () => {
  const todas = folhas(TEXTOS_VISUAL, 'TEXTOS_VISUAL');

  it('linguagemV2 limpa (como estão e preenchidos)', () => {
    expect(todas.length).toBeGreaterThan(8);
    for (const [c, t] of todas) {
      expect(encontrarProibidasV2(t), c).toEqual([]);
      expect(encontrarProibidasV2(textoVisual(t, PREENCHER)), c).toEqual([]);
    }
  });

  it('nenhum termo em inglês de avaliação ou chamada à ação', () => {
    for (const [c, t] of todas)
      for (const termo of TERMOS_EN_PROIBIDOS)
        expect(new RegExp(`\\b${termo}\\b`, 'i').test(t), `${c}: ${termo}`).toBe(false);
  });

  it('rótulos do HTML do Pedro', () => {
    expect(TEXTOS_VISUAL.pares.titulo).toBe('Comparação com pares do setor');
    expect(TEXTOS_VISUAL.eventos.hint).toBe('vai para a sua Agenda');
    expect(TEXTOS_VISUAL.quadro.filtros).toBe('Filtros de fundamentos');
    expect(textoVisual(TEXTOS_VISUAL.pares.ativo, PREENCHER)).toBe('WEGE3 · WEG');
  });
});
