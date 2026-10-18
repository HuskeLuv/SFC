import { describe, expect, it } from 'vitest';
import {
  DISCLAIMER_DESEMPENHO,
  RODAPE_CENARIOS_V2,
  RODAPE_LEGAL_V2,
  TEXTOS_LITERAIS_OBRIGATORIOS,
  ehTextoLiteral,
  literaisProvisorios,
  normalizarEspacos,
  textoLiteral,
} from '@/services/analiseAtivos/textosLiterais';
import { TEXTOS_ANALISE } from '@/services/analiseAtivos/textos';

/** data-texto-legal combinados com o designer (design.especificacao_visual). */
const IDS_DO_DESIGN = [
  'rodape-quadro',
  'rodape-cenarios',
  'leitura-dos-dados',
  'aviso-banner',
  'aviso-legal-v2',
];

describe('TEXTOS_LITERAIS_OBRIGATORIOS', () => {
  const lista = Object.values(TEXTOS_LITERAIS_OBRIGATORIOS);

  it('cada literal tem id = chave, texto e a origem na spec/decisão', () => {
    for (const [chave, l] of Object.entries(TEXTOS_LITERAIS_OBRIGATORIOS)) {
      expect(l.id).toBe(chave);
      expect(l.texto.length).toBeGreaterThan(20);
      expect(l.texto).toBe(normalizarEspacos(l.texto));
      expect(l.origem).toMatch(/^(spec v2\.4 §\d|recomendação \d)/);
    }
  });

  it('cobre os ids de data-texto-legal do design (instrução do comparador por classe)', () => {
    for (const id of IDS_DO_DESIGN) expect(textoLiteral(id), id).toBeDefined();
    expect(textoLiteral('instrucao-comparador-acoes')).toContain('sem ranking nem destaque');
    expect(textoLiteral('instrucao-comparador-fiis')).toContain('Compare até 4 FIIs');
    expect(textoLiteral('inexistente')).toBeUndefined();
  });

  it('os provisórios ficam listados (aviso legal v2, o selo e o aviso dos alertas, para o jurídico)', () => {
    expect(literaisProvisorios()).toEqual([
      'aviso-legal-v2',
      'aviso-legal-v2-selo',
      'aviso-salvos-alertas',
      'aviso-legal-eua',
    ]);
    expect(RODAPE_LEGAL_V2.provisorio).toBe(true);
    expect(lista.filter((l) => l.provisorio).length).toBe(4);
  });

  it('bloco 1: aviso dos alertas literal, sem compra nem recomendação', () => {
    expect(textoLiteral('aviso-salvos-alertas')).toBe(
      'Os avisos trazem só fatos publicados (entregas à CVM e proventos anunciados). Não são análise nem indicação de investimento.',
    );
    expect(textoLiteral('aviso-salvos-alertas')).not.toMatch(/compra|recomend/i);
  });

  it('aviso legal v2 adaptado à D5: sem ranking, notas, teses públicas nem SEC', () => {
    expect(RODAPE_LEGAL_V2.texto).not.toMatch(/ranking|notas|teses|SEC|10-K/);
    expect(RODAPE_LEGAL_V2.texto).not.toMatch(/Índice MF/);
    expect(RODAPE_LEGAL_V2.texto).toContain('Rentabilidade passada não é garantia');
  });

  it('textos exigidos pela spec (literais)', () => {
    expect(textoLiteral('rodape-quadro')).toContain(
      'atender a mais critérios não significa ser melhor investimento',
    );
    expect(textoLiteral('leitura-dos-dados')).toContain('Não há ranking, nota ou ativo "vencedor"');
    expect(DISCLAIMER_DESEMPENHO.texto).toBe(
      'Rentabilidade passada não é garantia de resultados futuros.',
    );
    // o rodapé dos cenários é o mesmo literal de hoje (a C2 só troca a origem)
    expect(RODAPE_CENARIOS_V2.texto).toBe(TEXTOS_ANALISE.rodapeValuation);
  });

  it('ehTextoLiteral: casamento exato da string inteira (só espaços colapsados)', () => {
    expect(ehTextoLiteral(DISCLAIMER_DESEMPENHO.texto)).toBe(true);
    expect(ehTextoLiteral(`  ${DISCLAIMER_DESEMPENHO.texto}\n`)).toBe(true);
    expect(ehTextoLiteral(DISCLAIMER_DESEMPENHO.texto.toUpperCase())).toBe(false);
    expect(ehTextoLiteral(`${DISCLAIMER_DESEMPENHO.texto} Sempre.`)).toBe(false);
    expect(ehTextoLiteral('Rentabilidade passada')).toBe(false);
  });

  it('o registro é imutável', () => {
    expect(Object.isFrozen(TEXTOS_LITERAIS_OBRIGATORIOS)).toBe(true);
  });
});
