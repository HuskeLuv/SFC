'use client';

import React from 'react';
import { MYFINANCE_BRAND, TABLE_HEADER_BG } from '@/constants/brandColors';
import { useTheme } from '@/context/ThemeContext';
import type { AdminSerieDia } from '@/services/admin/overview';

export const fmtInt = (n: number) => n.toLocaleString('pt-BR');
export const fmtBrl = (n: number, casas = 2) =>
  n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
export const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
export const fmtData = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
export const fmtDataHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
/** Dias desde a data (0 = hoje). null quando não há data. */
export const diasDesde = (iso: string | null | undefined): number | null =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

export function Bloco({
  titulo,
  descricao,
  children,
  acao,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{titulo}</h3>
          {descricao && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{descricao}</p>
          )}
        </div>
        {acao}
      </div>
      <div className="space-y-5 border-t border-gray-100 p-5 dark:border-gray-800">{children}</div>
    </section>
  );
}

export function Stat({
  rotulo,
  valor,
  detalhe,
  tom = 'neutro',
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  tom?: 'neutro' | 'destaque' | 'alerta';
}) {
  const cor =
    tom === 'alerta'
      ? 'text-red-600 dark:text-red-400'
      : tom === 'destaque'
        ? 'text-[#0079F2] dark:text-[#6E9DC4]' // outside / tranquilidade (paleta)
        : 'text-gray-900 dark:text-white/90';
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.02]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{rotulo}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{detalhe}</p>}
    </div>
  );
}

export function Grade({
  children,
  colunas = 4,
}: {
  children: React.ReactNode;
  colunas?: 3 | 4 | 5;
}) {
  const cls =
    colunas === 3
      ? 'sm:grid-cols-3'
      : colunas === 5
        ? 'sm:grid-cols-3 lg:grid-cols-5'
        : 'sm:grid-cols-2 lg:grid-cols-4';
  return <div className={`grid grid-cols-2 gap-3 ${cls}`}>{children}</div>;
}

export interface Coluna<T> {
  chave: string;
  titulo: string;
  alinhar?: 'left' | 'right' | 'center';
  render: (linha: T) => React.ReactNode;
}

export function Tabela<T>({
  colunas,
  linhas,
  chave,
  vazio = 'Nenhum registro no período.',
}: {
  colunas: Coluna<T>[];
  linhas: T[];
  chave: (linha: T) => string;
  vazio?: string;
}) {
  const align = (a?: Coluna<T>['alinhar']) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
  return (
    <div className="max-w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr style={{ backgroundColor: TABLE_HEADER_BG }}>
            {colunas.map((c) => (
              <th
                key={c.chave}
                className={`px-3 py-2 text-xs font-bold text-white ${align(c.alinhar)}`}
                style={{ backgroundColor: TABLE_HEADER_BG }}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 && (
            <tr>
              <td
                colSpan={colunas.length}
                className="px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400"
              >
                {vazio}
              </td>
            </tr>
          )}
          {linhas.map((l) => (
            <tr key={chave(l)} className="border-t border-gray-100 dark:border-gray-800">
              {colunas.map((c) => (
                <td
                  key={c.chave}
                  className={`px-3 py-2 tabular-nums text-gray-800 dark:text-gray-200 ${align(c.alinhar)}`}
                >
                  {c.render(l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Série diária de UMA medida em barras finas (últimos 30 dias). Uma série só:
 * o título nomeia a medida, sem legenda. Cor: azul-assinatura no claro,
 * azul suave no escuro (ambos da paleta My Finance).
 */
export function BarrasDiarias({
  titulo,
  serie,
  medida = 'total',
  formatar = fmtInt,
}: {
  titulo: string;
  serie: AdminSerieDia[];
  medida?: 'total' | 'usuarios' | 'custoBrl';
  formatar?: (n: number) => string;
}) {
  const { theme } = useTheme();
  const cor = theme === 'dark' ? MYFINANCE_BRAND.tranquilidade : MYFINANCE_BRAND.outside;
  const valores = serie.map((d) => d[medida] ?? 0);
  const max = Math.max(1, ...valores);
  const soma = valores.reduce((a, b) => a + b, 0);
  const primeiro = serie[0]?.dia;
  const ultimo = serie[serie.length - 1]?.dia;
  const rotulo = (d: string) => {
    const [, m, dia] = d.split('-');
    return `${dia}/${m}`;
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{titulo}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {primeiro && ultimo ? `${rotulo(primeiro)} – ${rotulo(ultimo)} · ` : ''}total{' '}
          {formatar(soma)}
        </p>
      </div>
      <div
        className="flex h-16 items-end gap-[2px] border-b border-gray-200 dark:border-gray-700"
        role="img"
        aria-label={`${titulo}, últimos ${serie.length} dias`}
      >
        {serie.map((d) => {
          const v = d[medida] ?? 0;
          const h = Math.max(v > 0 ? 3 : 0, Math.round((v / max) * 100));
          return (
            <div
              key={d.dia}
              className="group relative flex h-full flex-1 items-end"
              title={`${rotulo(d.dia)}: ${formatar(v)}`}
            >
              <div
                className="w-full rounded-t-[3px] transition-opacity group-hover:opacity-70"
                style={{ height: `${h}%`, backgroundColor: cor, minHeight: v > 0 ? 2 : 0 }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Badge({
  children,
  tom = 'neutro',
}: {
  children: React.ReactNode;
  tom?: 'neutro' | 'ok' | 'alerta' | 'erro';
}) {
  const cls =
    tom === 'ok'
      ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
      : tom === 'alerta'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
        : tom === 'erro'
          ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
          : 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}
