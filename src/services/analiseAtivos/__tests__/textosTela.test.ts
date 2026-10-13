import { describe, it, expect } from 'vitest';
import {
  PLACEHOLDERS_PERMITIDOS,
  TEXTOS_TELA,
  formatarTexto,
  motivoTela,
  textoMotivo,
  textoNaoSeAplica,
} from '@/services/analiseAtivos/textosTela';
import { TEXTOS_ANALISE, encontrarPalavrasProibidas } from '@/services/analiseAtivos/textos';
import { DEF_GRUPO, GRUPOS_CONFERENCIA } from '@/services/analiseAtivos/regras/comum/conferencia';

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

  it('nunca "comprar", "recomendação", "nota", Índice MF nem semáforo (v2.4)', () => {
    const proibidas = /\b(comprar?|compre|recomenda\w*|nota)\b|Índice MF|sem[áa]foro/i;
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

  it('v2.4: sem o rodapé legal antigo nem as chaves do indicador antigo', async () => {
    const mod: Record<string, unknown> = await import('@/services/analiseAtivos/textosTela');
    expect(mod.RODAPE_LEGAL).toBeUndefined();
    expect(mod.motivosEstadoIndice).toBeUndefined();
    expect(mod.textoZeroRegra).toBeUndefined();
    const chaves = TODAS.map(([k]) => k);
    for (const k of [
      'indice.nome',
      'area.subtitulo',
      'blocos.indice',
      'quadro.colunas.indiceMf',
      'quadro.formulaRotulo',
      'busca.indiceCurto',
      'ativo.indiceTitulo',
      'analise.pares.notaIncompleto',
      'conferencia.porQue.noIndice',
      'conferencia.porQue.efeitoIndice',
      'conferencia.porQue.semEfeitoIndice',
      'naCarteira.quantoFalta',
      'naCarteira.faltamParaObjetivo',
      'naCarteira.faltaPlanejado',
    ]) {
      expect(chaves, k).not.toContain(k);
    }
  });

  it('relatos antigos do indicador antigo aparecem como "indicador descontinuado"', () => {
    expect(TEXTOS_TELA.relatos.campos.indiceMf).toBe('indicador descontinuado');
    expect(TEXTOS_TELA.relatos.campos.criterioSemaforo).toBe('indicador descontinuado');
    expect(TEXTOS_TELA.relatos.descontinuado).toBe('indicador descontinuado');
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

  it('não se aplica', () => {
    expect(textoNaoSeAplica('financeira')).toBe(TEXTOS_ANALISE.motivosNaoSeAplica.financeira);
    expect(textoNaoSeAplica('fof')).toBe('não se aplica a fundo de fundos');
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

describe('textosTela — bloco C (conferência, relatos e curadoria)', () => {
  const FOLHAS_C = [
    ...folhas(TEXTOS_TELA.conferencia, 'conferencia'),
    ...folhas(TEXTOS_TELA.relatos, 'relatos'),
    ...folhas(TEXTOS_TELA.curadoria, 'curadoria'),
  ];

  it('varredura de compliance nas folhas novas (e nunca "nota")', () => {
    expect(FOLHAS_C.length).toBeGreaterThan(150);
    const achados = FOLHAS_C.map(([k, v]) => [k, encontrarPalavrasProibidas(v)] as const).filter(
      ([, p]) => p.length > 0,
    );
    expect(achados).toEqual([]);
    expect(FOLHAS_C.filter(([, v]) => /\bnotas?\b/i.test(v))).toEqual([]);
  });

  it('todo grupo × regra de DEF_GRUPO tem motivo próprio', () => {
    for (const g of GRUPOS_CONFERENCIA) {
      for (const r of DEF_GRUPO[g].regras) {
        expect(TEXTOS_TELA.conferencia.motivos[`${g}:${r}`], `${g}:${r}`).toBeTruthy();
      }
    }
  });

  it('nomes aprovados: "Reportar dado incorreto", "relato", "Conferido, sem alteração"', () => {
    expect(TEXTOS_TELA.relatos.menu.reportar).toBe('Reportar dado incorreto');
    expect(TEXTOS_TELA.relatos.nome).toBe('relato');
    expect(TEXTOS_TELA.relatos.meus.status.conferido_sem_alteracao).toBe(
      'Conferido, sem alteração',
    );
  });

  it('motivos de componentes em conferência', () => {
    expect(textoMotivo('preco:em_conferencia')).toBe('preço e múltiplos em conferência');
    expect(textoMotivo('divida:em_conferencia')).toBe('dívida em conferência');
    // o legado de proventos não muda
    expect(textoMotivo('div:em_conferencia')).toBe('proventos em conferência');
  });
});
