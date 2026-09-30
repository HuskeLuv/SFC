/**
 * Formato único de CNPJ nas tabelas da Análise de Ativos: 14 dígitos SEM máscara (contrato da spec;
 * igual a `cvm_fund_quotas`). Todo CNPJ lido de fonte (CVM: '84.429.695/0001-11'; B3: dígitos) passa
 * por aqui na ingestão (fatias A, B, D, E).
 */

/** '84.429.695/0001-11' | '84429695000111' ⇒ '84429695000111'; sem 14 dígitos ou só zeros ⇒ null. */
export function normalizarCnpj(s: string | null | undefined): string | null {
  const d = (s ?? '').replace(/\D/g, '');
  if (d.length !== 14 || /^0+$/.test(d)) return null;
  return d;
}

/** Igual a normalizarCnpj, mas devolve o texto original quando não normaliza (chave nunca some). */
export function cnpjOuOriginal(s: string): string {
  return normalizarCnpj(s) ?? s.trim();
}

/**
 * CNPJ (14 dígitos) do 1º campo da linha CRUA de um CSV da CVM ('84.429.695/0001-11;…') — para o
 * preFiltro barato antes do split, que compara com conjuntos já normalizados.
 */
export function cnpjDoInicioDaLinha(bruta: string, separador = ';'): string | null {
  const fim = bruta.indexOf(separador);
  return normalizarCnpj(bruta.slice(0, fim < 0 ? 20 : Math.min(fim, 20)));
}
