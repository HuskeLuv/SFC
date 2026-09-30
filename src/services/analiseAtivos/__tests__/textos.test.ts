/**
 * Varredura de linguagem nos textos centrais (regra 9 do relatório da Fase A + caso 23 da §4.6 + §9).
 * Nenhuma palavra proibida em TEXTOS_ANALISE, exceto nas chaves de EXCECOES_TEXTO_FIXO (rodapé legal e
 * do Valuation, exigidos pela spec). O Índice nunca é "nota" (decisão 24).
 */
import { describe, expect, it } from 'vitest';
import {
  EXCECOES_TEXTO_FIXO,
  PALAVRAS_PROIBIDAS,
  TEXTOS_ANALISE,
  encontrarPalavrasProibidas,
  formatarTexto,
  textoLeituraSemaforo,
  textoStatusBarra,
} from '@/services/analiseAtivos/textos';

function folhas(obj: unknown, caminho: string[] = []): Array<{ caminho: string; texto: string }> {
  if (typeof obj === 'string') return [{ caminho: caminho.join('.'), texto: obj }];
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      folhas(v, [...caminho, k]),
    );
  }
  return [];
}

const excecoes = new Set<string>(EXCECOES_TEXTO_FIXO);
const todas = folhas(TEXTOS_ANALISE);
const varridas = todas.filter((f) => !excecoes.has(f.caminho.split('.')[0]));

describe('textos centrais — linguagem', () => {
  it('há textos para varrer e a lista proibida é a da spec (§4.5, §9, decisão 24)', () => {
    expect(varridas.length).toBeGreaterThan(60);
    for (const p of [
      'preço justo',
      'preço-alvo',
      'barato',
      'caro',
      'desconto',
      'oportunidade',
      'nota',
    ]) {
      expect(PALAVRAS_PROIBIDAS).toContain(p);
    }
  });

  it('nenhuma palavra proibida fora das exceções fixas', () => {
    const achados = varridas
      .map((f) => ({ ...f, proibidas: encontrarPalavrasProibidas(f.texto) }))
      .filter((f) => f.proibidas.length > 0);
    expect(achados).toEqual([]);
  });

  it('também nas frases montadas (templates preenchidos) e nos status da barra', () => {
    const vars = {
      valor: '12,3',
      referencia: '15',
      n: 10,
      min: 5,
      atendidos: 3,
      aplicaveis: 4,
      padrao: 'BRGAAP',
    };
    for (const f of varridas) {
      const montado = formatarTexto(f.texto, vars);
      expect(encontrarPalavrasProibidas(montado)).toEqual([]);
      expect(montado).not.toMatch(/\{\w+\}/);
    }
    const status = [
      textoStatusBarra({ tipo: 'variacao_pct', valor: 40 }, 10),
      textoStatusBarra({ tipo: 'variacao_pp', valor: -4.3 }, 10),
      textoStatusBarra({ tipo: 'acima', extremo: 'maior' }, 7),
      textoStatusBarra({ tipo: 'abaixo', extremo: 'menor' }, 10),
      textoStatusBarra({ tipo: 'na_media' }, 10),
    ];
    expect(status).toEqual([
      '+40% vs. média 10a',
      '−4,3 p.p. vs. média 10a',
      'acima da média 7a · maior em 7 anos',
      'abaixo da média 10a · menor em 10 anos',
      'na média de 10 anos',
    ]);
    for (const s of status) expect(encontrarPalavrasProibidas(s)).toEqual([]);
  });

  it('as exceções são só o rodapé legal e o do Valuation, e contêm o texto exigido pela spec', () => {
    expect([...EXCECOES_TEXTO_FIXO].sort()).toEqual(['rodapeLegal', 'rodapeValuation']);
    expect(TEXTOS_ANALISE.rodapeLegal).toContain('Resolução CVM 20/2021');
    expect(TEXTOS_ANALISE.rodapeValuation).toMatch(/não calcula .preço justo. nem preço-alvo/);
  });

  it('badge "Índice acima da comunidade" (nunca "nota"); leitura "n de m critérios"', () => {
    expect(TEXTOS_ANALISE.comunidade.indiceAcima).toBe('Índice acima da comunidade');
    expect(encontrarPalavrasProibidas(TEXTOS_ANALISE.comunidade.comunidadeAcima)).toEqual([]);
    expect(textoLeituraSemaforo(3, 4)).toBe('3 de 4 critérios atendidos');
    expect(TEXTOS_ANALISE.indice.nome).toBe('Índice MF');
  });

  it('rótulos da decisão 6/4/17: fonte CVM, critérios provisórios, data estimada; "Obrigações/PL" (decisão 7)', () => {
    expect(TEXTOS_ANALISE.selos.fonteCvm).toBe('fonte CVM · pode diferir do relatório do gestor');
    expect(TEXTOS_ANALISE.selos.criteriosProvisorios).toBe('critérios provisórios');
    expect(TEXTOS_ANALISE.selos.dataEstimada).toBe('data estimada');
    expect(TEXTOS_ANALISE.criterios.obrigacoes_pl).toBe('Obrigações/PL');
    const juntos = varridas.map((f) => f.texto.toLowerCase()).join(' ');
    expect(juntos).not.toMatch(/\bltv\b|alavancagem/);
  });

  it('a varredura casa palavra inteira: "anotação"/"notável"/"vendas" passam; "Nota"/"BARATO" não', () => {
    expect(encontrarPalavrasProibidas('anotação notável vendas Carolina')).toEqual([]);
    expect(encontrarPalavrasProibidas('Nota alta, ativo BARATO')).toEqual(['barato', 'nota']);
  });
});
