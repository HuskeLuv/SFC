import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDERS_QUADRO,
  TEXTOS_QUADRO,
  formatarTexto,
  textoContadorQuadro,
} from '@/services/analiseAtivos/textosQuadro';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { folhasTexto } from '@/services/analiseAtivos/regras/comum/varreduraTextos';
import { RODAPE_QUADRO, ehTextoLiteral } from '@/services/analiseAtivos/textosLiterais';

const FOLHAS = folhasTexto(TEXTOS_QUADRO, 'TEXTOS_QUADRO');

describe('textosQuadro', () => {
  it('nenhuma palavra proibida (linguagemV2) em nenhuma folha', () => {
    const achados = FOLHAS.map(([k, v]) => [k, encontrarProibidasV2(v)] as const).filter(
      ([, p]) => p.length > 0,
    );
    expect(achados).toEqual([]);
  });

  it('nenhuma folha é um literal jurídico (eles ficam só em textosLiterais)', () => {
    expect(FOLHAS.filter(([, v]) => ehTextoLiteral(v))).toEqual([]);
  });

  it('o rodapé do Quadro só passa por ser literal registrado', () => {
    expect(encontrarProibidasV2(RODAPE_QUADRO.texto).length).toBeGreaterThan(0);
    expect(encontrarProibidasV2(RODAPE_QUADRO.texto, { ignorarLiterais: true })).toEqual([]);
  });

  it('placeholders: só os permitidos e todos preenchidos', () => {
    const vars = Object.fromEntries(PLACEHOLDERS_QUADRO.map((p) => [p, 'X']));
    for (const [k, v] of FOLHAS) {
      for (const m of v.matchAll(/\{(\w+)\}/g)) {
        expect(PLACEHOLDERS_QUADRO as readonly string[], `${k}: {${m[1]}}`).toContain(m[1]);
      }
      expect(formatarTexto(v, vars), k).not.toMatch(/[{}]/);
    }
  });

  it('subtítulo sem o indicador antigo', () => {
    expect(TEXTOS_QUADRO.subtitulo).not.toMatch(/Índice|MF\b/);
    expect(TEXTOS_QUADRO.metaDescricao).not.toMatch(/Índice/);
  });

  it('contador: "X de N" sem critério; "X de N atendem a k critérios em J anos" com', () => {
    expect(textoContadorQuadro({ n: 22, total: 312, criterios: 0, janela: 5 })).toBe('22 de 312');
    expect(textoContadorQuadro({ n: 22, total: 312, criterios: 3, janela: 5 })).toBe(
      '22 de 312 atendem a 3 critérios em 5 anos',
    );
    expect(textoContadorQuadro({ n: 40, total: 355, criterios: 1, janela: 10 })).toBe(
      '40 de 355 atendem a 1 critério em 10 anos',
    );
  });
});
