/**
 * Caso 32, varredura GLOBAL de linguagem (v2.4, fatia F): TODAS as folhas de texto de TODOS os
 * módulos de textos da área passam pelo linguagemV2 (lista do Bloco D + o vocabulário que a v2.4
 * retira da superfície: Índice, semáforo, destaque, vencedor, melhor/pior, falta(m), ★, recomend*…).
 *
 * Exceções FECHADAS (as do linguagemV2): só strings EXATAMENTE iguais a um literal de
 * TEXTOS_LITERAIS_OBRIGATORIOS ({ ignorarLiterais: true }) e TEXTOS_OPERACAO, varrido com a lista
 * de operação (sem compra/venda). Nenhuma outra lista branca.
 *
 * Placeholders ({ticker}, {valor}…) são varridos como estão e também preenchidos, para que uma
 * frase montada não forme palavra proibida.
 */
import { describe, expect, it } from 'vitest';
import {
  encontrarProibidasOperacao,
  encontrarProibidasV2,
} from '@/services/analiseAtivos/regras/comum/linguagemV2';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_ANALISE } from '@/services/analiseAtivos/textos';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import { TEXTOS_QUADRO } from '@/services/analiseAtivos/textosQuadro';
import { TEXTOS_ATIVO } from '@/services/analiseAtivos/textosAtivo';
import {
  ROTULOS_SECAO,
  TEXTOS_ACOES_CARTEIRA,
  TEXTOS_OPERACAO,
} from '@/services/analiseAtivos/textosAcoesCarteira';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { RODAPE_CENARIOS, TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { TEXTOS_LITERAIS_OBRIGATORIOS } from '@/services/analiseAtivos/textosLiterais';
import { TEXTOS_FILA } from '@/components/admin/curadoria/marcasCaso';

type Folha = [caminho: string, texto: string];

function folhas(obj: unknown, caminho: string): Folha[] {
  if (typeof obj === 'string') return [[caminho, obj]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => folhas(v, `${caminho}[${i}]`));
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) => folhas(v, `${caminho}.${k}`));
  }
  return [];
}

/** Todos os módulos de textos da área (exceto TEXTOS_OPERACAO, com lista própria). */
const MODULOS: Record<string, unknown> = {
  TEXTOS_TELA,
  TEXTOS_ANALISE,
  TEXTOS_CRITERIOS,
  TEXTOS_QUADRO,
  TEXTOS_ATIVO,
  TEXTOS_ACOES_CARTEIRA,
  ROTULOS_SECAO,
  TEXTOS_COMPARADOR,
  TEXTOS_ENTRADAS_COMPARADOR,
  TEXTOS_CENARIOS,
  RODAPE_CENARIOS,
  TEXTOS_RAIO_X,
  TEXTOS_FILA,
};

const TODAS: Folha[] = Object.entries(MODULOS).flatMap(([nome, m]) => folhas(m, nome));
const OPERACAO: Folha[] = folhas(TEXTOS_OPERACAO, 'TEXTOS_OPERACAO');

/** Valores de exemplo para os placeholders (neutros). */
const VARS: Record<string, string> = {
  ticker: 'WEGE3',
  valor: '12,3',
  n: '4',
  total: '6',
  max: '4',
  anos: '5',
  ano: '2025',
  data: '29/09',
  hora: '10:40',
  aba: 'Ações',
  classe: 'ações',
  campo: 'Payout',
  bloco: 'Indicadores',
};
const preencher = (t: string) => t.replace(/\{(\w+)\}/g, (m, k: string) => VARS[k] ?? 'X');

describe('linguagemV2Global — todos os módulos de textos da área', () => {
  it('há textos de todos os módulos (sanidade da varredura)', () => {
    for (const nome of Object.keys(MODULOS)) {
      expect(
        TODAS.filter(([c]) => c.startsWith(`${nome}.`) || c === nome).length,
        nome,
      ).toBeGreaterThan(0);
    }
    expect(TODAS.length).toBeGreaterThan(900);
    expect(OPERACAO.length).toBeGreaterThan(0);
  });

  it('nenhuma palavra proibida fora dos literais registrados (lista branca vazia)', () => {
    const achados = TODAS.flatMap(([c, t]) => {
      const p = [
        ...encontrarProibidasV2(t, { ignorarLiterais: true }),
        ...encontrarProibidasV2(preencher(t), { ignorarLiterais: true }),
      ];
      return p.length ? [`${c}: ${[...new Set(p)].join(', ')} — "${t.slice(0, 70)}"`] : [];
    });
    expect(achados).toEqual([]);
  });

  it('TEXTOS_OPERACAO: lista de operação (compra/venda liberados, o resto não)', () => {
    const achados = OPERACAO.flatMap(([c, t]) => {
      const p = encontrarProibidasOperacao(preencher(t));
      return p.length ? [`${c}: ${p.join(', ')}`] : [];
    });
    expect(achados).toEqual([]);
  });

  it('os literais pulados são EXATAMENTE os registrados (uma palavra a mais é acusada)', () => {
    const literais = new Set(Object.values(TEXTOS_LITERAIS_OBRIGATORIOS).map((l) => l.texto));
    const pulados = TODAS.filter(
      ([, t]) =>
        encontrarProibidasV2(t).length > 0 &&
        encontrarProibidasV2(t, { ignorarLiterais: true }).length === 0,
    );
    for (const [c, t] of pulados) expect(literais.has(t.trim()), c).toBe(true);
    const algum = [...literais][0];
    expect(encontrarProibidasV2(`${algum} melhor`, { ignorarLiterais: true })).not.toEqual([]);
  });

  it('nada do indicador antigo em nenhum texto: Índice MF, semáforo, ★, nota', () => {
    const achados = TODAS.filter(([, t]) =>
      /Índice MF|sem[áa]foro|★|\bnotas?\b/i.test(t.replace(/\bAnotação\b/g, '')),
    )
      .filter(([, t]) => !Object.values(TEXTOS_LITERAIS_OBRIGATORIOS).some((l) => l.texto === t))
      .map(([c, t]) => `${c}: ${t.slice(0, 70)}`);
    expect(achados).toEqual([]);
  });
});
