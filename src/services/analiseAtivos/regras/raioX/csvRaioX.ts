/**
 * CSV do Raio-X (Bloco D, fatia A; decisão 13). Puro: recebe a RaioXResposta (sem nenhum dado de
 * usuário) e devolve o texto do arquivo, gerado no servidor (?formato=csv).
 *
 * Formato (abre direto no Excel pt-BR com números como números):
 *  - UTF-8 com BOM, separador ';', quebra de linha CRLF;
 *  - vírgula decimal, sem separador de milhar, sinal '-' ASCII;
 *  - casas: R$ mi 2 · % 2 · por ação/cota (R$) 4 · múltiplos 2 · milhões e mil m² 2 · inteiros 0;
 *  - cabeçalho 'Linha;2025;2024;…' (ordem da tela), uma linha de título por bloco e a unidade no
 *    rótulo de cada linha ('Receita líquida (R$ mi)'), salvo quando o rótulo já a traz;
 *  - célula: ausente (inclusive 'em conferência' com política ocultar) = vazia; n/a = 'n/a';
 *    política 'selo' = o valor;
 *  - no fim: 'Em conferência' (ano · linha: motivo), 'Sobre os dados' (nunca "Notas"), Fonte,
 *    Gerado em (dd/mm/aaaa), Parâmetros (v<versão>) e o aviso legal (RODAPE_LEGAL) entre aspas.
 *  - Texto: RFC 4180 (aspas quando há ';', aspas ou quebra) + apóstrofo antes de = + - @ TAB CR no
 *    início (o Excel não executa como fórmula). Números nunca levam apóstrofo.
 */
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { RODAPE_LEGAL, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { Estado } from '@/types/analiseAtivosApi';
import type { FormatoRaioX, RaioXResposta } from '@/types/analiseAtivosBlocoD';

const TC = TEXTOS_RAIO_X.csv;
const SEP = ';';
const EOL = '\r\n';
const BOM = '﻿';

/** Casas decimais do CSV por formato. */
export const CASAS_CSV: Readonly<Record<FormatoRaioX, number>> = {
  moedaMi: 2,
  pct: 2,
  moeda: 4,
  multiplo: 2,
  milhoes: 2,
  areaMilM2: 2,
  inteiro: 0,
};

/** Número no padrão do Excel pt-BR: vírgula decimal, sem milhar, '-' ASCII; nunca '-0'. */
export function numeroCsv(valor: number, casas: number): string {
  const fixo = valor.toFixed(casas);
  const zero = Number(fixo) === 0;
  return (zero ? fixo.replace('-', '') : fixo).replace('.', ',');
}

const INICIO_PERIGOSO = /^[=+\-@\t\r]/;

/** Célula de TEXTO: proteção contra fórmula + escape RFC 4180. */
export function textoCsv(s: string, opts: { aspas?: boolean } = {}): string {
  let t = INICIO_PERIGOSO.test(s) ? `'${s}` : s;
  if (opts.aspas || /[;"\r\n]/.test(t)) t = `"${t.replace(/"/g, '""')}"`;
  return t;
}

function celula(e: Estado<number> | undefined, formato: FormatoRaioX): string {
  if (!e) return '';
  if (e.estado === 'ok') return numeroCsv(e.valor, CASAS_CSV[formato]);
  if (e.estado === 'nao_se_aplica') return TEXTOS_RAIO_X.celula.naoSeAplica;
  return '';
}

function rotuloComUnidade(rotulo: string, formato: FormatoRaioX): string {
  const u = TC.unidades[formato];
  return u && !rotulo.includes('(') ? `${rotulo} ${u}` : rotulo;
}

function dataBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export interface OpcoesCsvRaioX {
  /** AAAA-MM-DD (São Paulo) */
  hoje: string;
  /** versão do ScoringParams ('Parâmetros;v2') */
  versaoParams: number;
}

export function gerarCsvRaioX(r: RaioXResposta, o: OpcoesCsvRaioX): string {
  const linhas: string[][] = [];
  const largura = r.anos.length + 1;
  const vazias = (n: number) => Array.from({ length: n }, () => '');
  linhas.push([textoCsv(TC.cabecalhoLinha), ...r.anos.map(String)]);
  for (const b of r.blocos) {
    linhas.push([textoCsv(b.rotulo), ...vazias(largura - 1)]);
    for (const l of b.linhas) {
      linhas.push([
        textoCsv(rotuloComUnidade(l.rotulo, l.formato)),
        ...r.anos.map((ano) => celula(l.valores[ano], l.formato)),
      ]);
    }
  }

  const conferencias: string[] = [];
  for (const b of r.blocos) {
    for (const l of b.linhas) {
      for (const ano of r.anos) {
        const c = l.conferencias[ano];
        if (!c) continue;
        conferencias.push(
          formatarTexto(TC.itemConferencia, { ano, campo: l.rotulo, motivo: c.motivo }),
        );
      }
    }
  }
  if (conferencias.length > 0) {
    linhas.push([]);
    linhas.push([textoCsv(TC.emConferencia)]);
    for (const c of conferencias) linhas.push([textoCsv(c)]);
  }
  if (r.observacoes.length > 0) {
    linhas.push([]);
    linhas.push([textoCsv(TC.sobreOsDados)]);
    for (const obs of r.observacoes) linhas.push([textoCsv(obs)]);
  }
  linhas.push([]);
  linhas.push([textoCsv(TC.fonte), textoCsv(TC.fonteValor)]);
  linhas.push([textoCsv(TC.geradoEm), dataBr(o.hoje)]);
  linhas.push([textoCsv(TC.parametros), `v${o.versaoParams}`]);
  linhas.push([textoCsv(TC.avisoLegal), textoCsv(RODAPE_LEGAL, { aspas: true })]);
  return BOM + linhas.map((l) => l.join(SEP)).join(EOL) + EOL;
}
