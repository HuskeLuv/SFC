'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { ApexOptions } from 'apexcharts';
import Button from '@/components/ui/button/Button';
import { useDeleteSeguro, useSeguros, type SeguroDTO } from '@/hooks/useSeguros';
import SeguroForm from './SeguroForm';
import {
  COBERTURA_EIXO,
  RISCO_EIXO,
  SEGURO_COBERTURA_BADGE,
  SEGURO_COBERTURA_LABELS,
  SEGURO_RISCO_LABELS,
  SEGURO_TIPO_LABELS,
  formatBRL,
} from './utils';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const SERIES_COLORS: Record<string, string> = {
  nenhuma: '#F04438',
  parcial: '#F79009',
  total: '#12B76A',
};

type BubblePoint = { x: number; y: number; z: number; nome: string; custo: number };

/**
 * Bloco ⑥ — Gestão de Risco (aba 2 da planilha): bubble chart de proteção
 * (x = risco de sinistro, y = cobertura, bolha = custo anual; quadrante
 * inferior-direito = risco alto sem cobertura, a zona crítica) + CRUD de
 * apólices. Cadastro manual — seguro não é ativo de carteira.
 */
export default function GestaoRisco() {
  const { seguros, loading, error } = useSeguros();
  const deleteSeguro = useDeleteSeguro();
  const [editing, setEditing] = useState<SeguroDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const chart = useMemo(() => {
    // Jitter determinístico por índice para bolhas na mesma célula não se
    // sobreporem por completo.
    const jitter = (i: number) => ((i % 3) - 1) * 0.14;
    const grupos: Record<string, BubblePoint[]> = { nenhuma: [], parcial: [], total: [] };
    seguros.forEach((s, i) => {
      grupos[s.cobertura]?.push({
        x: (RISCO_EIXO[s.risco] ?? 2) + jitter(i),
        y: (COBERTURA_EIXO[s.cobertura] ?? 2) + jitter(i + 1),
        z: Math.max(1, s.custoAnual),
        nome: s.nome,
        custo: s.custoAnual,
      });
    });
    const series = (['nenhuma', 'parcial', 'total'] as const)
      .filter((c) => grupos[c].length > 0)
      .map((c) => ({
        name: `Cobertura ${SEGURO_COBERTURA_LABELS[c].toLowerCase()}`,
        data: grupos[c],
      }));
    const colors = (['nenhuma', 'parcial', 'total'] as const)
      .filter((c) => grupos[c].length > 0)
      .map((c) => SERIES_COLORS[c]);

    const options: ApexOptions = {
      chart: { type: 'bubble', toolbar: { show: false }, fontFamily: 'inherit' },
      colors,
      fill: { opacity: 0.75 },
      xaxis: {
        min: 0.5,
        max: 3.5,
        tickAmount: 3,
        title: { text: 'Risco de sinistro', style: { color: '#98A2B3' } },
        labels: {
          style: { colors: '#98A2B3' },
          formatter: (v: string) => {
            const n = Math.round(Number(v));
            return ['', 'Baixo', 'Médio', 'Alto'][n] ?? '';
          },
        },
      },
      yaxis: {
        min: 0.5,
        max: 3.5,
        tickAmount: 3,
        title: { text: 'Cobertura', style: { color: '#98A2B3' } },
        labels: {
          style: { colors: '#98A2B3' },
          formatter: (v: number) => ['', 'Nenhuma', 'Parcial', 'Total'][Math.round(v)] ?? '',
        },
      },
      grid: { borderColor: 'rgba(152,162,179,0.15)' },
      legend: { labels: { colors: '#98A2B3' } },
      dataLabels: { enabled: false },
      tooltip: {
        custom: ({ seriesIndex, dataPointIndex, w }) => {
          const p = w.config.series[seriesIndex]?.data?.[dataPointIndex] as BubblePoint | undefined;
          if (!p) return '';
          return `<div style="padding:6px 10px"><b>${p.nome}</b><br/>Custo anual: ${formatBRL(p.custo)}</div>`;
        },
      },
      // Zona crítica: risco alto × cobertura nenhuma/parcial.
      annotations: {
        xaxis: [
          {
            x: 2.5,
            x2: 3.5,
            fillColor: 'rgba(240,68,56,0.06)',
            label: {
              text: 'zona crítica',
              orientation: 'horizontal',
              position: 'bottom',
              offsetY: -8,
              style: { color: '#F04438', background: 'transparent', fontSize: '10px' },
            },
          },
        ],
      },
    };
    return { series, options };
  }, [seguros]);

  const handleDelete = async (id: string) => {
    try {
      await deleteSeguro.mutateAsync(id);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="print:break-inside-avoid rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white/90">
            Gestão de Risco
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Suas proteções: risco de cada sinistro × cobertura contratada. Bolha maior = seguro mais
            caro; a zona crítica é risco alto sem cobertura.
          </p>
        </div>
        {!creating && !editing ? (
          <div className="print:hidden">
            <Button size="sm" onClick={() => setCreating(true)}>
              + Adicionar seguro
            </Button>
          </div>
        ) : null}
      </div>

      {creating || editing ? (
        <div className="mt-4">
          <SeguroForm
            seguro={editing}
            onCancel={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSaved={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        </div>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">Carregando seguros...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : seguros.length === 0 ? (
        !creating ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Nenhum seguro cadastrado. Registre suas proteções (vida, saúde, auto, residência) para
            visualizar onde você está descoberto.
          </p>
        ) : null
      ) : (
        <>
          <div className="mt-2">
            <ReactApexChart
              type="bubble"
              height={300}
              series={chart.series}
              options={chart.options}
            />
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800 dark:text-gray-500">
                  <th className="py-2 pr-3 font-medium">Seguro</th>
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Cobertura</th>
                  <th className="py-2 pr-3 font-medium">Risco</th>
                  <th className="py-2 pr-3 text-right font-medium">Custo anual</th>
                  <th className="py-2 pr-3 text-right font-medium">Capital segurado</th>
                  <th className="py-2 text-right font-medium print:hidden">Ações</th>
                </tr>
              </thead>
              <tbody>
                {seguros.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-gray-50 last:border-0 dark:border-gray-900"
                  >
                    <td className="py-2 pr-3 font-medium text-gray-900 dark:text-white/90">
                      {s.nome}
                    </td>
                    <td className="py-2 pr-3 text-gray-600 dark:text-gray-300">
                      {SEGURO_TIPO_LABELS[s.tipo] ?? s.tipo}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEGURO_COBERTURA_BADGE[s.cobertura] ?? ''}`}
                      >
                        {SEGURO_COBERTURA_LABELS[s.cobertura] ?? s.cobertura}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-600 dark:text-gray-300">
                      {SEGURO_RISCO_LABELS[s.risco] ?? s.risco}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-900 dark:text-white/90">
                      {formatBRL(s.custoAnual)}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-600 dark:text-gray-300">
                      {s.capitalSegurado != null ? formatBRL(s.capitalSegurado) : '—'}
                    </td>
                    <td className="py-2 text-right print:hidden">
                      {confirmDeleteId === s.id ? (
                        <span className="inline-flex items-center gap-2 text-xs">
                          <button
                            type="button"
                            className="font-medium text-red-600 hover:underline dark:text-red-400"
                            onClick={() => handleDelete(s.id)}
                            disabled={deleteSeguro.isPending}
                          >
                            confirmar exclusão
                          </button>
                          <button
                            type="button"
                            className="text-gray-500 hover:underline dark:text-gray-400"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            cancelar
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-3 text-xs">
                          <button
                            type="button"
                            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                            onClick={() => {
                              setCreating(false);
                              setEditing(s);
                            }}
                          >
                            editar
                          </button>
                          <button
                            type="button"
                            className="font-medium text-red-600 hover:underline dark:text-red-400"
                            onClick={() => setConfirmDeleteId(s.id)}
                          >
                            excluir
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
