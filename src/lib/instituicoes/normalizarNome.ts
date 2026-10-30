/** Normalização pura de nomes de instituições e de termos de busca (ClickUp 86e2xqh69). */

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Termo de busca: sem acento, minúsculas, espaços colapsados. */
export function normalizarBusca(s: string | null | undefined): string {
  return semAcento(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const SUFIXOS_SOCIETARIOS = new Set(['sa', 'ltda', 'me', 'epp', 'eireli', 'scfi']);

/**
 * Nome comparável: sem acento, minúsculas, sem pontuação, 'bco' → 'banco' e sem sufixos
 * societários no fim ('S.A.', 'S/A', 'Ltda'...). 'BANCO XP S.A.' e 'Banco XP SA' viram 'banco xp'.
 */
export function normalizarNomeInstituicao(nome: string | null | undefined): string {
  const base = semAcento(nome ?? '')
    .toLowerCase()
    // S.A. / S/A / S.A → sa (antes de tirar a pontuação, para não sobrar 's a')
    .replace(/\bs\s*[./]\s*a\b\.?/g, 'sa')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const palavras = base
    .split(' ')
    .filter(Boolean)
    .map((p) => (p === 'bco' ? 'banco' : p));
  while (palavras.length > 1 && SUFIXOS_SOCIETARIOS.has(palavras[palavras.length - 1])) {
    palavras.pop();
  }
  return palavras.join(' ');
}

/** Nome típico de corretora/distribuidora (não emite renda fixa coberta). Use em nome normalizado. */
export const NOME_DE_CORRETORA = /\b(ctvm|dtvm|cctvm|corretora|distribuidora|investimentos)\b/;
