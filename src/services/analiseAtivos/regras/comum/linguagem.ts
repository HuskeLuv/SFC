/**
 * Varredura de linguagem proibida (compliance, spec §9): a Análise de Ativos descreve números com
 * referência, nunca recomenda nem adjetiva ("barato", "preço justo", "nota"…).
 *
 * Casa PALAVRA INTEIRA, sem diferenciar maiúsculas nem acentos: 'nota' não casa 'anotação' nem
 * 'notável'; 'caro' não casa 'Carolina'; 'venda' não casa 'vendas'. Expressões ('preço justo',
 * 'preço-alvo') casam com espaço/hífen flexível. Usada pelos textos da fatia D e da fatia E.
 */

export const PALAVRAS_PROIBIDAS: readonly string[] = [
  'preço justo',
  'preço-alvo',
  'barato',
  'caro',
  'desconto',
  'oportunidade',
  'excelente',
  'exigente',
  'saudável',
  'bom',
  'ruim',
  'compre',
  'venda',
  'aproveite',
  'nota',
  'notas',
] as const;

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PADROES: ReadonlyArray<{ palavra: string; re: RegExp }> = PALAVRAS_PROIBIDAS.map(
  (palavra) => {
    const corpo = normalizar(palavra)
      .split(/[\s-]+/)
      .map(escaparRegex)
      .join('[\\s-]+');
    return { palavra, re: new RegExp(`(?<![\\p{L}\\p{N}])${corpo}(?![\\p{L}\\p{N}])`, 'u') };
  },
);

/** Palavras/expressões proibidas encontradas em `texto` (forma canônica da lista, sem repetição). */
export function encontrarPalavrasProibidas(texto: string): string[] {
  const alvo = normalizar(texto);
  return PADROES.filter((p) => p.re.test(alvo)).map((p) => p.palavra);
}
