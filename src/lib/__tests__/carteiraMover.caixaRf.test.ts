import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AVISO_LIQUIDEZ_RESERVA,
  CAMPO_SECAO_NA_LINHA,
  CAMPO_SUBGRUPO_PORTFOLIO,
  CATEGORIA_API_PATH,
  CATEGORIA_TO_ABA_PLANEJAVEL,
  CATEGORIAS_CAIXA_RF,
  CATEGORIAS_MOVIVEIS,
  CATEGORIAS_MOVIVEIS_TODAS,
  MOTIVO_COM_COTACAO,
  MOTIVO_EM_REAIS,
  MOTIVO_PLANEJADO_RV,
  MOTIVO_SALDO_SEM_COTACAO_BOLSA,
  MOTIVO_SALDO_SEM_TITULO,
  MOTIVO_SEM_COTACAO_BOLSA,
  SUBGRUPO_EDITAVEL,
  SUBGRUPOS_POR_CATEGORIA,
  categoriaBaseDaAba,
  categoriaDaAba,
  categoriasComOverrideValido,
  categoriasDoGrupo,
  destinoPermitido,
  destinosPermitidos,
  envolveReservaEmergencia,
  grupoDaCategoria,
  isCategoriaCaixaRf,
  isCategoriaMovivel,
  isCategoriaMovivelTodas,
  isSaldoSemTitulo,
  modeloDePreco,
  motivoNaoMovivel,
  moverInvestimentoSchema,
  mudaRegraIR,
  normalizarReservaDestino,
  overrideEfetivo,
  precisaAvisoLiquidez,
  secaoAutomaticaDe,
  subgrupoPadrao,
  type AssetMovivelLike,
  type BaseCtx,
  type CategoriaMovivel,
  type DestinosCtx,
  type ModeloPreco,
} from '../carteiraMover';
import { moverCaixaRfHabilitado } from '../carteiraMoverConfig';

const ligar = () => vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'true');
const desligar = () => vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', 'false');

afterEach(() => {
  vi.unstubAllEnvs();
});

const a = (
  symbol: string,
  type: string,
  currency: string | null = 'BRL',
  name = symbol,
): AssetMovivelLike => ({ symbol, type, currency, name });

// ── Fixtures da matriz (spec, fatia 0) ──────────────────────────────────────

type CasoCaixaRf = {
  nome: string;
  asset: AssetMovivelLike;
  temRendaFixa?: boolean;
  baseCtx?: BaseCtx;
  /** base com a chave LIGADA. */
  base: CategoriaMovivel;
  semTitulo: boolean;
};

const CASOS_CAIXA_RF: CasoCaixaRf[] = [
  {
    nome: 'RESERVA-EMERG sem FI',
    asset: a('RESERVA-EMERG-1700-abc', 'emergency'),
    base: 'reservaEmergencia',
    semTitulo: true,
  },
  {
    nome: 'RESERVA-EMERG com FI (CDB de reserva)',
    asset: a('RESERVA-EMERG-1700-def', 'emergency'),
    temRendaFixa: true,
    base: 'reservaEmergencia',
    semTitulo: false,
  },
  {
    nome: 'CONTA-CORRENTE-OPORT',
    asset: a('CONTA-CORRENTE-OPORT-1700-abc', 'opportunity'),
    base: 'reservaOportunidade',
    semTitulo: true,
  },
  {
    nome: 'POUPANCA-EMERG',
    asset: a('POUPANCA-EMERG-1700-abc', 'emergency'),
    base: 'reservaEmergencia',
    semTitulo: true,
  },
  {
    nome: 'FUNDO-x-RESERVA-EMERG com FI',
    asset: a('FUNDO-ITAU-RESERVA-EMERG-1700-abc', 'emergency'),
    temRendaFixa: true,
    base: 'reservaEmergencia',
    semTitulo: false,
  },
  {
    nome: 'TESOURO-x manual na reserva (type emergency)',
    asset: a('TESOURO-SELIC-2029-1700-abc', 'emergency'),
    base: 'reservaEmergencia',
    semTitulo: false,
  },
  {
    nome: 'Tesouro de catálogo sem reserva',
    asset: a('TESOURO-PREFIXADO-2029', 'tesouro-direto'),
    base: 'rendaFixaFundos',
    semTitulo: false,
  },
  {
    nome: 'Tesouro de catálogo comprado para a Emergência',
    asset: a('TESOURO-SELIC-2031', 'tesouro-direto'),
    baseCtx: { reservaDestino: 'emergencia' },
    base: 'reservaEmergencia',
    semTitulo: false,
  },
  {
    nome: 'Tesouro de catálogo comprado para a Oportunidade',
    asset: a('TESOURO-SELIC-2031', 'tesouro-direto'),
    baseCtx: { reservaDestino: 'oportunidade' },
    base: 'reservaOportunidade',
    semTitulo: false,
  },
  {
    nome: 'RENDA-FIXA bond com FI',
    asset: a('RENDA-FIXA-1700-abc', 'bond'),
    temRendaFixa: true,
    base: 'rendaFixaFundos',
    semTitulo: false,
  },
  {
    nome: 'RENDA-FIXA bond sem FI (legacy)',
    asset: a('RENDA-FIXA-1700-def', 'bond'),
    base: 'rendaFixaFundos',
    semTitulo: false,
  },
  {
    nome: 'cash sem FI',
    asset: a('CAIXA-1', 'cash'),
    base: 'reservaOportunidade',
    semTitulo: true,
  },
  {
    nome: 'cash com FI',
    asset: a('CAIXA-2', 'cash'),
    temRendaFixa: true,
    base: 'reservaOportunidade',
    semTitulo: false,
  },
];

type CasoRv = {
  nome: string;
  asset: AssetMovivelLike;
  temRendaFixa?: boolean;
  base: CategoriaMovivel;
  modelo: ModeloPreco;
};

const CASOS_RV: CasoRv[] = [
  { nome: 'FII', asset: a('HGLG11', 'fii'), base: 'fiis', modelo: 'b3-brl' },
  { nome: 'ação', asset: a('PETR4', 'stock'), base: 'acoes', modelo: 'b3-brl' },
  { nome: 'ETF BRL', asset: a('BOVA11', 'etf'), base: 'etfs', modelo: 'b3-brl' },
  { nome: 'ETF USD', asset: a('VOO', 'etf', 'USD'), base: 'etfs', modelo: 'usd' },
  { nome: 'stock', asset: a('AAPL', 'stock', 'USD'), base: 'stocks', modelo: 'usd' },
  { nome: 'REIT', asset: a('O', 'reit', 'USD'), base: 'reits', modelo: 'usd' },
  { nome: 'fundo CVM', asset: a('CVM-123', 'fia'), base: 'fimFia', modelo: 'fundo' },
];

const FIXOS: { nome: string; asset: AssetMovivelLike }[] = [
  { nome: 'imóvel', asset: a('IMOVEL-1', 'imovel') },
  { nome: 'cripto', asset: a('BTC', 'crypto') },
  { nome: 'previdência', asset: a('PREV-1', 'previdencia') },
];

const ctxDe = (c: { temRendaFixa?: boolean; baseCtx?: BaseCtx }): DestinosCtx => ({
  temRendaFixa: c.temRendaFixa,
  baseCtx: c.baseCtx,
});

// Saída da FASE 1 (antes da fase 2), copiada da main: FII HGLG11.
const FII_FASE_1 = [
  { categoria: 'fimFia', permitido: true },
  { categoria: 'fiis', permitido: true },
  { categoria: 'acoes', permitido: true },
  { categoria: 'stocks', permitido: false, motivo: MOTIVO_EM_REAIS },
  { categoria: 'reits', permitido: false, motivo: MOTIVO_EM_REAIS },
  { categoria: 'etfs', permitido: true },
];

// ── Testes ──────────────────────────────────────────────────────────────────

describe('chave MOVER_CAIXA_RF_HABILITADO', () => {
  it('desligada por padrão; liga só com "true"', () => {
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', '');
    expect(moverCaixaRfHabilitado()).toBe(false);
    vi.stubEnv('MOVER_CAIXA_RF_HABILITADO', '1');
    expect(moverCaixaRfHabilitado()).toBe(false);
    ligar();
    expect(moverCaixaRfHabilitado()).toBe(true);
  });

  it('overrides válidos: 6 desligada, 9 ligada', () => {
    desligar();
    expect(categoriasComOverrideValido()).toEqual([...CATEGORIAS_MOVIVEIS]);
    ligar();
    expect(categoriasComOverrideValido()).toEqual([...CATEGORIAS_MOVIVEIS_TODAS]);
  });
});

describe('categorias e grupos', () => {
  it('CATEGORIAS_MOVIVEIS continua com as 6 da fase 1', () => {
    expect(CATEGORIAS_MOVIVEIS).toEqual(['fimFia', 'fiis', 'acoes', 'stocks', 'reits', 'etfs']);
    expect(CATEGORIAS_CAIXA_RF).toEqual([
      'reservaEmergencia',
      'reservaOportunidade',
      'rendaFixaFundos',
    ]);
    expect(CATEGORIAS_MOVIVEIS_TODAS).toHaveLength(9);
  });

  it('guards e grupos', () => {
    expect(isCategoriaMovivel('rendaFixaFundos')).toBe(false);
    expect(isCategoriaMovivelTodas('rendaFixaFundos')).toBe(true);
    expect(isCategoriaCaixaRf('reservaOportunidade')).toBe(true);
    expect(isCategoriaCaixaRf('fiis')).toBe(false);
    expect(grupoDaCategoria('reservaEmergencia')).toBe('caixaRf');
    expect(grupoDaCategoria('acoes')).toBe('rv');
    expect(categoriasDoGrupo('rendaFixaFundos')).toBe(CATEGORIAS_CAIXA_RF);
    expect(categoriasDoGrupo('etfs')).toBe(CATEGORIAS_MOVIVEIS);
  });

  it('Records completos: seções, campos, rotas e planejados', () => {
    expect(SUBGRUPOS_POR_CATEGORIA.reservaEmergencia).toEqual([]);
    expect(SUBGRUPOS_POR_CATEGORIA.reservaOportunidade).toEqual([]);
    expect(SUBGRUPOS_POR_CATEGORIA.rendaFixaFundos.map((s) => s.label)).toEqual([
      'Pós-fixada',
      'Pré-fixada',
      'Híbrida',
    ]);
    for (const c of CATEGORIAS_CAIXA_RF) {
      expect(SUBGRUPO_EDITAVEL[c]).toBe(false);
      expect(CAMPO_SUBGRUPO_PORTFOLIO[c]).toBeNull();
      expect(CATEGORIA_TO_ABA_PLANEJAVEL[c]).toBeUndefined();
    }
    for (const c of CATEGORIAS_MOVIVEIS) expect(SUBGRUPO_EDITAVEL[c]).toBe(true);
    expect(CAMPO_SECAO_NA_LINHA.rendaFixaFundos).toBe('tipo');
    expect(CAMPO_SECAO_NA_LINHA.reservaEmergencia).toBeNull();
    expect(CATEGORIA_API_PATH.rendaFixaFundos).toBe('renda-fixa');
    expect(CATEGORIA_API_PATH.reservaEmergencia).toBe('reserva-emergencia');
    expect(CATEGORIA_API_PATH.reservaOportunidade).toBe('reserva-oportunidade');
  });

  it('subgrupoPadrao do trio: RF = seção derivada; Reservas sem seção', () => {
    expect(subgrupoPadrao('rendaFixaFundos', { secaoRendaFixa: 'hibrida' })).toBe('hibrida');
    expect(subgrupoPadrao('rendaFixaFundos')).toBe('prefixada');
    expect(subgrupoPadrao('reservaEmergencia')).toBe('');
    expect(subgrupoPadrao('reservaOportunidade')).toBe('');
  });

  it('IR: trocar dentro do trio nunca avisa', () => {
    expect(mudaRegraIR('rendaFixaFundos', 'reservaEmergencia')).toBe(false);
    expect(mudaRegraIR('reservaOportunidade', 'reservaEmergencia')).toBe(false);
  });

  it('zod do POST continua com as 6 (a fatia A troca para TODAS)', () => {
    expect(
      moverInvestimentoSchema.safeParse({
        acao: 'mover',
        tipo: 'posicao',
        id: 'p1',
        categoria: 'reservaEmergencia',
        subgrupo: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('chave DESLIGADA: idêntico à fase 1', () => {
  it.each(CASOS_CAIXA_RF)('$nome: fora do mover (base null, fixo, 6 recusadas)', (caso) => {
    desligar();
    expect(categoriaBaseDaAba(caso.asset, caso.baseCtx)).toBeNull();
    expect(modeloDePreco(caso.asset, ctxDe(caso))).toBe('fixo');
    const destinos = destinosPermitidos(caso.asset, {
      ...ctxDe(caso),
      categoriaFixa: caso.base,
    });
    expect(destinos.map((d) => d.categoria)).toEqual([...CATEGORIAS_MOVIVEIS]);
    expect(destinos.every((d) => !d.permitido)).toBe(true);
    expect(destinos[0].motivo).toBe(motivoNaoMovivel(caso.base));
    // override do trio gravado com a chave ligada é ignorado: volta à aba de origem.
    for (const c of CATEGORIAS_CAIXA_RF) {
      expect(overrideEfetivo(caso.asset, c, caso.baseCtx)).toBeNull();
      expect(categoriaDaAba(caso.asset, c, caso.baseCtx)).toBeNull();
    }
  });

  it('FII: destinos deep-equal à saída da fase 1', () => {
    desligar();
    expect(destinosPermitidos(a('HGLG11', 'fii'))).toEqual(FII_FASE_1);
  });

  it('caixaRfLiberado=false força a fase 1 mesmo com a env ligada', () => {
    ligar();
    expect(destinosPermitidos(a('HGLG11', 'fii'), { caixaRfLiberado: false })).toEqual(FII_FASE_1);
    expect(
      destinosPermitidos(a('RESERVA-EMERG-1', 'emergency'), { caixaRfLiberado: false }).map(
        (d) => d.categoria,
      ),
    ).toEqual([...CATEGORIAS_MOVIVEIS]);
  });

  it.each(CASOS_RV)('$nome: as 6 entradas iguais com a chave ligada ou desligada', (caso) => {
    desligar();
    const off = destinosPermitidos(caso.asset, ctxDe(caso));
    expect(categoriaBaseDaAba(caso.asset)).toBe(caso.base);
    expect(modeloDePreco(caso.asset, ctxDe(caso))).toBe(caso.modelo);
    ligar();
    const on = destinosPermitidos(caso.asset, ctxDe(caso));
    expect(on.filter((d) => isCategoriaMovivel(d.categoria))).toEqual(off);
    expect(categoriaBaseDaAba(caso.asset)).toBe(caso.base);
    expect(modeloDePreco(caso.asset, ctxDe(caso))).toBe(caso.modelo);
  });
});

describe('chave LIGADA: matriz do trio', () => {
  it.each(CASOS_CAIXA_RF)('$nome', (caso) => {
    ligar();
    expect(categoriaBaseDaAba(caso.asset, caso.baseCtx)).toBe(caso.base);
    expect(modeloDePreco(caso.asset, ctxDe(caso))).toBe('curva');
    expect(isSaldoSemTitulo(caso.asset, ctxDe(caso))).toBe(caso.semTitulo);

    const destinos = destinosPermitidos(caso.asset, ctxDe(caso));
    expect(destinos.map((d) => d.categoria)).toEqual([...CATEGORIAS_MOVIVEIS_TODAS]);
    for (const d of destinos) {
      if (d.permitido) expect(d.motivo).toBeUndefined();
      else expect(d.motivo).toBeTruthy();
      if (!isCategoriaCaixaRf(d.categoria)) {
        expect(d.permitido).toBe(false);
        expect(d.motivo).toBe(
          caso.semTitulo ? MOTIVO_SALDO_SEM_COTACAO_BOLSA : MOTIVO_SEM_COTACAO_BOLSA,
        );
      }
    }
    const rf = destinos.find((d) => d.categoria === 'rendaFixaFundos')!;
    if (caso.base === 'rendaFixaFundos') expect(rf.permitido).toBe(true);
    else if (caso.semTitulo) {
      expect(rf).toEqual({
        categoria: 'rendaFixaFundos',
        permitido: false,
        motivo: MOTIVO_SALDO_SEM_TITULO,
      });
    } else expect(rf.permitido).toBe(true);
    // As duas Reservas sempre trocam entre si.
    expect(destinos.find((d) => d.categoria === 'reservaEmergencia')!.permitido).toBe(true);
    expect(destinos.find((d) => d.categoria === 'reservaOportunidade')!.permitido).toBe(true);
  });

  it('saldo sem título já movido para a Oportunidade: a RF continua travada', () => {
    ligar();
    const conta = a('CONTA-CORRENTE-EMERG-1', 'emergency');
    const d = destinoPermitido(conta, 'rendaFixaFundos', { atual: 'reservaOportunidade' });
    expect(d.motivo).toBe(MOTIVO_SALDO_SEM_TITULO);
    expect(destinoPermitido(conta, 'reservaEmergencia', { atual: 'reservaOportunidade' })).toEqual({
      categoria: 'reservaEmergencia',
      permitido: true,
    });
  });

  it.each(CASOS_RV)('$nome: as 3 do trio recusadas com MOTIVO_COM_COTACAO', (caso) => {
    ligar();
    const destinos = destinosPermitidos(caso.asset, ctxDe(caso));
    expect(destinos).toHaveLength(9);
    for (const c of CATEGORIAS_CAIXA_RF) {
      expect(destinoPermitido(caso.asset, c, ctxDe(caso))).toEqual({
        categoria: c,
        permitido: false,
        motivo: MOTIVO_COM_COTACAO,
      });
    }
  });

  it('planejado: o trio recusado com MOTIVO_PLANEJADO_RV; o resto igual à fase 1', () => {
    ligar();
    const destinos = destinosPermitidos(a('HGLG11', 'fii'), { tipo: 'planejado' });
    expect(destinos.filter((d) => isCategoriaMovivel(d.categoria))).toEqual(FII_FASE_1);
    for (const c of CATEGORIAS_CAIXA_RF) {
      expect(destinos.find((d) => d.categoria === c)!.motivo).toBe(MOTIVO_PLANEJADO_RV);
    }
    // Planejado de Tesouro (Watchlist) não entra no trio.
    const tesouro = destinosPermitidos(a('TESOURO-SELIC-2031', 'tesouro-direto'), {
      tipo: 'planejado',
    });
    expect(tesouro.every((d) => !d.permitido)).toBe(true);
  });

  it.each(FIXOS)('$nome: as 9 recusadas', ({ asset }) => {
    ligar();
    const destinos = destinosPermitidos(asset, { categoriaFixa: 'imoveisBens' });
    expect(destinos).toHaveLength(9);
    expect(destinos.every((d) => !d.permitido && d.motivo)).toBe(true);
    expect(categoriaBaseDaAba(asset)).toBeNull();
    expect(modeloDePreco(asset)).toBe('fixo');
  });
});

describe('overrideEfetivo com a chave ligada', () => {
  const cdb = a('RENDA-FIXA-1', 'bond');
  const tesouro = a('TESOURO-SELIC-2031', 'tesouro-direto');

  it('override igual à base → null', () => {
    ligar();
    expect(overrideEfetivo(cdb, 'rendaFixaFundos')).toBeNull();
    expect(overrideEfetivo(cdb, 'reservaEmergencia')).toBe('reservaEmergencia');
    expect(categoriaDaAba(cdb, 'reservaEmergencia')).toBe('reservaEmergencia');
  });

  it('Tesouro de catálogo em reserva + rendaFixaFundos: com ctx = efetivo, sem ctx = null', () => {
    ligar();
    const ctx: BaseCtx = { reservaDestino: 'emergencia' };
    expect(overrideEfetivo(tesouro, 'rendaFixaFundos', ctx)).toBe('rendaFixaFundos');
    expect(categoriaDaAba(tesouro, 'rendaFixaFundos', ctx)).toBe('rendaFixaFundos');
    expect(overrideEfetivo(tesouro, 'rendaFixaFundos')).toBeNull();
    expect(categoriaDaAba(tesouro, null, ctx)).toBe('reservaEmergencia');
  });

  it('override de OUTRO grupo é ignorado nos dois sentidos', () => {
    ligar();
    expect(overrideEfetivo(cdb, 'acoes')).toBeNull();
    expect(categoriaDaAba(cdb, 'acoes')).toBe('rendaFixaFundos');
    expect(overrideEfetivo(a('HGLG11', 'fii'), 'rendaFixaFundos')).toBeNull();
    expect(categoriaDaAba(a('HGLG11', 'fii'), 'reservaEmergencia')).toBe('fiis');
  });

  it('normalizarReservaDestino', () => {
    expect(normalizarReservaDestino('reserva-emergencia')).toBe('emergencia');
    expect(normalizarReservaDestino('emergency')).toBe('emergencia');
    expect(normalizarReservaDestino('reserva-oportunidade')).toBe('oportunidade');
    expect(normalizarReservaDestino('renda-fixa-hibrida')).toBeNull();
    expect(normalizarReservaDestino(undefined)).toBeNull();
  });
});

describe('um item, uma aba', () => {
  const OVERRIDES: (string | null)[] = [null, 'lixo', ...CATEGORIAS_MOVIVEIS_TODAS];
  const TODOS = [
    ...CASOS_CAIXA_RF.map((c) => ({ asset: c.asset, baseCtx: c.baseCtx })),
    ...CASOS_RV.map((c) => ({ asset: c.asset, baseCtx: undefined })),
    ...FIXOS.map((c) => ({ asset: c.asset, baseCtx: undefined })),
  ];

  it.each([
    ['desligada', desligar],
    ['ligada', ligar],
  ] as const)('chave %s: cada item cai em no máximo UMA das 9 abas', (_n, setChave) => {
    setChave();
    for (const { asset, baseCtx } of TODOS) {
      for (const ov of OVERRIDES) {
        const abas = CATEGORIAS_MOVIVEIS_TODAS.filter(
          (cat) => categoriaDaAba(asset, ov, baseCtx) === cat,
        );
        expect(abas.length).toBeLessThanOrEqual(1);
        const base = categoriaBaseDaAba(asset, baseCtx);
        if (base) {
          // movível: sempre exatamente uma aba, do mesmo grupo da base
          expect(abas).toHaveLength(1);
          expect(grupoDaCategoria(abas[0])).toBe(grupoDaCategoria(base));
        }
      }
    }
  });

  it("'cash' fica só na Reserva de Oportunidade com a chave ligada", () => {
    ligar();
    expect(categoriaDaAba(a('CAIXA-1', 'cash'), null)).toBe('reservaOportunidade');
  });
});

describe('avisos da fase 2', () => {
  const hoje = new Date('2026-10-02T12:00:00Z');

  it('liquidez: CDB com liquidityType null e vencimento em 2030 → avisa na Emergência', () => {
    const fi = { liquidityType: null, maturityDate: new Date('2030-01-02T00:00:00Z') };
    expect(precisaAvisoLiquidez('reservaEmergencia', fi, hoje)).toBe(true);
    expect(precisaAvisoLiquidez('reservaOportunidade', fi, hoje)).toBe(false);
    expect(precisaAvisoLiquidez('rendaFixaFundos', fi, hoje)).toBe(false);
  });

  it('liquidez: MATURITY > 360d avisa; DAILY, curto ou sem FI não', () => {
    expect(
      precisaAvisoLiquidez(
        'reservaEmergencia',
        { liquidityType: 'MATURITY', maturityDate: '2028-01-01' },
        hoje,
      ),
    ).toBe(true);
    expect(
      precisaAvisoLiquidez(
        'reservaEmergencia',
        { liquidityType: 'DAILY', maturityDate: '2030-01-01' },
        hoje,
      ),
    ).toBe(false);
    expect(
      precisaAvisoLiquidez(
        'reservaEmergencia',
        { liquidityType: null, maturityDate: '2027-06-01' },
        hoje,
      ),
    ).toBe(false);
    expect(precisaAvisoLiquidez('reservaEmergencia', null, hoje)).toBe(false);
    expect(AVISO_LIQUIDEZ_RESERVA).toMatch(/liquidez diária/);
  });

  it('Saúde: só quando entra ou sai da Emergência', () => {
    expect(envolveReservaEmergencia('rendaFixaFundos', 'reservaEmergencia')).toBe(true);
    expect(envolveReservaEmergencia('reservaEmergencia', 'reservaOportunidade')).toBe(true);
    expect(envolveReservaEmergencia('rendaFixaFundos', 'reservaOportunidade')).toBe(false);
    expect(envolveReservaEmergencia('reservaEmergencia', 'reservaEmergencia')).toBe(false);
  });

  it('seção automática só no destino RF', () => {
    expect(secaoAutomaticaDe('rendaFixaFundos', 'pos-fixada')).toEqual({
      id: 'pos-fixada',
      label: 'Pós-fixada',
      via: 'indexador',
    });
    expect(secaoAutomaticaDe('rendaFixaFundos', 'prefixada', 'titulo')?.via).toBe('titulo');
    expect(secaoAutomaticaDe('reservaEmergencia', 'pos-fixada')).toBeNull();
  });
});
