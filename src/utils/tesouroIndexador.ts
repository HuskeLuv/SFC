/**
 * Auto-detecção do indexador de um título Tesouro Direto a partir do nome.
 *
 * Catálogo coberto:
 *   - Tesouro Selic → CDI (pricer trata Selic como CDI)
 *   - Tesouro IPCA+ / IPCA+ com Juros Semestrais → IPCA
 *   - Tesouro Renda+ → IPCA
 *   - Tesouro Educa+ → IPCA
 *   - Tesouro Prefixado / Prefixado com Juros Semestrais → PRE
 *
 * Quando o nome não casa com nenhum padrão, retorna null — caller mantém o
 * controle manual do Select. Usado em Step4TesouroRendaFixa/Reserva pra
 * remover o passo extra de o usuário ter que selecionar o indexador (#6 do
 * checklist mai/28).
 */

export type TesouroIndexer = 'CDI' | 'IPCA' | 'PRE';

export const inferIndexerFromDescricao = (descricao: string): TesouroIndexer | null => {
  if (!descricao) return null;
  const lower = descricao.toLowerCase();
  if (/\bselic\b/.test(lower)) return 'CDI';
  if (/\bipca\b/.test(lower)) return 'IPCA';
  // Renda+ e Educa+ são produtos do Tesouro híbridos atrelados ao IPCA.
  if (/\brenda\s*\+/.test(lower) || /\beduca\s*\+/.test(lower)) return 'IPCA';
  if (/\bprefixado\b/.test(lower) || /\bpr[eé]\b/.test(lower)) return 'PRE';
  return null;
};
