/**
 * Varredura de linguagem v2.4 (compliance, spec §9; casos 23 e 32). Dono: fatia 0.
 *
 * Lista = a do Bloco D (PALAVRAS_PROIBIDAS_BLOCO_D, que já inclui a da Fase 1) + o vocabulário que a
 * v2.4 retira da superfície: 'semáforo', 'destaque', 'vencedor(es)', 'aprovado/reprovado',
 * 'melhores/piores', 'falta(m)', 'quanto falta', 'aporte necessário', 'ranking', '★'. Mais três
 * regras especiais:
 *  - 'recomend' casa por PREFIXO (recomendação, recomendamos, recomendado…);
 *  - 'Índice' casa SÓ com I maiúsculo e palavra inteira ('índice de busca' não casa; 'Índice MF'
 *    casa; 'Índices' também não, por ser outra palavra — nomes de fundo ficam em data-nome-ativo);
 *  - '★' casa o símbolo.
 * Demais regras de casamento iguais às de linguagem.ts: palavra inteira, sem diferenciar maiúsculas
 * nem acentos, expressões com espaço/hífen flexível.
 *
 * Exceções FECHADAS:
 *  1. TEXTOS_LITERAIS_OBRIGATORIOS (textosLiterais.ts) — com { ignorarLiterais: true }, uma string
 *     EXATAMENTE igual a um literal registrado é pulada; qualquer outra string (inclusive o literal
 *     com uma palavra a mais) é varrida normalmente;
 *  2. TEXTOS_OPERACAO (Compra/Venda, fatia C1) — varridos com { lista: 'operacao' } (a lista sem
 *     compra/comprar/venda/vender);
 *  3. no DOM, [data-texto-legal] (só com conteúdo do registro) e [data-nome-ativo] — ver
 *     src/test/utils/varrerDom.ts.
 */
import { PALAVRAS_PROIBIDAS_BLOCO_D } from '@/services/analiseAtivos/regras/comum/varreduraTextos';
import { ehTextoLiteral } from '@/services/analiseAtivos/textosLiterais';

/** Palavras/expressões inteiras (comparação sem acento e sem maiúscula). */
export const PALAVRAS_PROIBIDAS_V2: readonly string[] = [
  ...PALAVRAS_PROIBIDAS_BLOCO_D,
  'melhores',
  'piores',
  'vencedores',
  'vencedora',
  'semáforo',
  'destaque',
  'destaques',
  'aprovado',
  'aprovada',
  'reprovado',
  'reprovada',
  'falta',
  'faltam',
  'quanto falta',
  'aporte necessário',
  'vender',
  'top 10',
];

/** Rótulos de tipo de operação liberados SÓ em TEXTOS_OPERACAO. */
const SO_OPERACAO = new Set(['compra', 'comprar', 'venda', 'vender']);

/** Lista própria de TEXTOS_OPERACAO: a v2 sem compra/comprar/venda/vender. */
export const PALAVRAS_PROIBIDAS_V2_OPERACAO: readonly string[] = PALAVRAS_PROIBIDAS_V2.filter(
  (p) => !SO_OPERACAO.has(p),
);

/** Rótulos canônicos das regras especiais (aparecem assim no resultado). */
export const PROIBIDA_RECOMEND = 'recomend*';
export const PROIBIDA_INDICE = 'Índice';
export const PROIBIDA_ESTRELA = '★';

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type Padrao = { palavra: string; re: RegExp };

function compilar(lista: readonly string[]): Padrao[] {
  return [...new Set(lista)].map((palavra) => {
    const corpo = normalizar(palavra)
      .split(/[\s-]+/)
      .map(escaparRegex)
      .join('[\\s-]+');
    return { palavra, re: new RegExp(`(?<![\\p{L}\\p{N}])${corpo}(?![\\p{L}\\p{N}])`, 'u') };
  });
}

const PADROES: Record<'padrao' | 'operacao', Padrao[]> = {
  padrao: compilar(PALAVRAS_PROIBIDAS_V2),
  operacao: compilar(PALAVRAS_PROIBIDAS_V2_OPERACAO),
};

/** prefixo, no texto normalizado */
const RE_RECOMEND = /(?<![\p{L}\p{N}])recomend/u;
/** no texto ORIGINAL: I maiúsculo (com ou sem acento), palavra inteira */
const RE_INDICE = /(?<![\p{L}\p{N}])(?:Índice|Indice|ÍNDICE|INDICE)(?![\p{L}\p{N}])/u;

export interface OpcoesVarreduraV2 {
  /** pula a string se for EXATAMENTE um literal registrado (padrão false) */
  ignorarLiterais?: boolean;
  /** 'operacao' = lista de TEXTOS_OPERACAO (sem compra/venda); padrão 'padrao' */
  lista?: 'padrao' | 'operacao';
}

/** Palavras/expressões proibidas encontradas em `texto` (forma canônica, sem repetição). */
export function encontrarProibidasV2(texto: string, opts: OpcoesVarreduraV2 = {}): string[] {
  if (opts.ignorarLiterais && ehTextoLiteral(texto)) return [];
  const alvo = normalizar(texto);
  const achados = PADROES[opts.lista ?? 'padrao']
    .filter((p) => p.re.test(alvo))
    .map((p) => p.palavra);
  if (RE_RECOMEND.test(alvo)) achados.push(PROIBIDA_RECOMEND);
  if (RE_INDICE.test(texto)) achados.push(PROIBIDA_INDICE);
  if (texto.includes(PROIBIDA_ESTRELA)) achados.push(PROIBIDA_ESTRELA);
  return [...new Set(achados)];
}

/** Atalho para TEXTOS_OPERACAO (lista própria). */
export function encontrarProibidasOperacao(texto: string): string[] {
  return encontrarProibidasV2(texto, { lista: 'operacao' });
}
