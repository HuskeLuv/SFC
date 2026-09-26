'use client';

import React, { useState } from 'react';
import { formatBRL } from '@/utils/format';
import { nivelOrcamento } from '@/lib/cashflow/orcamentoNivel';
import type { OrcamentoLinha } from './OrcamentoTable';
import { OrcamentoMeter, tomDoNivel } from './OrcamentoMobileList';

/**
 * Resumo do Orçamento vs Real no celular (PWA fase 2, protótipo cenário g): "Sobram R$ …" (ou
 * "Passou R$ …"), real × orçado, medidor de 10px (escala até 120%, marcas em 80% e 100%) e os
 * avisos da janela — as categorias que chegaram ao nível de alerta do sino (≥ 80%).
 */

interface OrcamentoResumoMobileProps {
  /** Ex.: 'Julho' ou 'Jan a set'. */
  rotuloJanela: string;
  linhas: OrcamentoLinha[];
  totais: { meta: number; real: number; diferenca: number };
}

/** Avisos à vista antes do "Mostrar mais" (os mais graves primeiro). */
const AVISOS_VISIVEIS = 3;

function IconeAlerta() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 9v4m0 4h.01M10.3 3.9L2.4 17.6A2 2 0 004.1 20.6h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function OrcamentoResumoMobile({
  rotuloJanela,
  linhas,
  totais,
}: OrcamentoResumoMobileProps) {
  const temMeta = totais.meta > 0;
  const nivelTotal = nivelOrcamento(totais.real, temMeta ? totais.meta : null);
  const tomTotal = tomDoNivel(nivelTotal, false);
  const sobra = totais.diferenca;

  const [todosAvisos, setTodosAvisos] = useState(false);
  const avisos = linhas
    .map((linha) => ({ linha, nivel: nivelOrcamento(linha.real, linha.metaJanela) }))
    .filter(({ nivel }) => nivel.status !== 'sem-meta' && nivel.status !== 'dentro')
    .sort((a, b) => (b.nivel.pct ?? 0) - (a.nivel.pct ?? 0));

  return (
    <>
      <div
        data-mf-orcamento-resumo=""
        className="rounded-2xl border border-gray-200 bg-white p-4 max-[359px]:p-3 dark:border-gray-800 dark:bg-white/[0.03]"
      >
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Orçado × real · {rotuloJanela}
        </p>
        {temMeta ? (
          <>
            <p
              className={`mt-0.5 text-[26px] leading-tight font-semibold tabular-nums max-[359px]:text-[22px] ${
                sobra >= 0
                  ? 'text-mf-patrimonio dark:text-mf-tranquilidade'
                  : 'text-[#D92D20] dark:text-[#F97066]'
              }`}
            >
              {sobra >= 0 ? 'Sobram ' : 'Passou '}
              {formatBRL(Math.abs(sobra))}
            </p>
            <p className="mt-0.5 text-[13.5px] text-gray-600 tabular-nums dark:text-gray-300">
              Real {formatBRL(totais.real)} de {formatBRL(totais.meta)} orçados
              {nivelTotal.pct !== null ? ` · ${nivelTotal.pct}%` : ''}
            </p>
            <div className="mt-2.5">
              <OrcamentoMeter pct={nivelTotal.pct} tom={tomTotal} height={10} showScale />
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Nenhuma meta definida ainda. Toque numa categoria abaixo para definir. Real da janela:{' '}
            <b className="font-semibold tabular-nums">{formatBRL(totais.real)}</b>.
          </p>
        )}
      </div>

      {avisos.length > 0 ? (
        <ul aria-label="Avisos do orçamento" className="space-y-2">
          {(todosAvisos ? avisos : avisos.slice(0, AVISOS_VISIVEIS)).map(({ linha, nivel }) => {
            const estourou = nivel.status === 'estourou';
            const meta = linha.metaJanela ?? 0;
            return (
              <li
                key={linha.key}
                className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] leading-snug text-gray-800 dark:text-white/90 ${
                  estourou ? 'bg-[#D92D20]/[0.08] dark:bg-[#F97066]/[0.12]' : 'bg-[#D97706]/10'
                }`}
              >
                <span
                  className={`mt-px shrink-0 ${
                    estourou
                      ? 'text-[#D92D20] dark:text-[#F97066]'
                      : 'text-[#B45309] dark:text-[#D97706]'
                  }`}
                >
                  <IconeAlerta />
                </span>
                <span>
                  <b className="font-semibold">{linha.nome}</b>{' '}
                  {estourou
                    ? `passou do orçado em ${formatBRL(linha.real - meta)} (${nivel.pct}%).`
                    : nivel.status === 'atingido'
                      ? 'atingiu o orçado.'
                      : `já usou ${nivel.pct}% do orçado. Restam ${formatBRL(meta - linha.real)}.`}
                </span>
              </li>
            );
          })}
          {avisos.length > AVISOS_VISIVEIS ? (
            <li>
              <button
                type="button"
                aria-expanded={todosAvisos}
                onClick={() => setTodosAvisos((v) => !v)}
                className="min-h-11 px-1 text-sm font-semibold text-mf-patrimonio focus-visible:outline-2 focus-visible:outline-[#0079F2] dark:text-mf-tranquilidade"
              >
                {todosAvisos
                  ? 'Mostrar menos avisos'
                  : `Mostrar mais ${avisos.length - AVISOS_VISIVEIS} avisos`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </>
  );
}

export { OrcamentoResumoMobile };
