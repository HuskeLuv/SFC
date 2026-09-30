/**
 * CSV da CVM em streaming (separador ';', latin1 decodificado em zipStream).
 *
 * - Cabeçalho validado: falta alguma coluna obrigatória ⇒ ErroLayoutFonte (falha alto; o layout
 *   mudou em 2021 e em ago/2025).
 * - `aliases` renomeiam colunas de layouts antigos para o nome atual (ex.: 'CNPJ_Fundo' →
 *   'CNPJ_Fundo_Classe', informes de FII 2016–2020).
 * - `preFiltro` roda na linha CRUA antes do split (ex.: prefixo de CNPJ), descartando cedo.
 * - Aspas só são especiais no início do campo (há `10"` literal nos arquivos) — lógica do spike.
 */
import { ErroLayoutFonte } from '@/services/analiseAtivos/fontes/erros';

export interface EspecCsv {
  separador: ';';
  obrigatorias: string[];
  aliases?: Record<string, string>;
  preFiltro?: (bruta: string) => boolean;
  /** nome do arquivo para a mensagem de erro de layout */
  arquivo?: string;
}

export interface LinhaCsv {
  get(col: string): string;
  tem(col: string): boolean;
  cols: string[];
}

/** Divide uma linha CSV da CVM. Aspas só abrem campo quando estão no início dele. */
export function dividirLinhaCsv(l: string, sep = ';'): string[] {
  const out: string[] = [];
  let i = 0;
  while (i <= l.length) {
    if (l[i] === '"') {
      let j = i + 1;
      let s = '';
      while (j < l.length) {
        if (l[j] === '"' && l[j + 1] === '"') {
          s += '"';
          j += 2;
        } else if (l[j] === '"' && (l[j + 1] === sep || j + 1 === l.length)) {
          break;
        } else {
          s += l[j++];
        }
      }
      out.push(s);
      i = j + 2;
    } else {
      const j = l.indexOf(sep, i);
      if (j === -1) {
        out.push(l.slice(i));
        break;
      }
      out.push(l.slice(i, j));
      i = j + 1;
    }
  }
  return out;
}

function limparBom(s: string): string {
  // BOM UTF-8 lido como UTF-8 ('﻿') ou como latin1 ('ï»¿')
  return s.replace(/^﻿/, '').replace(/^ï»¿/, '');
}

class LinhaCsvImpl implements LinhaCsv {
  constructor(
    private readonly indice: Map<string, number>,
    public readonly cols: string[],
  ) {}

  tem(col: string): boolean {
    return this.indice.has(col);
  }

  get(col: string): string {
    const i = this.indice.get(col);
    if (i === undefined) throw new Error(`Coluna inexistente no CSV: ${col}`);
    return (this.cols[i] ?? '').trim();
  }
}

export async function* lerCsv(
  linhas: AsyncIterable<string>,
  spec: EspecCsv,
): AsyncIterable<LinhaCsv> {
  let indice: Map<string, number> | null = null;
  for await (const bruta of linhas) {
    if (indice === null) {
      const cabecalho = dividirLinhaCsv(limparBom(bruta), spec.separador).map((c) => c.trim());
      const presentes = new Set(cabecalho);
      const nomes = cabecalho.map((c) => {
        const alvo = spec.aliases?.[c];
        return alvo && !presentes.has(alvo) ? alvo : c;
      });
      indice = new Map(nomes.map((c, i) => [c, i]));
      const faltando = spec.obrigatorias.filter((c) => !indice!.has(c));
      if (faltando.length > 0) throw new ErroLayoutFonte(spec.arquivo ?? 'csv', faltando);
      continue;
    }
    if (bruta.length === 0) continue;
    if (spec.preFiltro && !spec.preFiltro(bruta)) continue;
    yield new LinhaCsvImpl(indice, dividirLinhaCsv(bruta, spec.separador));
  }
  if (indice === null) throw new ErroLayoutFonte(spec.arquivo ?? 'csv', [...spec.obrigatorias]);
}
