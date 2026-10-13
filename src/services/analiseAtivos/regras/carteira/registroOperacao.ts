/**
 * Corpo das requisições do modal "Registrar operação" (fatia C1, rec. 2) sobre as rotas que JÁ
 * EXISTEM (sem tabela nova):
 *  - Compra → POST /api/carteira/operacao: estrategia (ação) ou tipoFii (FII) SEMPRE presente
 *    (secaoOperacao), taxaCorretagem 0, valorInvestido = quantidade × cotação (2 casas);
 *  - Venda (só com posição) → POST /api/carteira/resgate: metodoResgate 'quantidade', SEM
 *    instituicaoId (a rota usa a da última aquisição; com o campo, ela devolve 400 se for outra).
 * validarOperacao: inteiro > 0, venda ≤ posição, data não futura, seção na compra, preço > 0 e
 * instituição na compra. Funções puras.
 */
import type { ClasseQuadro } from '@/types/analiseAtivosApi';

export interface CorpoCompraOperacao {
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
}

export interface EntradaCompra {
  classe: ClasseQuadro;
  assetId: string;
  ticker: string;
  instituicaoId: string;
  data: string;
  quantidade: number;
  cotacao: number;
  /** estrategia (ação) ou tipoFii (FII), de secaoOperacao */
  secao: string;
}

export interface EntradaVenda {
  portfolioId: string;
  data: string;
  quantidade: number;
  cotacao: number;
}

export type ErroOperacao =
  | 'quantidade_invalida'
  | 'acima_da_posicao'
  | 'data_futura'
  | 'sem_secao'
  | 'preco_invalido'
  | 'sem_instituicao';

const centavos = (v: number): number => Math.round(v * 100) / 100;

export function montarCorpoCompra(e: EntradaCompra): CorpoCompraOperacao {
  const base = {
    tipoAtivo: e.classe === 'fii' ? ('fii' as const) : ('acao' as const),
    assetId: e.assetId,
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
  return {
    portfolioId: e.portfolioId,
    dataResgate: e.data,
    metodoResgate: 'quantidade',
    quantidade: e.quantidade,
    cotacaoUnitaria: e.cotacao,
  };
}

/** Erros na ordem dos campos do modal (o 1º recebe o foco). */
export function validarOperacao(e: {
  operacao: 'compra' | 'venda';
  quantidade: number;
  data: string;
  hoje: string;
  posicao: number | null;
  secao: string | null;
  /** opcionais: o modal valida também o preço e a instituição da compra */
  cotacao?: number | null;
  instituicaoId?: string | null;
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
  // AAAA-MM-DD compara como texto; data vazia também é inválida.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data) || e.data > e.hoje) erros.push('data_futura');
  if (e.operacao === 'compra' && !e.secao) erros.push('sem_secao');
  if (e.operacao === 'compra' && e.instituicaoId !== undefined && !e.instituicaoId) {
    erros.push('sem_instituicao');
  }
  return erros;
}
