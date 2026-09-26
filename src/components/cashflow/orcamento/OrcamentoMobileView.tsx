'use client';

import React from 'react';
import MonthStepper from '@/components/cashflow/mobile/MonthStepper';
import {
  MOBILE_SEGMENTED_ACTIVE,
  MOBILE_SEGMENTED_BUTTON,
  MOBILE_SEGMENTED_INACTIVE,
  MOBILE_SEGMENTED_NAV,
} from '@/components/ui/tabs/ResponsiveTabNav';
import type { OrcamentoCategoria } from '@/services/cashflow/orcamentoVsReal';
import type { OrcamentoLinha } from './OrcamentoTable';
import OrcamentoResumoMobile from './OrcamentoResumoMobile';
import OrcamentoMobileList, { type SaveMetaMobile } from './OrcamentoMobileList';
import OrcamentoChart from './OrcamentoChart';
import OrcamentoMensalChart from './OrcamentoMensalChart';

/**
 * Orçamento vs Real no celular (PWA fase 2, protótipo cenário g). Recebe os MESMOS dados que a
 * seção calcula para o desktop (janela, linhas, investimentos, totais) e só muda a apresentação:
 * barra do mês (compartilhada com a Planilha via `?mes=`), segmentos Mês | Acumulado do ano e
 * Lançado | Consolidado, resumo com medidor e avisos, categorias em cartões com a meta no sheet,
 * rosca "Para onde foi o dinheiro" e "Orçado × real" em barras horizontais.
 */

export type OrcamentoVisao = 'mes' | 'ano';
export type OrcamentoModoReal = 'lancado' | 'consolidado';

const MESES_ABREV = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];
const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export interface OrcamentoMobileViewProps {
  year: number;
  mes: number;
  onMesChange(m: number): void;
  onYearChange?(y: number): void;
  visao: OrcamentoVisao;
  onVisaoChange(v: OrcamentoVisao): void;
  modoReal: OrcamentoModoReal;
  onModoRealChange(m: OrcamentoModoReal): void;
  /** Meses que o acumulado soma (0 = ano futuro, sem acumulado). */
  mesesAcumulados: number;
  linhas: OrcamentoLinha[];
  investimentos: OrcamentoLinha | null;
  totais: { meta: number; real: number; diferenca: number };
  categorias: OrcamentoCategoria[];
  orcadoMensal: number;
  saveError: string | null;
  onSaveMeta: SaveMetaMobile;
}

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange(v: T): void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={MOBILE_SEGMENTED_NAV}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={`${MOBILE_SEGMENTED_BUTTON} min-h-11 disabled:opacity-40 ${
              active ? MOBILE_SEGMENTED_ACTIVE : MOBILE_SEGMENTED_INACTIVE
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function OrcamentoMobileView({
  year,
  mes,
  onMesChange,
  onYearChange,
  visao,
  onVisaoChange,
  modoReal,
  onModoRealChange,
  mesesAcumulados,
  linhas,
  investimentos,
  totais,
  categorias,
  orcadoMensal,
  saveError,
  onSaveMeta,
}: OrcamentoMobileViewProps) {
  const acumulado = visao === 'ano';
  const rotuloAcumulado =
    mesesAcumulados >= 12
      ? 'Jan a dez'
      : mesesAcumulados <= 1
        ? 'Janeiro'
        : `Jan a ${MESES_ABREV[mesesAcumulados - 1]}`;

  return (
    <div data-mf-orcamento-mobile="" className="space-y-4 pb-4">
      {acumulado ? (
        <div className="flex min-h-11 flex-col items-center justify-center text-center">
          <b
            data-mf-month-label=""
            aria-live="polite"
            className="text-[17px] font-semibold text-gray-800 dark:text-white/90"
          >
            {rotuloAcumulado} de {year}
          </b>
          <small className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Acumulado do ano
          </small>
        </div>
      ) : (
        <MonthStepper year={year} month={mes} onChange={onMesChange} onYearChange={onYearChange} />
      )}

      <div className="space-y-2">
        <Segmented<OrcamentoVisao>
          label="Janela"
          value={visao}
          onChange={onVisaoChange}
          options={[
            { value: 'mes', label: 'Mês' },
            { value: 'ano', label: 'Acumulado do ano', disabled: mesesAcumulados === 0 },
          ]}
        />
        <Segmented<OrcamentoModoReal>
          label="Como contar o real"
          value={modoReal}
          onChange={onModoRealChange}
          options={[
            { value: 'lancado', label: 'Lançado' },
            { value: 'consolidado', label: 'Consolidado' },
          ]}
        />
        <p className="px-1 text-xs text-gray-500 dark:text-gray-400">
          {modoReal === 'lancado'
            ? 'Lançado: todas as células da planilha.'
            : 'Consolidado: só as células marcadas como pago/recebido.'}
        </p>
      </div>

      {saveError ? (
        <div
          role="alert"
          className="rounded-xl border border-[#D92D20]/40 bg-[#D92D20]/[0.06] px-4 py-2 text-sm text-[#D92D20] dark:border-[#F97066]/40 dark:text-[#F97066]"
        >
          {saveError}
        </div>
      ) : null}

      <OrcamentoResumoMobile
        rotuloJanela={acumulado ? rotuloAcumulado : MESES[mes]}
        linhas={linhas}
        totais={totais}
      />

      <OrcamentoMobileList
        linhas={linhas}
        investimentos={investimentos}
        totais={totais}
        mesesNaJanela={acumulado ? mesesAcumulados : 1}
        onSaveMeta={onSaveMeta}
      />

      <OrcamentoChart linhas={linhas} variant="mobile" />
      <OrcamentoMensalChart
        visao={visao}
        mes={mes}
        modoReal={modoReal}
        categorias={categorias}
        orcadoMensal={orcadoMensal}
        variant="mobile"
      />
    </div>
  );
}

export { OrcamentoMobileView };
