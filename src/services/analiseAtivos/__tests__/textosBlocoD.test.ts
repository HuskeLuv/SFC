import { describe, expect, it } from 'vitest';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { RODAPE_CENARIOS, TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { TEXTOS_ANALISE, formatarTexto } from '@/services/analiseAtivos/textos';
import { PLACEHOLDERS_PERMITIDOS } from '@/services/analiseAtivos/textosTela';
import {
  PALAVRAS_PROIBIDAS_BLOCO_D,
  PLACEHOLDERS_BLOCO_D,
  encontrarPalavrasProibidasBlocoD,
  folhasTexto,
} from '@/services/analiseAtivos/regras/comum/varreduraTextos';

const OBJETOS = {
  TEXTOS_RAIO_X,
  TEXTOS_CENARIOS,
  TEXTOS_COMPARADOR,
  TEXTOS_ENTRADAS_COMPARADOR,
} as const;

const TODAS = Object.entries(OBJETOS).flatMap(([nome, obj]) => folhasTexto(obj, nome));
const PERMITIDOS: readonly string[] = [...PLACEHOLDERS_PERMITIDOS, ...PLACEHOLDERS_BLOCO_D];

describe('textos do bloco D', () => {
  it('os 4 objetos têm textos (sanidade da varredura)', () => {
    for (const [nome, obj] of Object.entries(OBJETOS)) {
      expect(folhasTexto(obj).length, nome).toBeGreaterThan(10);
    }
  });

  it('lista do bloco D inclui a da Fase 1 (com nota/notas) e o vocabulário de placar', () => {
    for (const p of ['nota', 'notas', 'preço justo', 'barato', 'caro']) {
      expect(PALAVRAS_PROIBIDAS_BLOCO_D).toContain(p);
    }
    for (const p of ['melhor', 'vencedor', 'teto', 'margem de segurança', 'comprar', 'ranking']) {
      expect(PALAVRAS_PROIBIDAS_BLOCO_D).toContain(p);
    }
  });

  it('a varredura casa palavra inteira, sem acento nem maiúscula', () => {
    expect(encontrarPalavrasProibidasBlocoD('Veja as Notas do ativo')).toEqual(['notas']);
    expect(encontrarPalavrasProibidasBlocoD('o MELHOR ativo')).toEqual(['melhor']);
    expect(encontrarPalavrasProibidasBlocoD('Preço-teto de Bazin')).toEqual(
      expect.arrayContaining(['teto', 'preço-teto']),
    );
    expect(encontrarPalavrasProibidasBlocoD('Margem de seguranca de 20%')).toEqual([
      'margem de segurança',
    ]);
    expect(encontrarPalavrasProibidasBlocoD('Recomendação de compra')).toEqual(
      expect.arrayContaining(['recomendação', 'compra']),
    );
    // não casa pedaços de palavra nem a margem do slider
    expect(encontrarPalavrasProibidasBlocoD('anotação, notável, compras')).toEqual([]);
    expect(encontrarPalavrasProibidasBlocoD('Margem que você exige')).toEqual([]);
    expect(encontrarPalavrasProibidasBlocoD('potencialmente')).toEqual([]);
  });

  it('nenhuma palavra proibida do bloco D em nenhuma folha dos 4 objetos', () => {
    const achados = TODAS.map(([k, v]) => [k, encontrarPalavrasProibidasBlocoD(v)] as const).filter(
      ([, p]) => p.length > 0,
    );
    expect(achados).toEqual([]);
  });

  it('nunca "Notas" como rótulo; o bloco final se chama "Sobre os dados"', () => {
    expect(TODAS.filter(([, v]) => /\bnotas?\b/i.test(v))).toEqual([]);
    expect(TEXTOS_RAIO_X.sobreOsDados.titulo).toBe('Sobre os dados');
    expect(TEXTOS_RAIO_X.csv.sobreOsDados).toBe('Sobre os dados');
  });

  it('placeholders: só os permitidos e todos preenchidos por formatarTexto', () => {
    const vars = Object.fromEntries(PERMITIDOS.map((p) => [p, 'X']));
    for (const [k, v] of TODAS) {
      for (const m of v.matchAll(/\{(\w+)\}/g)) {
        expect(PERMITIDOS, `${k}: {${m[1]}}`).toContain(m[1]);
      }
      expect(formatarTexto(v, vars), k).not.toMatch(/[{}]/);
    }
  });

  it('decisão 14: rodapé dos cenários é o rodapeValuation literal (fora da varredura)', () => {
    expect(RODAPE_CENARIOS).toBe(TEXTOS_ANALISE.rodapeValuation);
    expect(TODAS.map(([, v]) => v)).not.toContain(TEXTOS_ANALISE.rodapeValuation);
  });

  it('decisão 3: linha da taxa de adm. do FII no Raio-X com o rótulo "% do PL no ano"', () => {
    expect(TEXTOS_RAIO_X.linhas.taxaAdmAnoPct.rotulo).toBe('Taxa de adm. (% do PL no ano)');
    expect(TEXTOS_RAIO_X.linhas.taxaAdmAnoPct.sub).toContain('12 meses');
  });

  it('decisão 4: sem inadimplência, prazo médio, vencimentos nem indexadores no Raio-X', () => {
    const raioX = folhasTexto(TEXTOS_RAIO_X).map(([, v]) => v.toLowerCase());
    for (const termo of ['inadimpl', 'prazo médio', 'vencimento', 'indexador']) {
      expect(
        raioX.filter((v) => v.includes(termo)),
        termo,
      ).toEqual([]);
    }
  });

  it('decisão 9: Resumo sem placar (sem "maior", sem contagem de ★)', () => {
    const resumo = folhasTexto(TEXTOS_COMPARADOR.resumo).map(([, v]) => v);
    expect(resumo.filter((v) => /\bmaior\b|★/i.test(v))).toEqual([]);
    expect(TEXTOS_COMPARADOR.resumo.responsabilidade).toContain('Não indicam qual ativo escolher');
  });

  it('★ sempre acompanhado de texto ("destaque")', () => {
    expect(TEXTOS_COMPARADOR.destaque.rotulo).toBe('destaque');
    expect(TEXTOS_COMPARADOR.destaque.srOnly).toMatch(/^destaque: /);
  });
});
