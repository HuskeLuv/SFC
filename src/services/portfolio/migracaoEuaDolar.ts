/**
 * Migração da Carteira EUA em US$ (out/2026) — lógica PURA do
 * scripts/migrar-carteira-eua-dolar.ts (sem prisma: o script lê, chama estas funções e grava).
 *
 * Regra (docs/carteira-eua-dolar/desenho.json, migracao_dados):
 *  - Só Asset stock/reit com currency 'USD' (isAtivoEmDolar) e symbol manual
 *    ('TICKER-<13 dígitos>-<rnd>'). Ação BR nunca entra.
 *  - REIT: não converte valores — só grava o marcador notes.operation.{unidade, moeda} = 'USD'
 *    (e cotacaoMoeda, se faltar, a partir de notes.cotacaoMoeda).
 *  - Stock legado em R$: compras ÷ cotação gravada (sem ela, o Asset INTEIRO é pulado);
 *    vendas classificadas pela razão com o preço médio de compra em US$ (já em US$ / em R$ /
 *    ambígua → Asset inteiro para "decidir à mão").
 *  - fees continua em R$; total = quantidade × preço em US$ (sem corretagem).
 *  - Idempotente: transação com marcador 'USD' não é tocada; 2ª rodada = 0 pendentes.
 *  - Notes ilegível: o Asset inteiro é reportado e pulado.
 */
import {
  isAtivoEmDolar,
  lerNotesTransacao,
  marcadorOperacaoUsd,
  unidadeDaTransacao,
  MOEDA_REGISTRO_USD,
  type AtivoMoedaRef,
} from '@/lib/ativoEmDolar';
import type { SerieCambio } from '@/services/market/cambioUsdBrl';
import { isCorporateActionAuditTx } from './corporateActions';

/** Symbol de Asset manual criado pelo wizard: 'TICKER-<timestamp 13 dígitos>-<rnd>'. */
export const SIMBOLO_MANUAL_RE = /-\d{13}-/;

/** Faixa da razão preço da venda ÷ preço médio de compra que conta como "mesma unidade". */
const RAZAO_MIN = 0.5;
const RAZAO_MAX = 2;

export interface AssetMigracao extends AtivoMoedaRef {
  id: string;
  symbol: string;
  name: string | null;
}

export interface TxMigracao {
  id: string;
  type: string;
  quantity: number;
  price: number;
  total: number;
  fees: number | null;
  date: Date;
  notes: string | null;
}

export type ClassificacaoTx =
  | 'marcador-reit'
  | 'compra-convertida'
  | 'venda-ja-em-usd'
  | 'venda-convertida';

export interface AtualizacaoTx {
  id: string;
  classificacao: ClassificacaoTx;
  antes: { price: number; total: number; fees: number | null; notes: string | null };
  depois: { price: number; total: number; notes: string };
  /** Câmbio usado (conversão ou marcador); null = REIT sem cotação gravada. */
  fx: number | null;
}

export type PlanoAsset =
  | { status: 'ja-migrado' }
  | { status: 'pular'; motivo: string }
  | { status: 'decidir-a-mao'; motivo: string }
  | {
      status: 'migrar';
      atualizacoes: AtualizacaoTx[];
      /** Novo Asset.name (só com --renomear e nome no template 'X - R$ N - data'). */
      novoNome: string | null;
    };

export interface OpcoesPlano {
  serie: SerieCambio | null;
  renomear?: boolean;
}

/** O Asset entra na migração? (stock/reit em dólar, symbol manual). */
export const elegivelParaMigracao = (asset: AssetMigracao | null | undefined): boolean =>
  !!asset && isAtivoEmDolar(asset) && SIMBOLO_MANUAL_RE.test(asset.symbol);

const taxaValida = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** notes.cotacaoMoeda, senão notes.operation.cotacaoMoeda (mesma ordem de cotacaoMoedaDasNotes). */
const cotacaoGravada = (notes: Record<string, unknown> | null): number | null => {
  if (!notes) return null;
  const op =
    notes.operation && typeof notes.operation === 'object'
      ? (notes.operation as Record<string, unknown>)
      : null;
  return taxaValida(notes.cotacaoMoeda) ?? taxaValida(op?.cotacaoMoeda);
};

const notesIlegivel = (notes: string | null): boolean =>
  typeof notes === 'string' && notes.trim() !== '' && lerNotesTransacao(notes) === null;

/** Notes com o marcador US$ mesclado em `operation` (preserva o resto). */
export const notesComMarcadorUsd = (notes: string | null, fx: number | null): string => {
  const base = lerNotesTransacao(notes) ?? {};
  const op =
    base.operation && typeof base.operation === 'object'
      ? (base.operation as Record<string, unknown>)
      : {};
  const cotacao = taxaValida(op.cotacaoMoeda) ?? fx;
  return JSON.stringify({ ...base, operation: { ...op, ...marcadorOperacaoUsd(cotacao) } });
};

const TEMPLATE_NOME_RE = /^(.*?) - R\$\s?[\d.,]+ - (\d{2}\/\d{2}\/\d{4})\s*$/;

/** 'X - R$ N - data' → 'X - US$ N - data' (N em US$). Fora do template = null (não mexe). */
export const renomearParaUsd = (nome: string | null, valorUsd: number): string | null => {
  if (!nome) return null;
  const m = nome.match(TEMPLATE_NOME_RE);
  if (!m || !(valorUsd > 0)) return null;
  const valor = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valorUsd);
  return `${m[1]} - ${valor} - ${m[2]}`;
};

const ordenar = (txs: ReadonlyArray<TxMigracao>) =>
  [...txs].sort((a, b) => a.date.getTime() - b.date.getTime());

/**
 * Planeja a migração de UM Asset (todas as transações dele, de um usuário).
 * Não grava nada: devolve o antes/depois de cada linha ou o motivo de pular.
 */
export function planejarMigracaoAsset(
  asset: AssetMigracao,
  txs: ReadonlyArray<TxMigracao>,
  opcoes: OpcoesPlano,
): PlanoAsset {
  if (!elegivelParaMigracao(asset)) {
    return { status: 'pular', motivo: 'fora do escopo (não é stock/REIT manual em USD)' };
  }

  const ilegivel = txs.find((t) => notesIlegivel(t.notes));
  if (ilegivel) {
    return { status: 'pular', motivo: `notes ilegível na transação ${ilegivel.id}` };
  }

  // Linha de auditoria de evento corporativo é só exibição: não é convertida nem marcada.
  // Em stock ela indica split/grupamento, que fica para a fase 2 (decidir à mão).
  const auditoria = txs.filter((t) => isCorporateActionAuditTx(t.notes));
  const reais = txs.filter((t) => !isCorporateActionAuditTx(t.notes));
  const operacoes = ordenar(reais.filter((t) => t.type === 'compra' || t.type === 'venda'));
  const outros = reais.filter((t) => t.type !== 'compra' && t.type !== 'venda');
  // Transação já com marcador 'USD' não é tocada (idempotência).
  const marcadaUsd = (t: TxMigracao) => {
    const op = lerNotesTransacao(t.notes)?.operation as Record<string, unknown> | undefined;
    return op?.unidade === 'USD';
  };
  const pendentes = operacoes.filter((t) => !marcadaUsd(t));
  if (pendentes.length === 0) return { status: 'ja-migrado' };

  if (outros.length > 0) {
    return {
      status: 'decidir-a-mao',
      motivo: `transação de tipo não suportado (${[...new Set(outros.map((o) => o.type))].join(', ')})`,
    };
  }

  if (asset.type === 'reit') {
    const marcadaBrl = pendentes.find((t) => unidadeDaTransacao(t, asset) === 'BRL');
    if (marcadaBrl) {
      return {
        status: 'decidir-a-mao',
        motivo: `REIT com transação marcada em R$ (${marcadaBrl.id})`,
      };
    }
    return {
      status: 'migrar',
      novoNome: null,
      atualizacoes: pendentes.map((t) => {
        const fx = cotacaoGravada(lerNotesTransacao(t.notes));
        return {
          id: t.id,
          classificacao: 'marcador-reit' as const,
          antes: { price: t.price, total: t.total, fees: t.fees, notes: t.notes },
          depois: { price: t.price, total: t.total, notes: notesComMarcadorUsd(t.notes, fx) },
          fx,
        };
      }),
    };
  }

  if (auditoria.length > 0) {
    return { status: 'decidir-a-mao', motivo: 'stock com evento corporativo (split) registrado' };
  }

  // Stock legado em R$. Mistura de unidades no mesmo Asset (algumas já em US$, outras não)
  // não tem como ser reconstruída com segurança aqui.
  if (pendentes.length !== operacoes.length) {
    return {
      status: 'decidir-a-mao',
      motivo: 'stock com transações já em US$ e outras em R$ no mesmo ativo',
    };
  }

  // 1) Compras: sem cotação gravada em QUALQUER compra, o Asset inteiro é pulado.
  const compras = operacoes.filter((t) => t.type === 'compra');
  const compraSemFx = compras.find((t) => cotacaoGravada(lerNotesTransacao(t.notes)) === null);
  if (compraSemFx) {
    return {
      status: 'pular',
      motivo: `compra sem cotação do dólar (${compraSemFx.id} em ${compraSemFx.date.toISOString().slice(0, 10)})`,
    };
  }

  const atualizacoes: AtualizacaoTx[] = [];
  let qtdComprada = 0;
  let custoUsd = 0;
  let primeiraCompraUsd = 0;

  for (const t of operacoes) {
    const notes = lerNotesTransacao(t.notes);
    const antes = { price: t.price, total: t.total, fees: t.fees, notes: t.notes };

    if (t.type === 'compra') {
      const fx = cotacaoGravada(notes)!;
      const priceUsd = t.price / fx;
      const totalUsd = t.quantity * priceUsd;
      qtdComprada += t.quantity;
      custoUsd += totalUsd;
      if (primeiraCompraUsd === 0) primeiraCompraUsd = totalUsd;
      atualizacoes.push({
        id: t.id,
        classificacao: 'compra-convertida',
        antes,
        depois: { price: priceUsd, total: totalUsd, notes: notesComMarcadorUsd(t.notes, fx) },
        fx,
      });
      continue;
    }

    // 2) Venda: razão com o preço médio de compra em US$ até a data (ou de todas as compras,
    // se a venda vier antes de qualquer compra registrada).
    const medioUsd =
      qtdComprada > 0
        ? custoUsd / qtdComprada
        : compras.reduce(
            (s, c) => s + c.quantity * (c.price / cotacaoGravada(lerNotesTransacao(c.notes))!),
            0,
          ) / compras.reduce((s, c) => s + c.quantity, 0);
    if (!(medioUsd > 0)) {
      return { status: 'decidir-a-mao', motivo: `venda ${t.id} sem preço médio de compra` };
    }
    // Câmbio da venda: a cotação gravada; sem ela, a série na data.
    const fxVenda = cotacaoGravada(notes) ?? opcoes.serie?.(t.date) ?? null;
    const r = t.price / medioUsd;
    const jaEmUsd = r > RAZAO_MIN && r < RAZAO_MAX;
    const rBrl = fxVenda ? r / fxVenda : null;
    const emBrl = rBrl !== null && rBrl > RAZAO_MIN && rBrl < RAZAO_MAX;

    if (jaEmUsd === emBrl) {
      return {
        status: 'decidir-a-mao',
        motivo: `venda ${t.id} ambígua (preço ÷ médio US$ = ${r.toFixed(2)}${fxVenda ? `, câmbio ${fxVenda.toFixed(4)}` : ', sem câmbio na data'})`,
      };
    }

    if (jaEmUsd) {
      atualizacoes.push({
        id: t.id,
        classificacao: 'venda-ja-em-usd',
        antes,
        depois: {
          price: t.price,
          total: t.quantity * t.price,
          notes: notesComMarcadorUsd(t.notes, fxVenda),
        },
        fx: fxVenda,
      });
    } else {
      const priceUsd = t.price / fxVenda!;
      atualizacoes.push({
        id: t.id,
        classificacao: 'venda-convertida',
        antes,
        depois: {
          price: priceUsd,
          total: t.quantity * priceUsd,
          notes: notesComMarcadorUsd(t.notes, fxVenda),
        },
        fx: fxVenda,
      });
    }
  }

  return {
    status: 'migrar',
    atualizacoes,
    novoNome: opcoes.renomear ? renomearParaUsd(asset.name, primeiraCompraUsd) : null,
  };
}

/** Recorte do Portfolio que decide o passo 5 (posição). */
export interface PosicaoMigracao {
  id: string;
  moedaRegistro: string | null;
}

export type AcaoPosicao =
  /** Posição aberta: grava moedaRegistro 'USD' e recalcula pelo portfolioId (sem snapshots). */
  | { tipo: 'marcar-e-recalcular'; portfolioId: string }
  /** Posição encerrada: só as transações mudam — NÃO recalcula (criaria Portfolio zerado). */
  | { tipo: 'nenhuma' };

/** Passo 5: o que fazer com a posição depois de migrar as transações. */
export const acaoDaPosicao = (posicao: PosicaoMigracao | null | undefined): AcaoPosicao =>
  posicao ? { tipo: 'marcar-e-recalcular', portfolioId: posicao.id } : { tipo: 'nenhuma' };

/**
 * Asset já migrado (transações marcadas) com posição aberta sem moedaRegistro 'USD' — ex.: uma
 * rodada anterior que caiu entre a $transaction e o recálculo. Pendente só da posição.
 */
export const posicaoPendente = (posicao: PosicaoMigracao | null | undefined): boolean =>
  !!posicao && posicao.moedaRegistro !== MOEDA_REGISTRO_USD;

// ---------------------------------------------------------------------------
// Pré-checagens (só leitura): o script consulta, estas funções montam o relatório.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const diaUtc = (d: Date) => Math.floor(d.getTime() / DAY_MS) * DAY_MS;
const ehDiaUtil = (ms: number) => {
  const dow = new Date(ms).getUTCDay();
  return dow !== 0 && dow !== 6;
};

/** Dias úteis (seg–sex) estritamente entre `de` e `ate`. */
export const diasUteisEntre = (de: Date, ate: Date): number => {
  let n = 0;
  for (let ms = diaUtc(de) + DAY_MS; ms < diaUtc(ate); ms += DAY_MS) if (ehDiaUtil(ms)) n += 1;
  return n;
};

export interface BuracoSerie {
  de: Date;
  ate: Date;
  diasUteis: number;
}

/**
 * Buracos da série USD-BRL acima de `limite` dias úteis, incluindo o trecho final até `hoje`
 * (ex.: a série parada desde 07/06/2026).
 */
export const buracosDaSerie = (
  datas: ReadonlyArray<Date>,
  hoje: Date,
  limite = 5,
): { ultimoDia: Date | null; buracos: BuracoSerie[] } => {
  const dias = [...new Set(datas.map(diaUtc))].sort((a, b) => a - b).map((ms) => new Date(ms));
  if (dias.length === 0) return { ultimoDia: null, buracos: [] };
  const buracos: BuracoSerie[] = [];
  const pontos = [...dias, new Date(diaUtc(hoje))];
  for (let i = 1; i < pontos.length; i++) {
    const n = diasUteisEntre(pontos[i - 1], pontos[i]);
    if (n > limite) buracos.push({ de: pontos[i - 1], ate: pontos[i], diasUteis: n });
  }
  return { ultimoDia: dias[dias.length - 1], buracos };
};

export interface DadosPreChecagem {
  /** Assets type 'stock' com currency <> 'BRL' ou nula. */
  assetsStockNaoBrl: Array<{ symbol: string; currency: string | null }>;
  /** Posições (Portfolio) de Asset type 'stock', com a currency do Asset. */
  posicoesStock: Array<{ symbol: string; currency: string | null }>;
  /** Transações de stock/REIT em USD, com indicação de posição aberta. */
  txUsd: Array<{ symbol: string; type: string; temPortfolio: boolean }>;
  /** portfolio_proventos de ativos em USD (manuais: unidade presumida US$). */
  proventosUsd: Array<{ symbol: string; dataPagamento: Date; valorTotal: number; source: string }>;
  /** Posições de Asset type 'currency' (afetadas pelo parseFloat de F0). */
  posicoesCurrency: Array<{ symbol: string; quantity: number; totalInvested: number }>;
  /** Datas da série USD-BRL em asset_price_history. */
  serieDatas: Date[];
  hoje: Date;
}

export interface RelatorioPreChecagem {
  linhas: string[];
  /** Achados que pedem atenção antes do --apply. */
  alertas: string[];
}

const dia = (d: Date) => d.toISOString().slice(0, 10);

export function montarRelatorioPreChecagem(d: DadosPreChecagem): RelatorioPreChecagem {
  const linhas: string[] = [];
  const alertas: string[] = [];

  linhas.push(`Assets 'stock' com currency <> BRL ou nula: ${d.assetsStockNaoBrl.length}`);
  const semMoeda = d.assetsStockNaoBrl.filter((a) => a.currency == null);
  if (semMoeda.length > 0) {
    alertas.push(
      `${semMoeda.length} asset(s) 'stock' com currency NULA (nem BR nem EUA): ${semMoeda
        .slice(0, 10)
        .map((a) => a.symbol)
        .join(', ')}`,
    );
  }

  const stockBrl = d.posicoesStock.filter((p) => p.currency === 'BRL').length;
  const stockUsd = d.posicoesStock.filter((p) => p.currency === 'USD').length;
  const stockOutra = d.posicoesStock.length - stockBrl - stockUsd;
  linhas.push(
    `Posições 'stock': ${d.posicoesStock.length} (BRL ${stockBrl}, USD ${stockUsd}, outra/nula ${stockOutra})`,
  );
  if (stockOutra > 0) {
    alertas.push(`${stockOutra} posição(ões) 'stock' sem currency BRL/USD — conferir à mão`);
  }

  const porTipo = (type: string, aberta: boolean) =>
    d.txUsd.filter((t) => t.type === type && t.temPortfolio === aberta).length;
  linhas.push(
    `Transações stock/USD: ${porTipo('stock', true)} com posição aberta, ${porTipo('stock', false)} de posição encerrada`,
  );
  linhas.push(
    `Transações reit/USD:  ${porTipo('reit', true)} com posição aberta, ${porTipo('reit', false)} de posição encerrada`,
  );

  const manuais = d.proventosUsd.filter((p) => p.source === 'manual');
  linhas.push(
    `Proventos de ativos USD: ${d.proventosUsd.length} (${manuais.length} manuais — unidade presumida US$)`,
  );
  for (const p of manuais.slice(0, 20)) {
    linhas.push(`    · ${p.symbol} ${dia(p.dataPagamento)} valorTotal=${p.valorTotal}`);
  }
  if (manuais.length > 0) {
    alertas.push(
      `${manuais.length} provento(s) manual(is) de ativo USD serão lidos como US$ — conferir se não foram lançados em R$`,
    );
  }

  linhas.push(
    `Posições 'currency' (valoração muda com o parseFloat de F0): ${d.posicoesCurrency.length}`,
  );
  for (const p of d.posicoesCurrency.slice(0, 20)) {
    linhas.push(`    · ${p.symbol} qtd=${p.quantity} investido=${p.totalInvested}`);
  }

  const { ultimoDia, buracos } = buracosDaSerie(d.serieDatas, d.hoje);
  linhas.push(
    `Série USD-BRL: ${d.serieDatas.length} pontos, último dia ${ultimoDia ? dia(ultimoDia) : '—'}`,
  );
  for (const b of buracos) {
    linhas.push(`    · buraco ${dia(b.de)} → ${dia(b.ate)} (${b.diasUteis} dias úteis)`);
  }
  if (!ultimoDia) alertas.push('Série USD-BRL vazia — rodar o backfill do câmbio antes');
  else if (buracos.length > 0) {
    alertas.push(
      `Série USD-BRL com ${buracos.length} buraco(s) > 5 dias úteis — os dias faltantes repetem a última taxa`,
    );
  }

  return { linhas, alertas };
}
