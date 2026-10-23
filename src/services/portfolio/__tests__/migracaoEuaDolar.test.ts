import { describe, it, expect } from 'vitest';
import {
  acaoDaPosicao,
  buracosDaSerie,
  elegivelParaMigracao,
  montarRelatorioPreChecagem,
  notesComMarcadorUsd,
  planejarMigracaoAsset,
  posicaoPendente,
  renomearParaUsd,
  type AssetMigracao,
  type TxMigracao,
} from '../migracaoEuaDolar';
import { unidadeDaTransacao } from '@/lib/ativoEmDolar';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const STOCK: AssetMigracao = {
  id: 'a-aapl',
  symbol: 'AAPL-1700000000000-abc1234',
  name: 'AAPL - R$ 5.000 - 15/01/2025',
  type: 'stock',
  currency: 'USD',
};
const REIT: AssetMigracao = {
  id: 'a-o',
  symbol: 'O-1700000000000-xyz9876',
  name: 'O - $500 - 15/01/2025',
  type: 'reit',
  currency: 'USD',
};
const PETR4: AssetMigracao = {
  id: 'a-petr',
  symbol: 'PETR4',
  name: 'Petrobras',
  type: 'stock',
  currency: 'BRL',
};

let seq = 0;
const tx = (
  p: Partial<TxMigracao> & Pick<TxMigracao, 'type' | 'price' | 'quantity'>,
): TxMigracao => ({
  id: `t${++seq}`,
  total: p.quantity * p.price,
  fees: null,
  date: d('2025-01-15'),
  notes: null,
  ...p,
});
const notesFx = (fx: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ cotacaoMoeda: fx, operation: { moeda: 'USD', ...extra } });

/** Aplica o plano em memória (o que o --apply grava). */
const aplicar = (txs: TxMigracao[], asset: AssetMigracao): TxMigracao[] => {
  const plano = planejarMigracaoAsset(asset, txs, { serie: () => 5 });
  if (plano.status !== 'migrar') return txs;
  const porId = new Map(plano.atualizacoes.map((a) => [a.id, a.depois]));
  return txs.map((t) => (porId.has(t.id) ? { ...t, ...porId.get(t.id)! } : t));
};

describe('elegivelParaMigracao', () => {
  it('só stock/REIT manual em USD; PETR4 e ETF nunca', () => {
    expect(elegivelParaMigracao(STOCK)).toBe(true);
    expect(elegivelParaMigracao(REIT)).toBe(true);
    expect(elegivelParaMigracao(PETR4)).toBe(false);
    expect(elegivelParaMigracao({ ...PETR4, symbol: 'PETR4-1700000000000-abc' })).toBe(false);
    expect(elegivelParaMigracao({ ...STOCK, type: 'etf' })).toBe(false);
    expect(elegivelParaMigracao({ ...STOCK, symbol: 'AAPL' })).toBe(false);
  });

  it('PETR4 com cotacaoMoeda nas notes é pulado e nunca convertido', () => {
    const plano = planejarMigracaoAsset(
      PETR4,
      [tx({ type: 'compra', price: 30, quantity: 100, notes: notesFx(5) })],
      { serie: () => 5 },
    );
    expect(plano.status).toBe('pular');
  });
});

describe('planejarMigracaoAsset — REIT', () => {
  it('só ganha marcador; valores intactos; cotacaoMoeda copiada de notes.cotacaoMoeda', () => {
    const compra = tx({ type: 'compra', price: 50, quantity: 6, fees: 10, notes: notesFx(5.1) });
    const semNotes = tx({ type: 'compra', price: 52, quantity: 2, date: d('2025-03-01') });
    const plano = planejarMigracaoAsset(REIT, [compra, semNotes], { serie: () => 5 });
    expect(plano.status).toBe('migrar');
    if (plano.status !== 'migrar') return;
    expect(plano.atualizacoes).toHaveLength(2);
    const [a, b] = plano.atualizacoes;
    expect(a.classificacao).toBe('marcador-reit');
    expect(a.depois.price).toBe(50);
    expect(a.depois.total).toBe(300);
    const op = JSON.parse(a.depois.notes).operation;
    expect(op).toMatchObject({ unidade: 'USD', moeda: 'USD', cotacaoMoeda: 5.1 });
    expect(JSON.parse(a.depois.notes).cotacaoMoeda).toBe(5.1);
    // Sem cotação gravada: marcador com cotacaoMoeda null (REIT não precisa de fx).
    expect(JSON.parse(b.depois.notes).operation).toMatchObject({
      unidade: 'USD',
      cotacaoMoeda: null,
    });
    expect(plano.novoNome).toBeNull();
  });
});

describe('planejarMigracaoAsset — stock legado em R$', () => {
  it('compra: price ÷ fx, total = q × US$ (sem corretagem), fees em R$', () => {
    const compra = tx({
      type: 'compra',
      price: 500,
      quantity: 10,
      total: 5010,
      fees: 10,
      notes: notesFx(5),
    });
    const plano = planejarMigracaoAsset(STOCK, [compra], { serie: null });
    expect(plano.status).toBe('migrar');
    if (plano.status !== 'migrar') return;
    const [a] = plano.atualizacoes;
    expect(a.classificacao).toBe('compra-convertida');
    expect(a.depois.price).toBeCloseTo(100, 10);
    expect(a.depois.total).toBeCloseTo(1000, 10);
    expect(a.antes.fees).toBe(10);
    expect(unidadeDaTransacao({ notes: a.depois.notes }, STOCK)).toBe('USD');
  });

  it('compra sem fx pula o Asset inteiro', () => {
    const plano = planejarMigracaoAsset(
      STOCK,
      [
        tx({ type: 'compra', price: 500, quantity: 10, notes: notesFx(5) }),
        tx({ type: 'compra', price: 520, quantity: 5, date: d('2025-02-01') }),
      ],
      { serie: () => 5 },
    );
    expect(plano.status).toBe('pular');
    if (plano.status === 'pular') expect(plano.motivo).toMatch(/compra sem cotação/);
  });

  it('venda em US$ só ganha marcador; venda em R$ é dividida pelo câmbio', () => {
    const compra = tx({ type: 'compra', price: 500, quantity: 10, notes: notesFx(5) }); // US$ 100
    const vendaUsd = tx({ type: 'venda', price: 110, quantity: 2, date: d('2025-02-10') });
    const vendaBrl = tx({ type: 'venda', price: 600, quantity: 3, date: d('2025-03-10') });
    const plano = planejarMigracaoAsset(STOCK, [vendaBrl, compra, vendaUsd], {
      serie: (data) => (new Date(data).getTime() >= d('2025-03-01').getTime() ? 5.5 : 5),
    });
    expect(plano.status).toBe('migrar');
    if (plano.status !== 'migrar') return;
    const porId = new Map(plano.atualizacoes.map((a) => [a.id, a]));
    const u = porId.get(vendaUsd.id)!;
    expect(u.classificacao).toBe('venda-ja-em-usd');
    expect(u.depois.price).toBe(110);
    expect(JSON.parse(u.depois.notes).operation).toMatchObject({ unidade: 'USD', cotacaoMoeda: 5 });
    const b = porId.get(vendaBrl.id)!;
    expect(b.classificacao).toBe('venda-convertida');
    expect(b.depois.price).toBeCloseTo(600 / 5.5, 10);
    expect(b.depois.total).toBeCloseTo((3 * 600) / 5.5, 10);
    expect(JSON.parse(b.depois.notes).operation.cotacaoMoeda).toBe(5.5);
  });

  it('venda ambígua (nem US$ nem R$) manda o Asset para decidir à mão', () => {
    const plano = planejarMigracaoAsset(
      STOCK,
      [
        tx({ type: 'compra', price: 500, quantity: 10, notes: notesFx(5) }), // US$ 100
        tx({ type: 'venda', price: 250, quantity: 1, date: d('2025-02-10') }), // r = 2,5 e r÷5 = 0,5
      ],
      { serie: () => 5 },
    );
    expect(plano.status).toBe('decidir-a-mao');
  });

  it('venda fora da faixa sem câmbio na data também vai para decidir à mão', () => {
    const plano = planejarMigracaoAsset(
      STOCK,
      [
        tx({ type: 'compra', price: 500, quantity: 10, notes: notesFx(5) }),
        tx({ type: 'venda', price: 600, quantity: 1, date: d('2025-02-10') }),
      ],
      { serie: null },
    );
    expect(plano.status).toBe('decidir-a-mao');
  });

  it('--renomear troca R$ N por US$ N (valor da 1ª compra em US$)', () => {
    const plano = planejarMigracaoAsset(
      STOCK,
      [tx({ type: 'compra', price: 500, quantity: 10, notes: notesFx(5) })],
      { serie: null, renomear: true },
    );
    expect(plano.status === 'migrar' && plano.novoNome).toBe('AAPL - US$ 1.000 - 15/01/2025');
    expect(renomearParaUsd('Nome livre', 1000)).toBeNull();
  });

  it('preserva o resto das notes no merge do marcador', () => {
    const notas = notesComMarcadorUsd(
      JSON.stringify({ cotacaoMoeda: 5, origem: 'wizard', operation: { moeda: 'USD', x: 1 } }),
      5,
    );
    expect(JSON.parse(notas)).toEqual({
      cotacaoMoeda: 5,
      origem: 'wizard',
      operation: { moeda: 'USD', x: 1, unidade: 'USD', cotacaoMoeda: 5 },
    });
  });

  it('notes ilegível pula o Asset inteiro', () => {
    const plano = planejarMigracaoAsset(
      STOCK,
      [tx({ type: 'compra', price: 500, quantity: 10, notes: '{quebrado' })],
      { serie: () => 5 },
    );
    expect(plano.status).toBe('pular');
  });
});

describe('idempotência', () => {
  it('2ª rodada = 0 pendentes (stock e REIT)', () => {
    const stockTxs = [
      tx({ type: 'compra', price: 500, quantity: 10, notes: notesFx(5) }),
      tx({ type: 'venda', price: 600, quantity: 3, date: d('2025-03-10') }),
    ];
    const reitTxs = [tx({ type: 'compra', price: 50, quantity: 6 })];

    const stock1 = aplicar(stockTxs, STOCK);
    const reit1 = aplicar(reitTxs, REIT);
    expect(stock1[0].price).toBeCloseTo(100, 10);

    expect(planejarMigracaoAsset(STOCK, stock1, { serie: () => 5 })).toEqual({
      status: 'ja-migrado',
    });
    expect(planejarMigracaoAsset(REIT, reit1, { serie: () => 5 })).toEqual({
      status: 'ja-migrado',
    });
    // E não divide de novo.
    expect(aplicar(stock1, STOCK)[0].price).toBeCloseTo(100, 10);
  });
});

describe('posição (passo 5)', () => {
  it('posição encerrada não ganha Portfolio nem recálculo', () => {
    expect(acaoDaPosicao(null)).toEqual({ tipo: 'nenhuma' });
    expect(posicaoPendente(null)).toBe(false);
  });

  it('posição aberta: marca e recalcula pelo portfolioId; pendente até ter USD', () => {
    expect(acaoDaPosicao({ id: 'p1', moedaRegistro: null })).toEqual({
      tipo: 'marcar-e-recalcular',
      portfolioId: 'p1',
    });
    expect(posicaoPendente({ id: 'p1', moedaRegistro: null })).toBe(true);
    expect(posicaoPendente({ id: 'p1', moedaRegistro: 'USD' })).toBe(false);
  });
});

describe('pré-checagens', () => {
  it('buracos da série acima de 5 dias úteis, incluindo o trecho até hoje', () => {
    const { ultimoDia, buracos } = buracosDaSerie(
      [d('2026-06-01'), d('2026-06-02'), d('2026-06-05'), d('2026-06-07')],
      d('2026-10-22'),
    );
    expect(ultimoDia?.toISOString().slice(0, 10)).toBe('2026-06-07');
    expect(buracos).toHaveLength(1);
    expect(buracos[0].de.toISOString().slice(0, 10)).toBe('2026-06-07');
  });

  it('relatório lista proventos USD manuais e posições currency e alerta', () => {
    const r = montarRelatorioPreChecagem({
      assetsStockNaoBrl: [{ symbol: 'AAPL-1700000000000-abc', currency: 'USD' }],
      posicoesStock: [
        { symbol: 'PETR4', currency: 'BRL' },
        { symbol: 'VALE3', currency: 'BRL' },
      ],
      txUsd: [
        { symbol: 'O-1', type: 'reit', temPortfolio: true },
        { symbol: 'X-1', type: 'stock', temPortfolio: false },
      ],
      proventosUsd: [
        { symbol: 'O-1', dataPagamento: d('2026-05-10'), valorTotal: 3, source: 'manual' },
        { symbol: 'O-1', dataPagamento: d('2026-06-10'), valorTotal: 2.5, source: 'brapi' },
      ],
      posicoesCurrency: [{ symbol: 'USD-BRL', quantity: 500, totalInvested: 2600 }],
      serieDatas: [d('2026-06-05')],
      hoje: d('2026-10-22'),
    });
    const texto = r.linhas.join('\n');
    expect(texto).toMatch(/Posições 'stock': 2 \(BRL 2, USD 0, outra\/nula 0\)/);
    expect(texto).toMatch(/Transações stock\/USD: 0 com posição aberta, 1 de posição encerrada/);
    expect(texto).toMatch(/Proventos de ativos USD: 2 \(1 manuais/);
    expect(texto).toMatch(/USD-BRL qtd=500 investido=2600/);
    expect(r.alertas.some((a) => a.includes('provento(s) manual(is)'))).toBe(true);
    expect(r.alertas.some((a) => a.includes('buraco'))).toBe(true);
  });

  it('série vazia vira alerta', () => {
    const r = montarRelatorioPreChecagem({
      assetsStockNaoBrl: [],
      posicoesStock: [],
      txUsd: [],
      proventosUsd: [],
      posicoesCurrency: [],
      serieDatas: [],
      hoje: d('2026-10-22'),
    });
    expect(r.alertas).toContain('Série USD-BRL vazia — rodar o backfill do câmbio antes');
  });
});
