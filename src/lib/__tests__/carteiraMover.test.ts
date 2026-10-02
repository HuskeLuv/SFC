import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import {
  AVISO_OBJETIVO_ZERA,
  B3_ACAO_RE,
  B3_COTADO_RE,
  B3_UNIT_RE,
  CAMPO_SECAO_NA_LINHA,
  CAMPO_SUBGRUPO_PORTFOLIO,
  CATEGORIA_API_PATH,
  CATEGORIA_TO_ABA_PLANEJAVEL,
  CATEGORIAS_MOVIVEIS,
  INCLUIR_UNITS_EM_ACOES,
  MOTIVO_EM_DOLAR,
  MOTIVO_EM_REAIS,
  MOTIVO_EM_VALIDACAO,
  MOTIVO_SEM_COTACAO,
  SUBGRUPOS_POR_CATEGORIA,
  abaIdDaCategoria,
  avisoRegraIR,
  categoriaBaseDaAba,
  categoriaDaAba,
  destinoPermitido,
  destinosPermitidos,
  isCategoriaMovivel,
  isSubgrupoValido,
  isTickerAcaoB3,
  modeloDePreco,
  motivoNaoMovivel,
  moverInvestimentoSchema,
  moverOpcoesQuerySchema,
  mudaRegraIR,
  overrideEfetivo,
  rotuloCategoria,
  rotuloSubgrupo,
  subgrupoPadrao,
  subgrupoSugerido,
  type AssetMovivelLike,
  type CategoriaMovivel,
  type ModeloPreco,
} from '../carteiraMover';
import { SECOES_POR_ABA } from '@/services/portfolio/ativosPlanejados';

// Este arquivo é o contrato da FASE 1 e roda com a chave da fase 2 DESLIGADA
// (a matriz com ela ligada fica em carteiraMover.caixaRf.test.ts).
beforeAll(() => {
  vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

const a = (
  symbol: string,
  type: string,
  currency: string | null = 'BRL',
  name = symbol,
): AssetMovivelLike => ({ symbol, type, currency, name });

const BRL_BOLSA: CategoriaMovivel[] = ['acoes', 'fiis', 'etfs', 'fimFia'];

type Caso = {
  nome: string;
  asset: AssetMovivelLike;
  temRendaFixa?: boolean;
  base: CategoriaMovivel | null;
  modelo: ModeloPreco;
  /** destinos permitidos (a aba atual sempre entra). */
  permitidos: CategoriaMovivel[];
  /** motivo esperado por destino recusado. */
  motivos: Partial<Record<CategoriaMovivel, string>>;
};

const CASOS: Caso[] = [
  {
    nome: 'ação B3 (B3SA3)',
    asset: a('B3SA3', 'stock'),
    base: 'acoes',
    modelo: 'b3-brl',
    permitidos: BRL_BOLSA,
    motivos: { stocks: MOTIVO_EM_REAIS, reits: MOTIVO_EM_REAIS },
  },
  {
    nome: 'BDR (AAPL34)',
    asset: a('AAPL34', 'bdr'),
    base: 'acoes',
    modelo: 'b3-brl',
    permitidos: BRL_BOLSA,
    motivos: { stocks: MOTIVO_EM_REAIS, reits: MOTIVO_EM_REAIS },
  },
  {
    nome: 'FII (HGLG11)',
    asset: a('HGLG11', 'fii'),
    base: 'fiis',
    modelo: 'b3-brl',
    permitidos: BRL_BOLSA,
    motivos: { stocks: MOTIVO_EM_REAIS, reits: MOTIVO_EM_REAIS },
  },
  {
    nome: 'ETF BRL cotado (IVVB11)',
    asset: a('IVVB11', 'etf'),
    base: 'etfs',
    modelo: 'b3-brl',
    permitidos: BRL_BOLSA,
    motivos: { stocks: MOTIVO_EM_REAIS, reits: MOTIVO_EM_REAIS },
  },
  {
    nome: "fundo legado 'fund' com ticker B3 (HGLG11)",
    asset: a('HGLG11', 'fund', 'BRL', 'CSHG Logística FII'),
    base: 'fimFia',
    modelo: 'b3-brl',
    permitidos: BRL_BOLSA,
    motivos: { stocks: MOTIVO_EM_REAIS, reits: MOTIVO_EM_REAIS },
  },
  {
    nome: "'fund' B3 com FixedIncomeAsset",
    asset: a('HGLG11', 'fund'),
    temRendaFixa: true,
    base: 'fimFia',
    modelo: 'fundo',
    permitidos: ['fimFia'],
    motivos: {
      acoes: MOTIVO_SEM_COTACAO,
      fiis: MOTIVO_SEM_COTACAO,
      etfs: MOTIVO_SEM_COTACAO,
      stocks: MOTIVO_SEM_COTACAO,
      reits: MOTIVO_SEM_COTACAO,
    },
  },
  {
    nome: 'fundo CVM (CVM-…11)',
    asset: a('CVM-12345678000111', 'multimercado'),
    base: 'fimFia',
    modelo: 'fundo',
    permitidos: ['fimFia'],
    motivos: { acoes: MOTIVO_SEM_COTACAO, fiis: MOTIVO_SEM_COTACAO, etfs: MOTIVO_SEM_COTACAO },
  },
  {
    nome: 'fundo Pluggy (PLUGGY-FUNDO-…)',
    asset: a('PLUGGY-FUNDO-abc123', 'fund'),
    base: 'fimFia',
    modelo: 'fundo',
    permitidos: ['fimFia'],
    motivos: { fiis: MOTIVO_SEM_COTACAO, stocks: MOTIVO_SEM_COTACAO },
  },
  {
    nome: 'fundo manual (FUNDO-…)',
    asset: a('FUNDO-VERDE-1700000000-abc', 'fund'),
    base: 'fimFia',
    modelo: 'fundo',
    permitidos: ['fimFia'],
    motivos: { acoes: MOTIVO_SEM_COTACAO },
  },
  {
    nome: 'etf-cvm (sem cotação em bolsa, mesmo com cara de ticker)',
    asset: a('ABCD11', 'etf-cvm'),
    base: 'etfs',
    modelo: 'fundo',
    permitidos: ['etfs'],
    motivos: { fimFia: MOTIVO_SEM_COTACAO, acoes: MOTIVO_SEM_COTACAO },
  },
  {
    nome: 'ETF em dólar (VOO)',
    asset: a('VOO', 'etf', 'USD'),
    base: 'etfs',
    modelo: 'usd',
    permitidos: ['etfs'],
    motivos: {
      stocks: MOTIVO_EM_VALIDACAO,
      reits: MOTIVO_EM_VALIDACAO,
      acoes: MOTIVO_EM_DOLAR,
      fiis: MOTIVO_EM_DOLAR,
      fimFia: MOTIVO_EM_DOLAR,
    },
  },
  {
    nome: 'Stock (AAPL USD)',
    asset: a('AAPL-1700000000-abc', 'stock', 'USD', 'AAPL'),
    base: 'stocks',
    modelo: 'usd',
    permitidos: ['stocks', 'reits'],
    motivos: {
      etfs: MOTIVO_EM_VALIDACAO,
      acoes: MOTIVO_EM_DOLAR,
      fiis: MOTIVO_EM_DOLAR,
      fimFia: MOTIVO_EM_DOLAR,
    },
  },
  {
    nome: "REIT's (O USD)",
    asset: a('O', 'reit', 'USD'),
    base: 'reits',
    modelo: 'usd',
    permitidos: ['reits', 'stocks'],
    motivos: { etfs: MOTIVO_EM_VALIDACAO, acoes: MOTIVO_EM_DOLAR },
  },
  {
    nome: 'unit B3 (TAEE11) fora de escopo',
    asset: a('TAEE11', 'stock'),
    base: null,
    modelo: 'fixo',
    permitidos: [],
    motivos: {},
  },
  {
    nome: 'Tesouro Direto',
    asset: a('TESOURO-IPCA-2035', 'tesouro-direto'),
    base: null,
    modelo: 'fixo',
    permitidos: [],
    motivos: {},
  },
  {
    nome: 'cripto',
    asset: a('BTC', 'crypto'),
    base: null,
    modelo: 'fixo',
    permitidos: [],
    motivos: {},
  },
  {
    nome: 'reserva',
    asset: a('RESERVA-EMERG-1', 'emergency'),
    base: null,
    modelo: 'fixo',
    permitidos: [],
    motivos: {},
  },
];

describe('regex de ticker', () => {
  it('B3_ACAO_RE: ação sim; unit, fracionário e BDR não', () => {
    expect(B3_ACAO_RE.test('PETR4')).toBe(true);
    expect(B3_ACAO_RE.test('B3SA3')).toBe(true);
    expect(B3_ACAO_RE.test('TAEE11')).toBe(false);
    expect(B3_ACAO_RE.test('PETR4F')).toBe(false);
    expect(B3_ACAO_RE.test('AAPL34')).toBe(false);
  });

  it('B3_UNIT_RE e B3_COTADO_RE', () => {
    expect(B3_UNIT_RE.test('TAEE11')).toBe(true);
    expect(B3_UNIT_RE.test('PETR4')).toBe(false);
    for (const t of ['PETR4', 'HGLG11', 'AAPL34', 'PETR4F', 'IVVB11']) {
      expect(B3_COTADO_RE.test(t)).toBe(true);
    }
    for (const t of ['VOO', 'CVM-123', 'PLUGGY-FUNDO-1', 'AAPL', 'PETR']) {
      expect(B3_COTADO_RE.test(t)).toBe(false);
    }
  });

  it('units ficam fora de Ações enquanto INCLUIR_UNITS_EM_ACOES = false (decisão 11)', () => {
    expect(INCLUIR_UNITS_EM_ACOES).toBe(false);
    expect(isTickerAcaoB3('TAEE11')).toBe(false);
    expect(isTickerAcaoB3('petr4')).toBe(true);
  });
});

describe('matriz de compatibilidade', () => {
  it.each(CASOS)('$nome: aba base, modelo e destinos', (caso) => {
    const ctx = { temRendaFixa: caso.temRendaFixa };
    expect(categoriaBaseDaAba(caso.asset)).toBe(caso.base);
    expect(modeloDePreco(caso.asset, ctx)).toBe(caso.modelo);

    const destinos = destinosPermitidos(caso.asset, ctx);
    expect(destinos.map((d) => d.categoria)).toEqual([...CATEGORIAS_MOVIVEIS]);
    const permitidos = destinos.filter((d) => d.permitido).map((d) => d.categoria);
    expect([...permitidos].sort()).toEqual([...caso.permitidos].sort());
    for (const d of destinos) {
      if (d.permitido) expect(d.motivo).toBeUndefined();
      else expect(d.motivo).toBeTruthy();
    }
    for (const [cat, motivo] of Object.entries(caso.motivos)) {
      expect(destinoPermitido(caso.asset, cat as CategoriaMovivel, ctx).motivo).toBe(motivo);
    }
  });

  it('item fixo: todas recusadas com a frase da aba', () => {
    const destinos = destinosPermitidos(a('TESOURO-1', 'tesouro-direto'), {
      categoriaFixa: 'rendaFixaFundos',
    });
    expect(destinos.every((d) => !d.permitido)).toBe(true);
    expect(destinos[0].motivo).toBe('Renda Fixa ainda não pode ser movida para outra aba');
    expect(motivoNaoMovivel(null)).toBe('Esta aba ainda não pode ser movida para outra aba');
  });

  it('item movido: a aba atual e a base continuam permitidas', () => {
    const fii = a('HGLG11', 'fii');
    const destinos = destinosPermitidos(fii, { atual: 'fimFia' });
    expect(destinos.filter((d) => d.permitido).map((d) => d.categoria)).toEqual(
      expect.arrayContaining(['fimFia', 'fiis', 'acoes', 'etfs']),
    );
  });

  it('Stock movido para REITs pode voltar para Stocks; ETF continua em validação', () => {
    const stock = a('MSFT', 'stock', 'USD');
    expect(destinoPermitido(stock, 'stocks', { atual: 'reits' }).permitido).toBe(true);
    expect(destinoPermitido(stock, 'etfs', { atual: 'reits' }).motivo).toBe(MOTIVO_EM_VALIDACAO);
  });

  it('REIT sem moeda cadastrada é tratado como dólar', () => {
    expect(modeloDePreco(a('O-1700000000-abc', 'reit', null))).toBe('usd');
  });

  it('fundo em dólar não é "usd" (cota CVM)', () => {
    expect(modeloDePreco(a('CVM-1', 'fund-cambial', 'USD'))).toBe('fundo');
  });

  it('sem asset: fixo', () => {
    expect(modeloDePreco(null)).toBe('fixo');
    expect(categoriaBaseDaAba(undefined)).toBeNull();
  });
});

describe('categoriaBaseDaAba espelha os where das rotas', () => {
  it.each([
    ['PETR4', 'stock', 'BRL', 'acoes'],
    ['PETR4', 'stock', null, 'acoes'],
    ['AAPL', 'stock', 'USD', 'stocks'],
    ['AAPL34', 'brd', 'BRL', 'acoes'],
    ['XPML11', 'fii', 'BRL', 'fiis'],
    ['BOVA11', 'etf', 'BRL', 'etfs'],
    ['CVM-1', 'etf-cvm', 'BRL', 'etfs'],
    ['O', 'reit', 'USD', 'reits'],
    ['CVM-1', 'fiagro', 'BRL', 'fimFia'],
    ['CVM-1', 'fidc', 'BRL', 'fimFia'],
    ['CVM-1', 'previdencia', 'BRL', null],
    ['X', 'opcao', 'BRL', null],
    ['CDB-1', 'bond', 'BRL', null],
    ['CASA', 'imovel', 'BRL', null],
    ['CAIXA', 'cash', 'BRL', null],
  ])('%s (%s/%s) → %s', (symbol, type, currency, esperado) => {
    expect(categoriaBaseDaAba(a(symbol, type, currency))).toBe(esperado);
  });
});

describe('overrideEfetivo / categoriaDaAba', () => {
  const fii = a('KDIF11', 'fii');

  it('override diferente da base vale', () => {
    expect(overrideEfetivo(fii, 'fimFia')).toBe('fimFia');
    expect(categoriaDaAba(fii, 'fimFia')).toBe('fimFia');
  });

  it('override = base → null (segue a regra de sempre)', () => {
    expect(overrideEfetivo(fii, 'fiis')).toBeNull();
    expect(categoriaDaAba(fii, 'fiis')).toBe('fiis');
  });

  it('override inválido ou item fixo → null', () => {
    expect(overrideEfetivo(fii, 'rendaFixaFundos')).toBeNull();
    expect(overrideEfetivo(fii, 'lixo')).toBeNull();
    expect(overrideEfetivo(fii, null)).toBeNull();
    expect(overrideEfetivo(a('TESOURO', 'tesouro-direto'), 'acoes')).toBeNull();
    expect(categoriaDaAba(a('TESOURO', 'tesouro-direto'), 'acoes')).toBeNull();
  });
});

describe('subgrupos', () => {
  it('rótulos e validação', () => {
    expect(rotuloSubgrupo('fiis', 'fofi')).toBe('FOF (Fundos de Fundos)');
    expect(rotuloSubgrupo('etfs', 'estados_unidos')).toBe('EUA');
    expect(rotuloSubgrupo('fimFia', 'fip-infra')).toBe('FIP Infraestrutura');
    expect(rotuloSubgrupo('acoes', 'xx')).toBeNull();
    expect(isSubgrupoValido('fiis', 'infra')).toBe(true);
    expect(isSubgrupoValido('fiis', 'value')).toBe(false);
    expect(isSubgrupoValido('reits', 'risk')).toBe(true);
  });

  it('as seções de cada aba batem com as dos planejados', () => {
    for (const cat of CATEGORIAS_MOVIVEIS) {
      expect(SUBGRUPOS_POR_CATEGORIA[cat].map((s) => s.id)).toEqual([
        ...SECOES_POR_ABA[CATEGORIA_TO_ABA_PLANEJAVEL[cat]],
      ]);
    }
  });

  it('campos por aba', () => {
    expect(CAMPO_SUBGRUPO_PORTFOLIO).toEqual({
      acoes: 'estrategia',
      stocks: 'estrategia',
      reits: 'estrategia',
      fiis: 'tipoFii',
      etfs: 'regiaoEtf',
      fimFia: 'tipoFundo',
      // Fase 2: o trio não tem coluna de subgrupo.
      reservaEmergencia: null,
      reservaOportunidade: null,
      rendaFixaFundos: null,
    });
    expect(CAMPO_SECAO_NA_LINHA.etfs).toBe('regiao');
    expect(CAMPO_SECAO_NA_LINHA.fiis).toBe('tipo');
    expect(CATEGORIA_API_PATH.fimFia).toBe('fim-fia');
  });

  describe('subgrupoPadrao', () => {
    it('ações/stocks/reits: estrategia → notes.estrategiaReit → value', () => {
      expect(subgrupoPadrao('acoes', { estrategia: 'growth' })).toBe('growth');
      expect(subgrupoPadrao('reits', { estrategia: 'x', notes: { estrategiaReit: 'risk' } })).toBe(
        'risk',
      );
      expect(subgrupoPadrao('stocks')).toBe('value');
    });

    it('fiis: tipoFii válido → fofi', () => {
      expect(subgrupoPadrao('fiis', { tipoFii: 'tvm' })).toBe('tvm');
      expect(subgrupoPadrao('fiis', { tipoFii: 'outro' })).toBe('fofi');
    });

    it('etfs: regiaoEtf → moeda', () => {
      expect(subgrupoPadrao('etfs', { regiaoEtf: 'estados_unidos' })).toBe('estados_unidos');
      expect(subgrupoPadrao('etfs', { asset: a('VOO', 'etf', 'USD') })).toBe('estados_unidos');
      expect(subgrupoPadrao('etfs', { asset: a('BOVA11', 'etf') })).toBe('brasil');
    });

    it('fimFia: tipoFundo → tipo CVM → notes.tipoFundo → fim', () => {
      expect(subgrupoPadrao('fimFia', { tipoFundo: 'fidc', asset: a('X', 'fiagro') })).toBe('fidc');
      expect(
        subgrupoPadrao('fimFia', { asset: a('X', 'fiagro'), notes: { tipoFundo: 'rf' } }),
      ).toBe('fiagro');
      expect(subgrupoPadrao('fimFia', { asset: a('X', 'fund'), notes: { tipoFundo: 'rf' } })).toBe(
        'rf',
      );
      expect(subgrupoPadrao('fimFia', { asset: a('HGLG11', 'fii') })).toBe('fim');
    });
  });

  describe('subgrupoSugerido', () => {
    it('Fiagro / Infra / FIDC pelo nome', () => {
      expect(subgrupoSugerido(a('RZAG11', 'fii', 'BRL', 'Riza Agro FII'), 'fimFia')).toBe('fiagro');
      expect(subgrupoSugerido(a('KDIF11', 'fii', 'BRL', 'Kinea Infra'), 'fiis')).toBe('infra');
      expect(
        subgrupoSugerido(a('CPTI11', 'fund', 'BRL', 'Capitânia Debêntures Incentivadas'), 'fiis'),
      ).toBe('infra');
      expect(subgrupoSugerido(a('X11', 'fund', 'BRL', 'FIP Infraestrutura XP'), 'fimFia')).toBe(
        'fip-infra',
      );
      expect(subgrupoSugerido(a('X11', 'fund', 'BRL', 'Valora FIDC'), 'fimFia')).toBe('fidc');
    });

    it('sem pista → subgrupoPadrao', () => {
      expect(subgrupoSugerido(a('HGLG11', 'fii', 'BRL', 'CSHG Logística'), 'fimFia')).toBe('fim');
      expect(subgrupoSugerido(a('IVVB11', 'etf'), 'acoes', { estrategia: 'growth' })).toBe(
        'growth',
      );
      expect(subgrupoSugerido(a('PETR4', 'stock'), 'fiis')).toBe('fofi');
    });
  });
});

describe('IR e avisos', () => {
  it('mudaRegraIR compara a família de tributação', () => {
    expect(mudaRegraIR('fiis', 'acoes')).toBe(true);
    expect(mudaRegraIR('fiis', 'fimFia')).toBe(true);
    expect(mudaRegraIR('stocks', 'reits')).toBe(false);
    expect(mudaRegraIR('etfs', 'stocks', 'USD')).toBe(false);
    expect(mudaRegraIR('etfs', 'stocks', 'BRL')).toBe(true);
    expect(mudaRegraIR('acoes', 'acoes')).toBe(false);
  });

  it('textos', () => {
    expect(avisoRegraIR('fiis')).toBe(
      'A aba é só organização: o IR continua pelo tipo do ativo (FII)',
    );
    expect(AVISO_OBJETIVO_ZERA).toBe('O objetivo (%) volta para 0 na aba nova');
  });
});

describe('rótulos de aba', () => {
  it('reusa a barra de abas', () => {
    expect(rotuloCategoria('fiis')).toBe("FII's");
    expect(rotuloCategoria('fimFia')).toBe('Fundos');
    expect(rotuloCategoria('reits')).toBe("REIT's");
    expect(abaIdDaCategoria('reits')).toBe('reit');
    expect(abaIdDaCategoria('fimFia')).toBe('fim-fia');
    expect(isCategoriaMovivel('fiis')).toBe(true);
    expect(isCategoriaMovivel('rendaFixaFundos')).toBe(false);
  });
});

describe('moverInvestimentoSchema', () => {
  const id = '8f14e45f-ceea-467a-9575-0a2b7c1d3e4f';

  it('aceita mover e restaurar', () => {
    expect(
      moverInvestimentoSchema.safeParse({
        acao: 'mover',
        tipo: 'posicao',
        id,
        categoria: 'fimFia',
        subgrupo: 'fiagro',
      }).success,
    ).toBe(true);
    expect(
      moverInvestimentoSchema.safeParse({ acao: 'restaurar', tipo: 'planejado', id }).success,
    ).toBe(true);
  });

  it('recusa categoria fixa e tipo desconhecido; subgrupo é opcional (o serviço exige)', () => {
    const base = { acao: 'mover', tipo: 'posicao', id, subgrupo: 'value' };
    expect(moverInvestimentoSchema.safeParse({ ...base, categoria: 'imoveisBens' }).success).toBe(
      false,
    );
    expect(
      moverInvestimentoSchema.safeParse({ ...base, categoria: 'acoes', tipo: 'outro' }).success,
    ).toBe(false);
    // Fase 2: 'Escolha a seção' (400) sai do serviço só quando a aba deixa escolher.
    expect(
      moverInvestimentoSchema.safeParse({ acao: 'mover', tipo: 'posicao', id, categoria: 'acoes' })
        .success,
    ).toBe(true);
    expect(moverInvestimentoSchema.safeParse({ acao: 'apagar', tipo: 'posicao', id }).success).toBe(
      false,
    );
  });

  it('query do GET', () => {
    expect(moverOpcoesQuerySchema.safeParse({ tipo: 'posicao', id }).success).toBe(true);
    expect(moverOpcoesQuerySchema.safeParse({ tipo: 'posicao', id: '' }).success).toBe(false);
  });
});
