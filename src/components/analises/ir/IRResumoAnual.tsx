'use client';
import React, { useState } from 'react';
import { useIRResumoAnual } from '@/hooks/useIR';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import IRSummaryCard from './IRSummaryCard';
import IRStateMessage from './IRStateMessage';
import { formatBRL } from './irFormatters';

function buildYearOptions(): number[] {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2, current - 3];
}

export default function IRResumoAnual() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading, error } = useIRResumoAnual(year);
  const yearOptions = buildYearOptions();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Resumo anual de IR
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Ferramenta de acompanhamento — não gera DAA. Os números abaixo são projetados a partir
            das transações cadastradas no sistema.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          Ano:
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-200"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && <LoadingSpinner text="Carregando resumo anual..." />}

      {error && (
        <IRStateMessage
          variant="error"
          title="Erro ao carregar resumo"
          description={(error as Error).message}
        />
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <IRSummaryCard
              label="IR total estimado no ano"
              value={formatBRL(data.irPorCategoria.total)}
              subtext="Soma de RV-BR + Stocks US + Cripto + Come-cotas"
              color={
                data.irPorCategoria.total > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }
              highlight
            />
            <IRSummaryCard
              label="Renda Variável BR"
              value={formatBRL(data.irPorCategoria.rendaVariavelBr)}
              subtext="Ações / FII / ETF — DARF mensal"
            />
            <IRSummaryCard
              label="Stocks US + REIT"
              value={formatBRL(data.irPorCategoria.stocksUs)}
              subtext="Ganho de capital em ME"
            />
            <IRSummaryCard
              label="Criptoativos"
              value={formatBRL(data.irPorCategoria.cripto)}
              subtext="Ganho de capital cripto"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <IRSummaryCard
              label="Come-cotas (projeção)"
              value={formatBRL(data.irPorCategoria.comecotas)}
              subtext="Retido na fonte em fundos"
            />
            <IRSummaryCard
              label="Renda fixa"
              value={formatBRL(data.irPorCategoria.rendaFixa)}
              subtext="Banco/corretora retém na fonte"
              color="text-gray-500 dark:text-gray-400"
            />
            <IRSummaryCard
              label="Rendimentos isentos"
              value={formatBRL(data.rendimentos.isentos.total)}
              subtext={`Dividendos: ${formatBRL(
                data.rendimentos.isentos.dividendosAcoesBr,
              )} • FII: ${formatBRL(data.rendimentos.isentos.rendimentosFii)}`}
              color="text-emerald-600 dark:text-emerald-400"
            />
            <IRSummaryCard
              label="JCP recebido"
              value={formatBRL(data.rendimentos.tributacaoExclusiva.jcp)}
              subtext="Tributação exclusiva — 15% retidos na fonte"
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              Rendimentos do ano
            </h4>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between border-b border-gray-100 py-1.5 dark:border-gray-800">
                <dt className="text-gray-500 dark:text-gray-400">
                  Dividendos de ações BR (isentos)
                </dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {formatBRL(data.rendimentos.isentos.dividendosAcoesBr)}
                </dd>
              </div>
              <div className="flex justify-between border-b border-gray-100 py-1.5 dark:border-gray-800">
                <dt className="text-gray-500 dark:text-gray-400">Rendimentos de FII (isentos)</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {formatBRL(data.rendimentos.isentos.rendimentosFii)}
                </dd>
              </div>
              <div className="flex justify-between border-b border-gray-100 py-1.5 dark:border-gray-800">
                <dt className="text-gray-500 dark:text-gray-400">JCP (tributação exclusiva 15%)</dt>
                <dd className="font-medium text-gray-900 dark:text-white">
                  {formatBRL(data.rendimentos.tributacaoExclusiva.jcp)}
                </dd>
              </div>
              <div className="flex justify-between py-1.5">
                <dt className="font-medium text-gray-700 dark:text-gray-200">Total recebido</dt>
                <dd className="font-semibold text-gray-900 dark:text-white">
                  {formatBRL(data.rendimentos.totalRecebido)}
                </dd>
              </div>
            </dl>
          </div>

          {data.observacoes.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-900/20">
              <h4 className="mb-2 text-sm font-medium text-blue-900 dark:text-blue-200">
                Observações
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-xs text-blue-800 dark:text-blue-300">
                {data.observacoes.map((obs, i) => (
                  <li key={i}>{obs}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
