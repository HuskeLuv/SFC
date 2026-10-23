/**
 * Corpo das requisições do modal "Registrar operação" (fatia C1, rec. 2) sobre as rotas que JÁ
 * EXISTEM (sem tabela nova):
 *  - Compra → POST /api/carteira/operacao: estrategia (ação) ou tipoFii (FII) SEMPRE presente
 *    (secaoOperacao), taxaCorretagem 0, valorInvestido = quantidade × cotação (2 casas);
 *  - Venda (só com posição) → POST /api/carteira/resgate: metodoResgate 'quantidade', SEM
 *    instituicaoId (a rota usa a da última aquisição; com o campo, ela devolve 400 se for outra).
 * validarOperacao: inteiro > 0, venda ≤ posição, data não futura, preço > 0 e instituição na
 * compra. v2.5 (fatia C): a seção é automática (secaoOperacao nunca fica vazia), então não há mais
 * o erro 'sem_secao'. Funções puras.
 *
 * Stocks e REITs (feature EUA, fatia D; Carteira EUA em US$, out/2026) — o MESMO corpo nas duas
 * classes, independente da chave CARTEIRA_EUA_DOLAR_HABILITADO:
 *  - tipoAtivo 'stock' | 'reit', cotacaoUnitaria em US$, cotacaoMoeda (US$ → R$) e a seção
 *    (estrategia no stock, estrategiaReit no REIT), SEM valorInvestido: quem decide a unidade da
 *    gravação (US$, ou R$ no stock legado) é a rota, pela posição;
 *  - assetId = o Asset manual da POSIÇÃO (overlay; a recompra não cria outro Asset) ou
 *    'STOCK-MANUAL' | 'REIT-MANUAL' sem posição; `ativo` = ticker da Análise (BRK.B → 'BRKB-…').
 *  - venda: preço em US$ + cotacaoMoeda (obrigatória no resgate de ativo em dólar); a rota
 *    converte para a unidade da posição.
 */
import { ehClasseEua, type ClasseQuadro } from '@/types/analiseAtivosApi';

/** Asset.type de um Stock/REIT da Carteira (a compra usa o tipo do Asset que já existe). */
export type TipoOperacaoEua = 'stock' | 'reit';

export type CorpoCompraOperacao = CorpoCompraBr | CorpoCompraEua;

export interface CorpoCompraEua {
  tipoAtivo: TipoOperacaoEua;
  /** id do Asset manual da posição, ou 'STOCK-MANUAL' | 'REIT-MANUAL' */
  assetId: string;
  ativo: string;
  instituicaoId: string;
  /** AAAA-MM-DD */
  dataCompra: string;
  quantidade: number;
  /** US$ por ação */
  cotacaoUnitaria: number;
  /** cotação do dólar (US$ → R$) */
  cotacaoMoeda: number;
  taxaCorretagem: 0;
  estrategia?: string;
  estrategiaReit?: string;
}

export interface CorpoCompraBr {
  tipoAtivo: 'acao' | 'fii';
  assetId: string;
  ativo: string;
  instituicaoId: string;
  /** AAAA-MM-DD */
  dataCompra: string;
  quantidade: number;
  cotacaoUnitaria: number;
  valorInvestido: number;
  taxaCorretagem: 0;
  estrategia?: string;
  tipoFii?: string;
}

export interface CorpoResgateVenda {
  portfolioId: string;
  /** AAAA-MM-DD */
  dataResgate: string;
  metodoResgate: 'quantidade';
  quantidade: number;
  cotacaoUnitaria: number;
  /** EUA: cotação do dólar da venda */
  cotacaoMoeda?: number;
}

export interface EntradaCompra {
  classe: ClasseQuadro;
  /** BR: Asset do catálogo; EUA: Asset manual da posição (null → STOCK-MANUAL/REIT-MANUAL) */
  assetId: string | null;
  ticker: string;
  instituicaoId: string;
  data: string;
  quantidade: number;
  cotacao: number;
  /** estrategia (ação) ou tipoFii (FII), de secaoOperacao */
  secao: string;
  /** EUA: cotação do dólar (US$ → R$); `cotacao` fica em US$ */
  cambio?: number;
  /** EUA: Asset.type da posição (overlay.tipoAsset); sem posição, a classe */
  tipoAsset?: TipoOperacaoEua | null;
}

export interface EntradaVenda {
  portfolioId: string;
  data: string;
  quantidade: number;
  cotacao: number;
  /** EUA: classe, câmbio e Asset.type da posição (o preço vai na unidade da Carteira) */
  classe?: ClasseQuadro;
  cambio?: number;
  tipoAsset?: TipoOperacaoEua | null;
}

export type ErroOperacao =
  | 'quantidade_invalida'
  | 'acima_da_posicao'
  | 'data_futura'
  | 'preco_invalido'
  | 'sem_instituicao'
  | 'cambio_invalido';

const centavos = (v: number): number => Math.round(v * 100) / 100;

/** Tipo da operação EUA: o do Asset que já existe (overlay) ou o da classe. */
export function tipoOperacaoEua(
  classe: ClasseQuadro,
  tipoAsset?: TipoOperacaoEua | null,
): TipoOperacaoEua {
  return tipoAsset ?? (classe === 'reit' ? 'reit' : 'stock');
}

/**
 * Preço por ação que vai no corpo: EUA = US$ (stock e REIT; a rota converte para a unidade da
 * posição); BR = o próprio preço. `cambio`/`tipoAsset` ficam na assinatura por compatibilidade.
 */
export function precoNaCarteira(e: {
  classe: ClasseQuadro;
  cotacao: number;
  cambio?: number;
  tipoAsset?: TipoOperacaoEua | null;
}): number {
  return e.cotacao;
}

/** Total da operação em R$ (EUA: q × US$ × câmbio; BR: q × preço). */
export function totalEmReais(e: {
  classe: ClasseQuadro;
  quantidade: number;
  cotacao: number;
  cambio?: number;
}): number {
  return ehClasseEua(e.classe)
    ? e.quantidade * e.cotacao * (e.cambio ?? 0)
    : e.quantidade * e.cotacao;
}

function montarCorpoCompraEua(e: EntradaCompra): CorpoCompraEua {
  const tipo = tipoOperacaoEua(e.classe, e.tipoAsset);
  const cambio = e.cambio ?? 0;
  const base: CorpoCompraEua = {
    tipoAtivo: tipo,
    assetId: e.assetId ?? (tipo === 'stock' ? 'STOCK-MANUAL' : 'REIT-MANUAL'),
    ativo: e.ticker.trim().toUpperCase(),
    instituicaoId: e.instituicaoId,
    dataCompra: e.data,
    quantidade: e.quantidade,
    cotacaoUnitaria: e.cotacao,
    cotacaoMoeda: cambio,
    taxaCorretagem: 0,
  };
  return tipo === 'stock' ? { ...base, estrategia: e.secao } : { ...base, estrategiaReit: e.secao };
}

export function montarCorpoCompra(e: EntradaCompra): CorpoCompraOperacao {
  if (ehClasseEua(e.classe)) return montarCorpoCompraEua(e);
  const base = {
    tipoAtivo: e.classe === 'fii' ? ('fii' as const) : ('acao' as const),
    assetId: e.assetId ?? '',
    ativo: e.ticker.toUpperCase(),
    instituicaoId: e.instituicaoId,
    dataCompra: e.data,
    quantidade: e.quantidade,
    cotacaoUnitaria: e.cotacao,
    valorInvestido: centavos(e.quantidade * e.cotacao),
    taxaCorretagem: 0 as const,
  };
  return e.classe === 'fii' ? { ...base, tipoFii: e.secao } : { ...base, estrategia: e.secao };
}

export function montarCorpoVenda(e: EntradaVenda): CorpoResgateVenda {
  const corpo: CorpoResgateVenda = {
    portfolioId: e.portfolioId,
    dataResgate: e.data,
    metodoResgate: 'quantidade',
    quantidade: e.quantidade,
    cotacaoUnitaria: e.cotacao,
  };
  if (!e.classe || !ehClasseEua(e.classe)) return corpo;
  return { ...corpo, cotacaoMoeda: e.cambio ?? 0 };
}

/** Erros na ordem dos campos do modal (o 1º recebe o foco). */
export function validarOperacao(e: {
  operacao: 'compra' | 'venda';
  quantidade: number;
  data: string;
  hoje: string;
  posicao: number | null;
  /** opcionais: o modal valida também o preço e a instituição da compra */
  cotacao?: number | null;
  instituicaoId?: string | null;
  /** EUA: cotação do dólar (> 0) */
  cambio?: number | null;
}): ErroOperacao[] {
  const erros: ErroOperacao[] = [];
  const q = e.quantidade;
  if (!Number.isFinite(q) || !Number.isInteger(q) || q <= 0) erros.push('quantidade_invalida');
  else if (e.operacao === 'venda' && (e.posicao === null || q > e.posicao)) {
    erros.push('acima_da_posicao');
  }
  if (
    e.cotacao !== undefined &&
    !(e.cotacao !== null && Number.isFinite(e.cotacao) && e.cotacao > 0)
  ) {
    erros.push('preco_invalido');
  }
  if (e.cambio !== undefined && !(e.cambio !== null && Number.isFinite(e.cambio) && e.cambio > 0)) {
    erros.push('cambio_invalido');
  }
  // AAAA-MM-DD compara como texto; data vazia também é inválida.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data) || e.data > e.hoje) erros.push('data_futura');
  if (e.operacao === 'compra' && e.instituicaoId !== undefined && !e.instituicaoId) {
    erros.push('sem_instituicao');
  }
  return erros;
}
