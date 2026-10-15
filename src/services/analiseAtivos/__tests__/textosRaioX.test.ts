/**
 * Textos do Raio-X (Bloco D) + regras comuns da varredura do Bloco D. Dividido de
 * textosBlocoD.test.ts na fatia 0 da v2.4 (mesmas asserções). Sem dono depois da fatia 0: a F só lê.
 */
import { describe, expect, it } from 'vitest';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { PLACEHOLDERS_PERMITIDOS } from '@/services/analiseAtivos/textosTela';
import {
  PALAVRAS_PROIBIDAS_BLOCO_D,
  PLACEHOLDERS_BLOCO_D,
  encontrarPalavrasProibidasBlocoD,
  folhasTexto,
} from '@/services/analiseAtivos/regras/comum/varreduraTextos';

const TODAS = folhasTexto(TEXTOS_RAIO_X, 'TEXTOS_RAIO_X');
const PERMITIDOS: readonly string[] = [...PLACEHOLDERS_PERMITIDOS, ...PLACEHOLDERS_BLOCO_D];

describe('textos do Raio-X (bloco D)', () => {
  it('o objeto tem textos (sanidade da varredura)', () => {
    expect(folhasTexto(TEXTOS_RAIO_X).length).toBeGreaterThan(10);
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

  it('nenhuma palavra proibida do bloco D em nenhuma folha', () => {
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
});
