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
  // Remove acentos (NFD + strip combining marks) ANTES dos regex: o \b do JS é
  // ASCII, então /\bpré\b/ nunca casa "pré" em NFC ("é" não é word-char e
  // é→espaço não forma boundary) — "Tesouro Pré 2030" caía no null.
  const lower = descricao
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/\bselic\b/.test(lower)) return 'CDI';
  if (/\bipca\b/.test(lower)) return 'IPCA';
  // Renda+ e Educa+ são produtos do Tesouro híbridos atrelados ao IPCA.
  if (/\brenda\s*\+/.test(lower) || /\beduca\s*\+/.test(lower)) return 'IPCA';
  if (/\bprefixado\b/.test(lower) || /\bpre\b/.test(lower)) return 'PRE';
  return null;
};
