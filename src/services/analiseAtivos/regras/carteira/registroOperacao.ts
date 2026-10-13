/**
 * STUB da fatia 0 — CORPO da fatia C1. Corpo das requisições do modal "Registrar operação" sobre as
 * rotas que JÁ EXISTEM (rec. 2; sem tabela nova):
 *  - Compra → POST /api/carteira/operacao: estrategia (ação) ou tipoFii (FII) SEMPRE presente
 *    (secaoOperacao), taxaCorretagem 0, valorInvestido = quantidade × cotação;
 *  - Venda (só com posição) → POST /api/carteira/resgate: metodoResgate 'quantidade', SEM
 *    instituicaoId (a rota usa a da última compra; o modal diz "na instituição da última compra").
 * validarOperacao: inteiro > 0, venda ≤ posição, data não futura. Assinaturas FINAIS.
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

export type ErroOperacao = 'quantidade_invalida' | 'acima_da_posicao' | 'data_futura' | 'sem_secao';

export function montarCorpoCompra(_e: EntradaCompra): CorpoCompraOperacao {
  throw new Error('montarCorpoCompra: não implementado (fatia C1)');
}

export function montarCorpoVenda(_e: EntradaVenda): CorpoResgateVenda {
  throw new Error('montarCorpoVenda: não implementado (fatia C1)');
}

export function validarOperacao(_e: {
  operacao: 'compra' | 'venda';
  quantidade: number;
  data: string;
  hoje: string;
  posicao: number | null;
  secao: string | null;
}): ErroOperacao[] {
  throw new Error('validarOperacao: não implementado (fatia C1)');
}
