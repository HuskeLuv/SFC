import { describe, expect, it } from 'vitest';
import { hrefVoltarQuadro } from '@/components/analiseAtivos/shell/LinkVoltarQuadro';

describe('hrefVoltarQuadro (HTML do Pedro: volta ao Quadro como estava)', () => {
  it('reusa o Quadro guardado quando a classe é a do ativo', () => {
    expect(hrefVoltarQuadro('fii', 'classe=fii&c=vac,alav&ordem=dy&dir=desc', null)).toBe(
      '/analise-ativos?classe=fii&c=vac%2Calav&ordem=dy&dir=desc',
    );
    expect(hrefVoltarQuadro('acao', 'c=rec&modo=detalhado', null)).toBe(
      '/analise-ativos?c=rec&modo=detalhado',
    );
  });

  it('classe diferente (chegou pela busca) ou nada guardado: Quadro da classe do ativo', () => {
    expect(hrefVoltarQuadro('fii', 'c=rec', null)).toBe('/analise-ativos?classe=fii');
    expect(hrefVoltarQuadro('acao', 'classe=fii&c=vac', null)).toBe('/analise-ativos');
    expect(hrefVoltarQuadro('reit', null, null)).toBe('/analise-ativos?classe=reit');
    expect(hrefVoltarQuadro(null, null, null)).toBe('/analise-ativos');
  });

  it('a janela escolhida na página do ativo vence a guardada (5 = padrão, sai da URL)', () => {
    expect(hrefVoltarQuadro('acao', 'j=10&c=rec', '3')).toBe('/analise-ativos?j=3&c=rec');
    expect(hrefVoltarQuadro('acao', 'j=10&c=rec', '5')).toBe('/analise-ativos?c=rec');
    expect(hrefVoltarQuadro('acao', 'j=10', null)).toBe('/analise-ativos?j=10');
  });
});
