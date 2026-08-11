'use client';

import { useMemo, useState } from 'react';
import { useCashflowYear } from '@/context/CashflowYearContext';
import { useOrcamento } from '@/hooks/useOrcamento';
import { MONTHS } from '@/constants/cashflow';
import type { SeriePorModo } from '@/services/cashflow/orcamentoVsReal';
import { OrcamentoKpiCards } from './OrcamentoKpiCards';
import { OrcamentoTable, type OrcamentoLinha } from './OrcamentoTable';
import OrcamentoChart from './OrcamentoChart';

type Visao = 'mes' | 'ano';
type ModoReal = 'lancado' | 'consolidado';

/**
 * Seção "Orçamento vs Real" — resumo da planilha do fluxo de caixa por
 * categoria, com meta mensal editável e acompanhamento (espelha a aba
 * homônima da planilha do Wellington).
 *
 * - Visão Mês (padrão: mês corrente) ou Acumulado do ano (meta × meses
 *   decorridos vs real acumulado).
 * - Real "Lançado" (todas as células, padrão) ou "Consolidado" (apenas as
 *   pintadas de Pago/Recebido na planilha).
 * - Linha Investimentos: meta em % da renda do mês; real = Aporte/Resgate.
 */
export default function OrcamentoVsRealSection() {
  const { year } = useCashflowYear();
  const { data, loading, error, saveMetas } = useOrcamento(year);

  const now = new Date();
  const defaultMes =
    year === now.getFullYear() ? now.getMonth() : year < now.getFullYear() ? 11 : 0;
  const [mes, setMes] = useState<number>(defaultMes);
  const [visao, setVisao] = useState<Visao>('mes');
  const [modoReal, setModoReal] = useState<ModoReal>('lancado');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Meses considerados no acumulado: ano corrente conta até o mês atual;
  // anos passados contam os 12; anos futuros ainda não têm meses decorridos.
  const mesesAcumulados =
    year < now.getFullYear() ? 12 : year > now.getFullYear() ? 0 : now.getMonth() + 1;

  const janela = useMemo(() => {
    const somaJanela = (serie: number[]): number => {
      const total =
        visao === 'mes'
          ? (serie[mes] ?? 0)
          : serie.slice(0, mesesAcumulados).reduce((a, b) => a + b, 0);
      return Math.round(total * 100) / 100;
    };
    const realJanela = (serie: SeriePorModo): number => somaJanela(serie[modoReal]);
    const fatorMeta = visao === 'mes' ? 1 : mesesAcumulados;
    return { somaJanela, realJanela, fatorMeta };
  }, [visao, mes, mesesAcumulados, modoReal]);

  const linhas = useMemo<OrcamentoLinha[]>(() => {
    if (!data) return [];
    return data.categorias.map((cat) => ({
      key: cat.groupId,
      nome: cat.nome,
      parentNome: cat.parentNome,
      metaBase: cat.metaMensal,
      metaJanela: cat.metaMensal !== null ? cat.metaMensal * janela.fatorMeta : null,
      real: janela.realJanela(cat.realPorMes),
      isInvestimentos: false,
    }));
  }, [data, janela]);

  const investimentos = useMemo<OrcamentoLinha | null>(() => {
    if (!data) return null;
    return {
      key: 'investimentos',
      nome: 'Investimentos',
      parentNome: null,
      metaBase: data.investimentos.percentual,
      metaJanela:
        data.investimentos.percentual !== null
          ? janela.somaJanela(data.investimentos.metaPorMes[modoReal])
          : null,
      real: janela.somaJanela(data.investimentos.realPorMes),
      isInvestimentos: true,
    };
  }, [data, janela, modoReal]);

  const totais = useMemo(() => {
    const totalMeta = linhas.reduce((sum, l) => sum + (l.metaJanela ?? 0), 0);
    const totalReal = linhas.reduce((sum, l) => sum + l.real, 0);
    return {
      meta: Math.round(totalMeta * 100) / 100,
      real: Math.round(totalReal * 100) / 100,
      diferenca: Math.round((totalMeta - totalReal) * 100) / 100,
    };
  }, [linhas]);

  const handleSaveMeta = async (key: string, valor: number | null) => {
    setSaveError(null);
    try {
      if (valor === null) {
        await saveMetas({ deletes: [key] });
      } else {
        await saveMetas({ metas: [{ groupId: key === 'investimentos' ? null : key, valor }] });
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar meta');
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Carregando orçamento…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-error-600 dark:text-error-400">
        {error ?? 'Erro ao carregar o orçamento.'}
      </div>
    );
  }

  const toggleClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active
        ? 'bg-white text-brand-600 shadow-theme-xs dark:bg-gray-900 dark:text-brand-400'
        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
    }`;

  return (
    <div className="space-y-5">
      {/* Controles: visão, mês e modo de leitura do real */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-white/[0.03]">
          <button
            type="button"
            className={toggleClass(visao === 'mes')}
            onClick={() => setVisao('mes')}
          >
            Mês
          </button>
          <button
            type="button"
            className={toggleClass(visao === 'ano')}
            onClick={() => setVisao('ano')}
            disabled={mesesAcumulados === 0}
            title={mesesAcumulados === 0 ? 'Ano ainda não começou' : undefined}
          >
            Acumulado do ano
          </button>
        </div>

        {visao === 'mes' && (
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200"
            aria-label="Mês"
          >
            {MONTHS.map((label, index) => (
              <option key={label} value={index}>
                {label}/{String(year).slice(-2)}
              </option>
            ))}
          </select>
        )}

        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-white/[0.03]">
          <button
            type="button"
            className={toggleClass(modoReal === 'lancado')}
            onClick={() => setModoReal('lancado')}
            title="Todas as células da planilha"
          >
            Lançado
          </button>
          <button
            type="button"
            className={toggleClass(modoReal === 'consolidado')}
            onClick={() => setModoReal('consolidado')}
            title="Apenas células pintadas de Pago/Recebido"
          >
            Consolidado
          </button>
        </div>
      </div>

      {saveError && (
        <div className="rounded-lg border border-error-500 bg-error-50 px-4 py-2 text-sm text-error-600 dark:border-error-400 dark:bg-error-500/10 dark:text-error-400">
          {saveError}
        </div>
      )}

      <OrcamentoKpiCards totais={totais} investimentos={investimentos} />

      <OrcamentoChart linhas={linhas} />

      <OrcamentoTable
        linhas={linhas}
        investimentos={investimentos}
        totais={totais}
        onSaveMeta={handleSaveMeta}
      />
    </div>
  );
}
