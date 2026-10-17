import { describe, expect, it } from 'vitest';
import {
  ALERTAS_PADRAO_LISTA,
  ANALISE_SALVOS_ALERTA_TYPE,
  AlertasLidosSchema,
  AlertasQuerySchema,
  ComparacaoPdfQuerySchema,
  ComparacaoPostSchema,
  EstadoFiltroSalvoV1Schema,
  FiltroPatchSchema,
  FiltroPostSchema,
  JANELA_AVISO_CRITERIOS,
  LIMITES_SALVOS,
  LinhasListaQuerySchema,
  ListaPatchSchema,
  ListaPostSchema,
  MENSAGEM_LISTAS_PESSOAIS,
  NOME_LISTA_PADRAO,
  RETENCAO_AVISOS_DIAS,
  ROTAS_SALVOS,
  SENTINELA_PADRAO,
  SalvosPutSchema,
  TICKER_RE_POR_CLASSE,
  TIPOS_AVISO,
  acaoDoSalvar,
  chaveComparacao,
  ehSentinelaPadrao,
  ehTickerValido,
  hrefComparacao,
  lerEstadoFiltroSalvo,
  nomeArquivoPdf,
  nomeNormalizado,
  nomePadraoComparacao,
  normalizarNome,
  paramsParaObjeto,
  resolverSentinelaPadrao,
  urlPdfComparacao,
} from '@/services/analiseAtivos/salvos/contrato';
import {
  escreverEstadoQuadro,
  lerEstadoQuadro,
} from '@/components/analiseAtivos/quadro/useEstadoQuadroUrl';

const UUID = '3f2c1a9e-7b6d-4c8a-9e1f-2a3b4c5d6e7f';
const UUID2 = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('salvos/contrato — limites e constantes', () => {
  it('limites do contrato (decisão do Wellington, 16/10)', () => {
    expect(LIMITES_SALVOS).toEqual({
      nome: 40,
      listas: 20,
      itensPorLista: 200,
      itensPorUsuario: 500,
      filtrosPorClasse: 20,
      comparacoes: 30,
      pdfPorHora: 10,
    });
    expect(Object.isFrozen(LIMITES_SALVOS)).toBe(true);
  });

  it('avisos: type, tipos, retenção de 90 dias e janela fixa de 5 anos', () => {
    expect(ANALISE_SALVOS_ALERTA_TYPE).toBe('analise_ativos_salvos_alerta');
    expect(TIPOS_AVISO).toEqual(['resultado', 'provento', 'criterios', 'resumo']);
    expect(RETENCAO_AVISOS_DIAS).toBe(90);
    expect(JANELA_AVISO_CRITERIOS).toBe(5);
    expect(ALERTAS_PADRAO_LISTA).toEqual({ resultado: true, provento: true, criterios: false });
  });

  it('1ª lista se chama "Salvos"; consultor recebe a mensagem das listas pessoais', () => {
    expect(NOME_LISTA_PADRAO).toBe('Salvos');
    expect(MENSAGEM_LISTAS_PESSOAIS).toBe('As listas são pessoais');
  });

  it('rotas não colidem com o Watchlist da Carteira', () => {
    const todas = JSON.stringify({
      ...ROTAS_SALVOS,
      api: Object.fromEntries(
        Object.entries(ROTAS_SALVOS.api).map(([k, v]) => [
          k,
          typeof v === 'function' ? v('x', 'Y') : v,
        ]),
      ),
      paginaLista: ROTAS_SALVOS.paginaLista('x'),
    });
    expect(todas).not.toMatch(/watchlist/i);
    expect(ROTAS_SALVOS.api.item('a b', 'WEGE3')).toBe(
      '/api/analise-ativos/listas/a%20b/itens/WEGE3',
    );
    expect(ROTAS_SALVOS.paginaLista('l1', 'fii')).toBe(
      '/analise-ativos/salvos?lista=l1&classe=fii',
    );
    expect(ROTAS_SALVOS.paginaLista('l1', 'acao')).toBe('/analise-ativos/salvos?lista=l1');
  });
});

describe('nomes', () => {
  it('normalizarNome: trim e espaços colapsados', () => {
    expect(normalizarNome('  Utilidade   pública \n ')).toBe('Utilidade pública');
  });

  it('nomeNormalizado: sem acento e sem maiúscula (unicidade)', () => {
    expect(nomeNormalizado('  Utilidade   PÚBLICA ')).toBe('utilidade publica');
    expect(nomeNormalizado('Ações')).toBe(nomeNormalizado('acoes'));
    expect(nomeNormalizado('Dividendos')).not.toBe(nomeNormalizado('Dividendo'));
  });

  it('nome padrão da comparação, cortado em 40', () => {
    expect(nomePadraoComparacao(['WEGE3', 'ITUB4', 'BBAS3'])).toBe('WEGE3 · ITUB4 · BBAS3');
    expect(
      nomePadraoComparacao(['AAAA11', 'BBBB11', 'CCCC11', 'DDDD11']).length,
    ).toBeLessThanOrEqual(40);
  });
});

describe('TICKER_RE_POR_CLASSE', () => {
  it('ação/FII da B3; stock/reit reservados', () => {
    expect(TICKER_RE_POR_CLASSE.acao.test('WEGE3')).toBe(true);
    expect(TICKER_RE_POR_CLASSE.acao.test('TAEE11')).toBe(true);
    expect(TICKER_RE_POR_CLASSE.fii.test('HGLG11')).toBe(true);
    expect(TICKER_RE_POR_CLASSE.acao.test('wege3')).toBe(false);
    expect(TICKER_RE_POR_CLASSE.acao.test('AAPL')).toBe(false);
    expect(TICKER_RE_POR_CLASSE.stock.test('AAPL')).toBe(true);
    expect(TICKER_RE_POR_CLASSE.stock.test('BRK.B')).toBe(true);
    expect(TICKER_RE_POR_CLASSE.reit.test('O')).toBe(true);
    expect(TICKER_RE_POR_CLASSE.stock.test('WEGE3')).toBe(false);
  });

  it('ehTickerValido sem classe = alguma classe do bloco 1', () => {
    expect(ehTickerValido('WEGE3')).toBe(true);
    expect(ehTickerValido('AAPL')).toBe(false);
    expect(ehTickerValido('AAPL', 'stock')).toBe(true);
  });
});

describe('regra do Salvar e sentinela', () => {
  it('0 listas cria "Salvos"; 1 alterna; 2+ escolhe', () => {
    expect(acaoDoSalvar(0)).toBe('criarPadrao');
    expect(acaoDoSalvar(1)).toBe('alternar');
    expect(acaoDoSalvar(2)).toBe('escolher');
    expect(acaoDoSalvar(20)).toBe('escolher');
  });

  it('resolverSentinelaPadrao: 0 → criar Salvos; 1 → usar; 2+ → inválido (400)', () => {
    expect(resolverSentinelaPadrao([])).toEqual({ acao: 'criar', nome: 'Salvos' });
    expect(resolverSentinelaPadrao(['l1'])).toEqual({ acao: 'usar', listaId: 'l1' });
    expect(resolverSentinelaPadrao(['l1', 'l2'])).toEqual({ acao: 'invalido' });
  });

  it('SalvosPutSchema: ids únicos, [] ou exatamente ["padrao"]', () => {
    expect(SalvosPutSchema.safeParse({ listaIds: [] }).success).toBe(true);
    expect(SalvosPutSchema.safeParse({ listaIds: [SENTINELA_PADRAO] }).success).toBe(true);
    expect(SalvosPutSchema.safeParse({ listaIds: [UUID, UUID2] }).success).toBe(true);
    expect(SalvosPutSchema.safeParse({ listaIds: [UUID, UUID] }).success).toBe(false);
    expect(SalvosPutSchema.safeParse({ listaIds: [SENTINELA_PADRAO, UUID] }).success).toBe(false);
    expect(SalvosPutSchema.safeParse({ listaIds: ['nao-e-uuid'] }).success).toBe(false);
    expect(SalvosPutSchema.safeParse({ listaIds: [], extra: 1 }).success).toBe(false);
    expect(
      SalvosPutSchema.safeParse({ listaIds: Array.from({ length: 21 }, () => UUID) }).success,
    ).toBe(false);
    expect(ehSentinelaPadrao(['padrao'])).toBe(true);
    expect(ehSentinelaPadrao([UUID])).toBe(false);
  });
});

describe('zod das listas (strict)', () => {
  it('POST: nome 1..40 normalizado; tickerInicial maiúsculo; campo extra ⇒ erro', () => {
    const ok = ListaPostSchema.parse({ nome: '  Elétricas  ', tickerInicial: ' taee11 ' });
    expect(ok).toEqual({ nome: 'Elétricas', tickerInicial: 'TAEE11' });
    expect(ListaPostSchema.safeParse({ nome: '   ' }).success).toBe(false);
    expect(ListaPostSchema.safeParse({ nome: 'x'.repeat(41) }).success).toBe(false);
    expect(ListaPostSchema.safeParse({ nome: 'x'.repeat(40) }).success).toBe(true);
    expect(ListaPostSchema.safeParse({ nome: 'A', padrao: true }).success).toBe(false);
    expect(ListaPostSchema.safeParse({ nome: 'A', tickerInicial: 'AAPL' }).success).toBe(false);
    expect(ListaPostSchema.safeParse({ nome: 'A\u0007' }).success).toBe(false);
  });

  it('POST: alertas opcionais e strict', () => {
    expect(
      ListaPostSchema.parse({ nome: 'A', alertas: { resultado: false, provento: false } }).alertas,
    ).toEqual({ resultado: false, provento: false });
    expect(ListaPostSchema.safeParse({ nome: 'A', alertas: { preco: true } }).success).toBe(false);
  });

  it('PATCH: nome ou alertas; vazio ⇒ erro', () => {
    expect(ListaPatchSchema.safeParse({ nome: 'B' }).success).toBe(true);
    expect(ListaPatchSchema.safeParse({ alertas: { criterios: true } }).success).toBe(true);
    expect(ListaPatchSchema.safeParse({}).success).toBe(false);
    expect(ListaPatchSchema.safeParse({ alertas: {} }).success).toBe(false);
  });

  it('GET /listas/[id]: classe obrigatória, janela 3|5|10, sem filtros de critério', () => {
    expect(LinhasListaQuerySchema.parse({ classe: 'fii', janela: '10' })).toEqual({
      classe: 'fii',
      janela: 10,
    });
    expect(LinhasListaQuerySchema.safeParse({ classe: 'acao', janela: '4' }).success).toBe(false);
    expect(LinhasListaQuerySchema.safeParse({ classe: 'acao', criterios: 'rec' }).success).toBe(
      false,
    );
    expect(LinhasListaQuerySchema.safeParse({ classe: 'stock' }).success).toBe(false);
    expect(LinhasListaQuerySchema.safeParse({ classe: 'acao', ordem: 'indiceMf' }).success).toBe(
      false,
    );
  });
});

describe('filtros salvos', () => {
  const estado = { janela: 5, criterios: ['rec', 'luc'], naCarteira: false, setor: null };

  it('EstadoFiltroSalvoV1: strict, sem modo/ordem/dir', () => {
    expect(EstadoFiltroSalvoV1Schema.safeParse(estado).success).toBe(true);
    expect(EstadoFiltroSalvoV1Schema.safeParse({ ...estado, modo: 'detalhado' }).success).toBe(
      false,
    );
    expect(EstadoFiltroSalvoV1Schema.safeParse({ ...estado, ordem: 'pl' }).success).toBe(false);
    expect(EstadoFiltroSalvoV1Schema.safeParse({ ...estado, janela: 4 }).success).toBe(false);
    expect(EstadoFiltroSalvoV1Schema.safeParse({ ...estado, criterios: ['nota'] }).success).toBe(
      false,
    );
    expect(
      EstadoFiltroSalvoV1Schema.safeParse({ ...estado, criterios: ['rec', 'rec'] }).success,
    ).toBe(false);
    expect(
      EstadoFiltroSalvoV1Schema.parse({ ...estado, setor: '  Utilidade  Pública ' }).setor,
    ).toBe('Utilidade Pública');
  });

  it('POST e PATCH', () => {
    expect(FiltroPostSchema.safeParse({ nome: 'F', classe: 'acao', estado }).success).toBe(true);
    expect(FiltroPostSchema.safeParse({ nome: 'F', classe: 'reit', estado }).success).toBe(false);
    expect(FiltroPatchSchema.safeParse({ usado: true }).success).toBe(true);
    expect(FiltroPatchSchema.safeParse({ usado: false }).success).toBe(false);
    expect(FiltroPatchSchema.safeParse({}).success).toBe(false);
  });

  it('lerEstadoFiltroSalvo: critério que saiu da classe é retirado (ajustado)', () => {
    expect(lerEstadoFiltroSalvo(estado, ['rec', 'luc', 'mg'])).toEqual({
      estado,
      ajustado: false,
    });
    expect(lerEstadoFiltroSalvo(estado, ['rec'])).toEqual({
      estado: { ...estado, criterios: ['rec'] },
      ajustado: true,
    });
    expect(lerEstadoFiltroSalvo({ lixo: 1 }, ['rec'])).toBeNull();
  });

  it('?filtro=<id> no contrato de URL do Quadro (só uuid; trocar de classe tira)', () => {
    const e = lerEstadoQuadro(new URLSearchParams(`c=rec&filtro=${UUID}`));
    expect(e.filtro).toBe(UUID);
    expect(escreverEstadoQuadro(e).get('filtro')).toBe(UUID);
    expect(lerEstadoQuadro(new URLSearchParams('filtro=abc')).filtro).toBeNull();
    expect(lerEstadoQuadro(new URLSearchParams('')).filtro).toBeNull();
    expect(escreverEstadoQuadro(lerEstadoQuadro(new URLSearchParams(''))).toString()).toBe('');
  });
});

describe('comparações e PDF', () => {
  it('chaveComparacao estável à ordem dos slots (inclui janela e tipo)', () => {
    expect(chaveComparacao(['WEGE3', 'ITUB4', 'BBAS3'], 5)).toBe('BBAS3,ITUB4,WEGE3:5:-');
    expect(chaveComparacao(['BBAS3', 'wege3', 'ITUB4'], 5)).toBe(
      chaveComparacao(['WEGE3', 'ITUB4', 'BBAS3'], 5),
    );
    expect(chaveComparacao(['WEGE3'], 3)).not.toBe(chaveComparacao(['WEGE3'], 5));
    expect(chaveComparacao(['HGLG11'], 5, 'tijolo')).toBe('HGLG11:5:tijolo');
  });

  it('nomeArquivoPdf: comparacao-<classe>-<T1>-…-AAAA-MM-DD.pdf', () => {
    expect(nomeArquivoPdf('acao', ['WEGE3', 'BBAS3', 'TAEE11'], '2026-10-16')).toBe(
      'comparacao-acoes-WEGE3-BBAS3-TAEE11-2026-10-16.pdf',
    );
    expect(nomeArquivoPdf('fii', ['hglg11'], '2026-10-16')).toBe(
      'comparacao-fiis-HGLG11-2026-10-16.pdf',
    );
  });

  it('hrefComparacao e urlPdfComparacao (janela 5 omitida; tipo só se houver)', () => {
    expect(hrefComparacao(['WEGE3', 'ITUB4'], 5)).toBe('/analise-ativos/comparador?t=WEGE3,ITUB4');
    expect(hrefComparacao(['HGLG11', 'XPLG11'], 10, 'tijolo')).toBe(
      '/analise-ativos/comparador?t=HGLG11,XPLG11&janela=10&tipo=tijolo',
    );
    expect(urlPdfComparacao(['WEGE3'], 3)).toBe(
      '/api/analise-ativos/comparacao-pdf?t=WEGE3&janela=3',
    );
  });

  it('ComparacaoPostSchema: 1..4 tickers únicos; tipoFii só em FII', () => {
    const base = { classe: 'acao', tickers: ['WEGE3', 'ITUB4'], janela: 5 };
    expect(ComparacaoPostSchema.safeParse(base).success).toBe(true);
    expect(ComparacaoPostSchema.safeParse({ ...base, tickers: [] }).success).toBe(false);
    expect(
      ComparacaoPostSchema.safeParse({
        ...base,
        tickers: ['A1AA3', 'B1BB3', 'C1CC3', 'D1DD3', 'E1EE3'],
      }).success,
    ).toBe(false);
    expect(ComparacaoPostSchema.safeParse({ ...base, tickers: ['WEGE3', 'wege3'] }).success).toBe(
      false,
    );
    expect(ComparacaoPostSchema.safeParse({ ...base, tipoFii: 'tijolo' }).success).toBe(false);
    expect(
      ComparacaoPostSchema.safeParse({
        classe: 'fii',
        tickers: ['HGLG11'],
        janela: 5,
        tipoFii: 'papel',
      }).success,
    ).toBe(true);
    expect(ComparacaoPostSchema.safeParse({ ...base, posicao: true }).success).toBe(false);
  });

  it('ComparacaoPdfQuerySchema: o t/janela do Comparador + tipo', () => {
    expect(ComparacaoPdfQuerySchema.parse({ t: 'wege3,ITUB4', janela: '10' })).toEqual({
      t: ['WEGE3', 'ITUB4'],
      janela: 10,
    });
    expect(ComparacaoPdfQuerySchema.safeParse({ t: '' }).success).toBe(false);
    expect(ComparacaoPdfQuerySchema.safeParse({ t: 'WEGE3', incluirPosicao: '1' }).success).toBe(
      false,
    );
    expect(ComparacaoPdfQuerySchema.safeParse({ t: 'WEGE3,WEGE3' }).success).toBe(false);
  });
});

describe('avisos', () => {
  it('GET /alertas: dias 1..90', () => {
    expect(AlertasQuerySchema.parse({ classe: 'fii', dias: '90' })).toEqual({
      classe: 'fii',
      dias: 90,
    });
    expect(AlertasQuerySchema.safeParse({ dias: '91' }).success).toBe(false);
    expect(AlertasQuerySchema.safeParse({ dias: '0' }).success).toBe(false);
  });

  it('POST /alertas/lidos: ids uuid opcionais (ausente = todos)', () => {
    expect(AlertasLidosSchema.safeParse({}).success).toBe(true);
    expect(AlertasLidosSchema.safeParse({ ids: [UUID] }).success).toBe(true);
    expect(AlertasLidosSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(AlertasLidosSchema.safeParse({ ids: ['x'] }).success).toBe(false);
  });

  it('paramsParaObjeto', () => {
    expect(paramsParaObjeto(new URLSearchParams('classe=acao&dias=30'))).toEqual({
      classe: 'acao',
      dias: '30',
    });
  });
});
