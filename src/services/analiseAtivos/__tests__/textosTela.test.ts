import { describe, it, expect } from 'vitest';
import {
  PLACEHOLDERS_PERMITIDOS,
  RODAPE_LEGAL,
  TEXTOS_TELA,
  formatarTexto,
  motivoTela,
  motivosEstadoIndice,
  textoMotivo,
  textoNaoSeAplica,
  textoZeroRegra,
} from '@/services/analiseAtivos/textosTela';
import { TEXTOS_ANALISE, encontrarPalavrasProibidas } from '@/services/analiseAtivos/textos';

function folhas(obj: unknown, caminho = ''): Array<[string, string]> {
  if (typeof obj === 'string') return [[caminho, obj]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => folhas(v, `${caminho}[${i}]`));
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) => folhas(v, caminho ? `${caminho}.${k}` : k));
  }
  return [];
}

const TODAS = folhas(TEXTOS_TELA);

describe('textosTela', () => {
  it('tem textos (sanidade da varredura)', () => {
    expect(TODAS.length).toBeGreaterThan(150);
  });

  it('nenhuma palavra proibida em nenhuma folha', () => {
    const achados = TODAS.map(([k, v]) => [k, encontrarPalavrasProibidas(v)] as const).filter(
      ([, p]) => p.length > 0,
    );
    expect(achados).toEqual([]);
  });

  it('nunca "comprar", "recomendação" nem "nota" (fora do rodapé legal)', () => {
    const proibidas = /\b(comprar?|compre|recomenda\w*|nota)\b/i;
    expect(TODAS.filter(([, v]) => proibidas.test(v))).toEqual([]);
  });

  it('placeholders: só nomes permitidos e todos preenchidos por formatarTexto', () => {
    const vars = Object.fromEntries(PLACEHOLDERS_PERMITIDOS.map((p) => [p, 'X']));
    for (const [k, v] of TODAS) {
      const nomes = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const n of nomes) {
        expect(PLACEHOLDERS_PERMITIDOS as readonly string[], `${k}: {${n}}`).toContain(n);
      }
      expect(formatarTexto(v, vars), k).not.toMatch(/[{}]/);
    }
  });

  it('rodapé legal da Fase 1: base CVM, sem ranking nem notas, passa na varredura', () => {
    expect(RODAPE_LEGAL).toContain('Resolução CVM 20/2021');
    expect(RODAPE_LEGAL).not.toMatch(/ranking|\bnotas?\b/i);
    expect(encontrarPalavrasProibidas(RODAPE_LEGAL)).toEqual([]);
  });

  it('motivos da spec', () => {
    expect(textoMotivo('div:fonte_defasada')).toBe('proventos em conferência');
    expect(textoMotivo('lucro:fonte_defasada')).toBe('lucro do último exercício em conferência');
    expect(textoMotivo('preco:historico_curto')).toBe('histórico de preço com menos de 5 anos');
    expect(textoMotivo('lucro:sem_dado_fonte')).toBe('lucro sem dado estruturado na CVM');
    expect(textoMotivo('acoes:salto_sem_evento')).toBe('nº de ações em conferência');
    expect(textoMotivo('tipo:indefinido')).toBe('tipo do fundo indefinido pela composição');
    expect(textoMotivo('preco:sem_acoes')).toBe('nº de ações indisponível');
    // sufixo conhecido e desconhecido
    expect(textoMotivo('rent:fonte_falhou')).toBe('fonte indisponível no último processamento');
    expect(textoMotivo('xyz:inexistente')).toBe('dado em conferência');
    expect(motivoTela('div:fonte_defasada')).toEqual({
      codigo: 'div:fonte_defasada',
      texto: 'proventos em conferência',
    });
  });

  it('zero pela regra, não se aplica e estados sem número', () => {
    expect(textoZeroRegra('lucro:prejuizo')).toBe(
      'Componente zerado pela regra: prejuízo no último exercício',
    );
    expect(textoZeroRegra('preco:pl_negativo')).toBe(
      'Componente zerado pela regra: patrimônio líquido negativo',
    );
    expect(textoNaoSeAplica('financeira')).toBe(TEXTOS_ANALISE.motivosNaoSeAplica.financeira);
    expect(motivosEstadoIndice('sem_score')[0].texto).toBe(
      'Índice MF não calculado para este fundo nesta data',
    );
    expect(motivosEstadoIndice('fora_do_indice')[0].texto).toBe('fora do Índice MF nesta fase');
    expect(motivosEstadoIndice('calculado')).toEqual([]);
  });

  it('textos obrigatórios da decisão (ações, tese, beta)', () => {
    expect(TEXTOS_TELA.acoes.registrar).toBe('Registrar operação');
    expect(TEXTOS_TELA.acoes.planejar).toBe('Planejar na Carteira');
    expect(TEXTOS_TELA.tese.privada).toBe('Privada: só você vê');
    expect(TEXTOS_TELA.tese.pessoal).toBe('A tese é pessoal de cada usuário');
    expect(TEXTOS_TELA.foraDoQuadro.sem_negociacao_30).toBe(
      'sem negociação nos últimos 30 pregões',
    );
    expect(TEXTOS_TELA.foraDoBeta.titulo).toMatch(/teste com um grupo pequeno/);
  });
});
