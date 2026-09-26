'use client';

import React, { useMemo, useState } from 'react';
import CardSectionBand from '@/components/ui/table/CardSectionBand';
import { MobileStatusPill } from '@/components/ui/mobile/MobileStatusPill';
import type { ParcelaCronograma } from '@/hooks/useDividas';
import { formatBRL, formatYearMonth } from '../utils';

interface CronogramaListaProps {
  cronograma: ParcelaCronograma[];
  parcelasPagas: number;
  proximaParcela: number | null;
}

/** Parcelas visíveis antes de "Mostrar todas" (o desktop mostra 24). */
export const JANELA_CELULAR = 14;
/** Quantas parcelas antes da próxima entram na janela (as já pagas mais recentes). */
const ANTES_DA_PROXIMA = 6;

/** Janela de `JANELA_CELULAR` parcelas em volta da próxima (a lista inteira se couber). */
export function janelaDoCronograma(
  cronograma: ParcelaCronograma[],
  proximaParcela: number | null,
  parcelasPagas: number,
): ParcelaCronograma[] {
  if (cronograma.length <= JANELA_CELULAR) return cronograma;
  const centro = (proximaParcela ?? parcelasPagas + 1) - 1;
  const start = Math.max(
    0,
    Math.min(centro - ANTES_DA_PROXIMA, cronograma.length - JANELA_CELULAR),
  );
  return cronograma.slice(start, start + JANELA_CELULAR);
}

/** Valor sem o "R$ " (a linha de juros/amortização cabe numa linha a 320px). */
const semMoeda = (v: number) => formatBRL(v).replace(/^R\$\s*/, '');

/** Agrupa por ano ("YYYY" do mês da parcela), na ordem do cronograma. */
export function agruparPorAno(
  linhas: ParcelaCronograma[],
): Array<{ ano: string; linhas: ParcelaCronograma[] }> {
  const grupos: Array<{ ano: string; linhas: ParcelaCronograma[] }> = [];
  for (const r of linhas) {
    const ano = r.mes.slice(0, 4);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.ano === ano) ultimo.linhas.push(r);
    else grupos.push({ ano, linhas: [r] });
  }
  return grupos;
}

/**
 * Cronograma de amortização em lista (PWA fase 3, só abaixo de lg — o CronogramaTable decide o
 * ramo). Janela de 14 parcelas em volta da próxima, agrupada por ano; pagas com ✓, a próxima com
 * borda azul e selo. Mesmos valores da tabela (o *Corrigido quando o contrato é indexado).
 */
export default function CronogramaLista({
  cronograma,
  parcelasPagas,
  proximaParcela,
}: CronogramaListaProps) {
  const [todas, setTodas] = useState(false);
  const [anosFechados, setAnosFechados] = useState<Set<string>>(() => new Set());

  const visiveis = useMemo(
    () => (todas ? cronograma : janelaDoCronograma(cronograma, proximaParcela, parcelasPagas)),
    [cronograma, todas, proximaParcela, parcelasPagas],
  );
  const grupos = useMemo(() => agruparPorAno(visiveis), [visiveis]);
  const porAno = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of cronograma) m.set(r.mes.slice(0, 4), (m.get(r.mes.slice(0, 4)) ?? 0) + 1);
    return m;
  }, [cronograma]);

  const totais = useMemo(
    () => ({
      juros: cronograma.reduce((s, r) => s + (r.jurosCorrigido ?? r.juros), 0),
      amortizacao: cronograma.reduce((s, r) => s + (r.amortizacaoCorrigida ?? r.amortizacao), 0),
    }),
    [cronograma],
  );

  const alternarAno = (ano: string) =>
    setAnosFechados((prev) => {
      const next = new Set(prev);
      if (next.has(ano)) next.delete(ano);
      else next.add(ano);
      return next;
    });

  const primeira = visiveis[0]?.numero;
  const ultima = visiveis[visiveis.length - 1]?.numero;

  return (
    <section
      data-mf-mobile=""
      aria-labelledby="cronograma-lista-titulo"
      className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3
          id="cronograma-lista-titulo"
          className="text-sm font-semibold text-gray-900 dark:text-white/90"
        >
          Cronograma de amortização
        </h3>
        <span className="shrink-0 text-xs text-gray-500 tabular-nums dark:text-gray-400">
          {visiveis.length < cronograma.length
            ? `parcelas ${primeira} a ${ultima} de ${cronograma.length}`
            : `${cronograma.length} parcelas`}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Total de juros: {formatBRL(totais.juros)} · Amortização: {formatBRL(totais.amortizacao)}
      </p>

      <div className="mt-3 space-y-2">
        {grupos.map(({ ano, linhas }) => {
          const aberto = !anosFechados.has(ano);
          const listaId = `cronograma-ano-${ano}`;
          const n = porAno.get(ano) ?? linhas.length;
          return (
            <div key={ano}>
              <CardSectionBand
                id={listaId}
                label={ano}
                subtotal={`${n} parcela${n !== 1 ? 's' : ''}`}
                expanded={aberto}
                onToggle={() => alternarAno(ano)}
              />
              {aberto ? (
                <ul id={listaId} className="divide-y divide-gray-100 dark:divide-gray-800/60">
                  {linhas.map((r) => {
                    const paga = r.numero <= parcelasPagas;
                    const isProxima = r.numero === proximaParcela;
                    const amortizada = Boolean(r.amortizada);
                    return (
                      <li
                        key={r.numero}
                        data-mf-parcela={r.numero}
                        aria-current={isProxima ? 'true' : undefined}
                        className={`flex min-h-14 items-center gap-3 border-l-[3px] py-2 pr-1 pl-2 ${
                          isProxima ? 'border-l-[#0079F2]' : 'border-l-transparent'
                        } ${amortizada ? 'opacity-50' : paga ? 'opacity-60' : ''}`}
                      >
                        <span className="w-9 shrink-0 text-xs text-gray-500 tabular-nums dark:text-gray-400">
                          {paga && !amortizada ? (
                            <>
                              <span aria-hidden="true">✓ </span>
                              <span className="sr-only">paga, </span>
                            </>
                          ) : null}
                          {r.numero}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`flex flex-wrap items-center gap-x-2 text-sm font-medium text-gray-900 dark:text-white/90 ${
                              amortizada ? 'line-through' : ''
                            }`}
                          >
                            {formatYearMonth(r.mes)}
                            {isProxima ? (
                              <MobileStatusPill tone="ok">Próxima</MobileStatusPill>
                            ) : null}
                            {amortizada ? (
                              <span className="text-xs font-normal text-gray-500 no-underline dark:text-gray-400">
                                amortizada
                              </span>
                            ) : null}
                          </span>
                          <span className="block text-xs text-gray-500 tabular-nums dark:text-gray-400">
                            juros {semMoeda(r.jurosCorrigido ?? r.juros)} · amort.{' '}
                            {semMoeda(r.amortizacaoCorrigida ?? r.amortizacao)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold text-gray-900 tabular-nums dark:text-white/90">
                            {formatBRL(r.parcelaCorrigida ?? r.parcela)}
                          </span>
                          <span className="block text-xs text-gray-500 tabular-nums dark:text-gray-400">
                            saldo {formatBRL(r.saldoDevedorCorrigido ?? r.saldoDevedor)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      {cronograma.length > JANELA_CELULAR ? (
        <button
          type="button"
          onClick={() => setTodas((v) => !v)}
          aria-expanded={todas}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-gray-200 text-sm font-semibold text-mf-patrimonio dark:border-gray-700 dark:text-mf-tranquilidade"
        >
          {todas ? 'Mostrar menos' : `Mostrar todas as ${cronograma.length} parcelas`}
        </button>
      ) : null}
    </section>
  );
}
