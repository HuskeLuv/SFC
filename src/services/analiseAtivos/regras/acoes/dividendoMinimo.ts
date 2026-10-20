/**
 * Dividendo mínimo do estatuto a partir do texto Direito_Dividendo do FRE 2022 (A6, item 6; fatia
 * D). Regra PURA, sem interpretação além do número:
 *
 *  - extrairPctDividendoMinimo: '% do lucro líquido' por regex ('25% do lucro líquido',
 *    '25% (vinte e cinco por cento) no mínimo, do lucro líquido ajustado', 'equivalente a 25% do
 *    lucro líquido ajustado'). Percentual da reserva legal fica fora; com mais de um, vence o que
 *    fala de dividendo. Sem % reconhecível (ex.: 'Informações prestadas na seção 18.12.') ⇒ null
 *    ('sem dado · o FRE remete a outro item').
 *  - trechoDividendo: trecho LITERAL de até MAX_TRECHO_FRE caracteres, a partir da frase onde o %
 *    aparece (ou do início), com '…' quando corta.
 */
import { MAX_TRECHO_FRE } from '@/types/analiseAtivosComplementos';

const RE_PCT_LUCRO = /(\d{1,3}(?:[.,]\d{1,2})?)\s*%([^%\d]{0,80}?)lucro\s+l[ií]quido/gi;

function compactar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

interface Achado {
  pct: number;
  inicio: number;
}

function achados(texto: string): Achado[] {
  const t = compactar(texto);
  const out: Achado[] = [];
  for (const m of t.matchAll(RE_PCT_LUCRO)) {
    const pct = Number(m[1].replace(',', '.'));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
    const inicio = m.index ?? 0;
    const fim = inicio + m[0].length;
    const perto = t.slice(inicio, Math.min(t.length, fim + 40));
    if (/reserva\s+legal/i.test(perto)) continue;
    out.push({ pct, inicio });
  }
  return out;
}

function melhorAchado(texto: string): Achado | null {
  const t = compactar(texto);
  const lista = achados(texto);
  if (lista.length === 0) return null;
  const fala = lista.find((a) =>
    /dividend/i.test(t.slice(Math.max(0, a.inicio - 250), a.inicio + 120)),
  );
  return fala ?? lista[0];
}

/** % do lucro líquido (ajustado) do dividendo mínimo; null quando o texto não traz o número. */
export function extrairPctDividendoMinimo(texto: string | null | undefined): number | null {
  if (!texto) return null;
  return melhorAchado(texto)?.pct ?? null;
}

/** Início da frase que contém a posição `i` (depois do último '. X' antes dela). */
function inicioDaFrase(t: string, i: number): number {
  let inicio = 0;
  for (const m of t.slice(0, i).matchAll(/[.;]\s+(?=[A-ZÀ-Ý"“(])/g)) {
    inicio = (m.index ?? 0) + m[0].length;
  }
  return inicio;
}

/** Trecho literal (até `max` caracteres) a partir da frase do %, ou do início. */
export function trechoDividendo(
  texto: string | null | undefined,
  max: number = MAX_TRECHO_FRE,
): string | null {
  if (!texto) return null;
  const t = compactar(texto);
  if (!t) return null;
  const achado = melhorAchado(t);
  const inicio = achado ? inicioDaFrase(t, achado.inicio) : 0;
  const prefixo = inicio > 0 ? '…' : '';
  let corpo = t.slice(inicio);
  const limite = max - prefixo.length;
  if (corpo.length > limite) {
    const corte = corpo.lastIndexOf(' ', limite - 1);
    corpo = `${corpo.slice(0, corte > limite / 2 ? corte : limite - 1).replace(/[\s,;:]+$/, '')}…`;
  }
  return `${prefixo}${corpo}`;
}

/** Linha de direito por espécie usada para o dividendo mínimo. */
export interface DireitoDividendoLinha {
  especie: string;
  classePn: string;
  direitoDividendoTexto: string | null;
  pctDividendoMinimo: number | null;
}

/**
 * Linha de onde sai o dividendo mínimo: a ON com % reconhecido; senão qualquer espécie com %; senão
 * a ON (ou a primeira) com texto. null sem nenhuma linha com texto.
 */
export function escolherDireitoDividendo<T extends DireitoDividendoLinha>(linhas: T[]): T | null {
  const ordem = [...linhas].sort((a, b) =>
    a.especie === b.especie
      ? a.classePn.localeCompare(b.classePn)
      : a.especie === 'ON'
        ? -1
        : b.especie === 'ON'
          ? 1
          : a.especie.localeCompare(b.especie),
  );
  return (
    ordem.find((l) => l.pctDividendoMinimo !== null) ??
    ordem.find((l) => (l.direitoDividendoTexto ?? '').trim().length > 0) ??
    null
  );
}
