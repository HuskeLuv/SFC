'use client';
import React from 'react';
import { simplifyAssetName } from '@/utils/assetDisplayName';

interface PlanejadoNameCellProps {
  ticker: string;
  nome?: string;
  onRemove: () => void;
}

/**
 * 1ª coluna de um ativo PLANEJADO (sem posição, 16/09/2026): ticker + selo
 * "Planejado" + botão para desistir. Sem link — o planejado não tem página de
 * detalhes (não é uma posição). Selo no azul `outside` da paleta.
 */
const PlanejadoNameCell: React.FC<PlanejadoNameCellProps> = ({ ticker, nome, onRemove }) => {
  const rotulo = ticker || simplifyAssetName(nome);
  const title = nome && nome !== rotulo ? `${rotulo} — ${nome}` : undefined;
  return (
    <div className="flex items-center gap-2">
      <span className="block max-w-[20rem] truncate" title={title}>
        {rotulo}
      </span>
      <span
        className="inline-flex items-center rounded-full bg-[#0079F2]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#0079F2] dark:bg-[#0079F2]/20 dark:text-[#80BCF8]"
        title="Ativo planejado: ainda sem posição. Use o Objetivo para calcular quanto falta e a necessidade de aporte."
      >
        Planejado
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="rounded p-0.5 text-gray-400 transition-colors hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:hover:text-red-400"
        title="Remover do planejamento"
        aria-label={`Remover ${rotulo} do planejamento`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M3 3l6 6M9 3l-6 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
};

export default PlanejadoNameCell;
