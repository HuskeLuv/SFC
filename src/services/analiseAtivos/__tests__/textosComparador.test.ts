/**
 * Textos do Comparador e das entradas do Comparador (v2.4, fatia D). Varredura linguagemV2 com os
 * literais registrados (TEXTOS_LITERAIS_OBRIGATORIOS) como única exceção: sem ★, "destaque",
 * Índice, nota, ranking, vencedor, melhor/pior, falta(m), compre/venda, recomend*.
 */
import { describe, expect, it } from 'vitest';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { PLACEHOLDERS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import {
  INSTRUCAO_COMPARADOR_ACOES,
  INSTRUCAO_COMPARADOR_FIIS,
  LEITURA_DOS_DADOS,
  ehTextoLiteral,
} from '@/services/analiseAtivos/textosLiterais';
import { PLACEHOLDERS_PERMITIDOS } from '@/services/analiseAtivos/textosTela';
import { encontrarProibidasV2 } from '@/services/analiseAtivos/regras/comum/linguagemV2';
import {
  PLACEHOLDERS_BLOCO_D,
  folhasTexto,
} from '@/services/analiseAtivos/regras/comum/varreduraTextos';

const OBJETOS = { TEXTOS_COMPARADOR, TEXTOS_ENTRADAS_COMPARADOR } as const;
const TODAS = Object.entries(OBJETOS).flatMap(([nome, obj]) => folhasTexto(obj, nome));
const PERMITIDOS: readonly string[] = [
  ...PLACEHOLDERS_PERMITIDOS,
  ...PLACEHOLDERS_BLOCO_D,
  ...PLACEHOLDERS_CRITERIOS,
];

describe('textos do comparador (v2.4, linguagemV2)', () => {
  it('os 2 objetos têm textos (sanidade da varredura)', () => {
    for (const [nome, obj] of Object.entries(OBJETOS)) {
      expect(folhasTexto(obj).length, nome).toBeGreaterThan(10);
    }
  });

  it('nenhuma palavra proibida da v2.4 em nenhuma folha (literais registrados à parte)', () => {
    const achados = TODAS.map(
      ([k, v]) => [k, encontrarProibidasV2(v, { ignorarLiterais: true })] as const,
    ).filter(([, p]) => p.length > 0);
    expect(achados).toEqual([]);
  });

  it('nenhuma folha é um literal registrado (os literais vêm de textosLiterais, nunca copiados)', () => {
    expect(TODAS.filter(([, v]) => ehTextoLiteral(v))).toEqual([]);
  });

  it('os literais do Comparador estão registrados e só citam termos proibidos na negativa', () => {
    for (const lit of [INSTRUCAO_COMPARADOR_ACOES, INSTRUCAO_COMPARADOR_FIIS, LEITURA_DOS_DADOS]) {
      expect(ehTextoLiteral(lit.texto)).toBe(true);
      // sem a exceção, a varredura acusa (prova de que a exceção é a única porta)
      expect(encontrarProibidasV2(lit.texto).length).toBeGreaterThan(0);
      expect(encontrarProibidasV2(lit.texto, { ignorarLiterais: true })).toEqual([]);
    }
    expect(INSTRUCAO_COMPARADOR_ACOES.id).toBe('instrucao-comparador-acoes');
    expect(INSTRUCAO_COMPARADOR_FIIS.id).toBe('instrucao-comparador-fiis');
    expect(LEITURA_DOS_DADOS.id).toBe('leitura-dos-dados');
  });

  it('nunca "Notas"/"nota", ★ nem "destaque" em nenhuma folha', () => {
    expect(TODAS.filter(([, v]) => /\bnotas?\b|★|destaque/i.test(v))).toEqual([]);
  });

  it('sem chaves de placar no objeto (★, destaque, Índice, resumo com índices)', () => {
    const caminhos = TODAS.map(([k]) => k);
    expect(caminhos.filter((k) => /destaque|indice|semDestaque/i.test(k))).toEqual([]);
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

  it('misto: texto do protótipo final (Obrigações/PL num grupo comum)', () => {
    expect(TEXTOS_COMPARADOR.misto.titulo).toBe(
      'Você está comparando FIIs de tijolo com FIIs de papel.',
    );
    expect(TEXTOS_COMPARADOR.misto.texto).toContain('Obrigações/PL fica num grupo comum');
  });
});
