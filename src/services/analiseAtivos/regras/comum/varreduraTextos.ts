/**
 * Varredura de linguagem do Bloco D (compliance): a lista da Fase 1 (PALAVRAS_PROIBIDAS, que já
 * tem 'nota'/'notas') + o vocabulário de placar, preço-alvo e chamada à ação que o Comparador e os
 * Cenários tornariam tentador ("melhor", "vencedor", "teto", "margem de segurança", "comprar"...).
 *
 * Mesmas regras de casamento de linguagem.ts: PALAVRA INTEIRA, sem diferenciar maiúsculas nem
 * acentos, expressões com espaço/hífen flexível. Rótulo de observação é 'Observações' ou 'Sobre os
 * dados', nunca 'Notas'. "Margem que você exige" não casa 'margem de segurança' (expressão inteira).
 *
 * Exceções: o RODAPE_LEGAL e o TEXTOS_ANALISE.rodapeValuation (literais exigidos pela spec, que
 * citam "preço justo"/"recomendação" para negá-los) NÃO entram nos objetos varridos.
 */
import { PALAVRAS_PROIBIDAS } from '@/services/analiseAtivos/regras/comum/linguagem';

export const PALAVRAS_PROIBIDAS_BLOCO_D: readonly string[] = [
  ...PALAVRAS_PROIBIDAS,
  'melhor',
  'pior',
  'vencedor',
  'teto',
  'preço-teto',
  'valor intrínseco',
  'potencial',
  'upside',
  'subvalorizada',
  'subvalorizado',
  'sobrevalorizada',
  'sobrevalorizado',
  'margem de segurança',
  'comprar',
  'compra',
  'recomendação',
  'recomendamos',
  'sugerimos',
  'indicamos',
  'ranking',
  'placar',
];

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PADROES: ReadonlyArray<{ palavra: string; re: RegExp }> = PALAVRAS_PROIBIDAS_BLOCO_D.map(
  (palavra) => {
    const corpo = normalizar(palavra)
      .split(/[\s-]+/)
      .map(escaparRegex)
      .join('[\\s-]+');
    return { palavra, re: new RegExp(`(?<![\\p{L}\\p{N}])${corpo}(?![\\p{L}\\p{N}])`, 'u') };
  },
);

/** Palavras/expressões do Bloco D encontradas em `texto` (forma canônica, sem repetição). */
export function encontrarPalavrasProibidasBlocoD(texto: string): string[] {
  const alvo = normalizar(texto);
  return [...new Set(PADROES.filter((p) => p.re.test(alvo)).map((p) => p.palavra))];
}

/** Todas as folhas string de um objeto de textos, com o caminho ('csv.botao', 'linhas[2]'). */
export function folhasTexto(obj: unknown, caminho = ''): Array<[string, string]> {
  if (typeof obj === 'string') return [[caminho, obj]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => folhasTexto(v, `${caminho}[${i}]`));
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) => folhasTexto(v, caminho ? `${caminho}.${k}` : k));
  }
  return [];
}

/** Placeholders do Bloco D além de PLACEHOLDERS_PERMITIDOS (textosTela). */
export const PLACEHOLDERS_BLOCO_D = [
  'metodo',
  'premissa',
  'cotas',
  'renda',
  'data',
  'anos',
] as const;
