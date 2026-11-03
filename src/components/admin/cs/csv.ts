/**
 * CSV do painel de CS: separador `;` e BOM UTF-8 (abre direto no Excel em pt-BR).
 * Campos com `;`, aspas ou quebra de linha vão entre aspas (aspas duplicadas).
 * Campos que começam com = + - @ ganham um apóstrofo (injeção de fórmula).
 */
export type ValorCsv = string | number | boolean | null | undefined;

export function campoCsv(v: ValorCsv): string {
  if (v == null) return '';
  let s = typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : String(v);
  if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gerarCsv(cabecalho: string[], linhas: ValorCsv[][]): string {
  const corpo = [cabecalho, ...linhas].map((l) => l.map(campoCsv).join(';')).join('\r\n');
  return `﻿${corpo}\r\n`;
}

export function baixarCsv(nome: string, conteudo: string): void {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
