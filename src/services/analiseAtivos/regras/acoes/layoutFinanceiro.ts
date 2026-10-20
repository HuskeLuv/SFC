/**
 * Layout financeiro do DRE (banco/seguradora): a conta 3.01 é "Receitas da Intermediação Financeira",
 * "Prêmios...", "Receitas de Seguros" ou "Receitas das Atividades Seguradoras" (BBSE3). Decide, na ingestão e sem depender da classificação setorial
 * da fatia C: (a) CvmCompany.layoutFinanceiro (fallback de financeira quando não há AssetSetorB3);
 * (b) gravar também o escopo individual em AssetStatementLine (bancos usam o individual BR GAAP,
 * decisão 3); (c) o que "não se aplica" no próprio documento (EBIT, D&A, AC/PC).
 */
import type { LinhaDemonstrativo } from '@/services/analiseAtivos/regras/acoes/extrairFundamentos';

export const RE_RECEITA_FINANCEIRA =
  /Intermedia[cç][aã]o Financeira|Pr[eê]mios|Receitas? de Seguros|Atividades? Seguradora/i;

/**
 * Modelo antigo de seguradora/resseguradora (BBSE3 e IRBR3 de 2016 a 2022): a 3.01 é "Receitas das
 * Operações". O rótulo é genérico, então só vale para o Set de seguradoras (A6, fatia B) — uma
 * industrial com o mesmo rótulo não muda.
 */
export const RE_RECEITA_SEGURADORA_ANTIGA = /^Receitas das Opera[cç][oõ]es\s*$/i;

export function ehLayoutFinanceiro(
  linhasDre: LinhaDemonstrativo[],
  opts: { seguradora?: boolean } = {},
): boolean {
  const receita = linhasDre.find((l) => l.demonstrativo === 'DRE' && l.cdConta === '3.01');
  if (!receita) return false;
  if (RE_RECEITA_FINANCEIRA.test(receita.dsConta)) return true;
  return opts.seguradora === true && RE_RECEITA_SEGURADORA_ANTIGA.test(receita.dsConta.trim());
}
