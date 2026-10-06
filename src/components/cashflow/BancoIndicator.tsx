import React from 'react';
import { formatBRL } from '@/utils/format';
import { MYFINANCE_BRAND } from '@/constants/brandColors';

/** Texto da parte do banco de uma célula (editor do desktop e do celular). */
export const textoParteBanco = (valorBanco: number): string =>
  `Inclui ${formatBRL(valorBanco)} lançados pelo banco (Conexões bancárias). Novos lançamentos do banco somam a este valor.`;

/**
 * Marca da célula em edição que tem parte lançada pelo banco (06/10/2026: o banco soma ao valor
 * digitado; ao editar, o usuário vê quanto do total veio do banco).
 */
export function BancoIndicator({ valorBanco }: { valorBanco: number }) {
  if (!(valorBanco > 0)) return null;
  const texto = textoParteBanco(valorBanco);
  return (
    <span
      data-mf-parte-banco=""
      role="img"
      aria-label={texto}
      title={texto}
      className="inline-flex shrink-0 cursor-help"
      style={{ color: MYFINANCE_BRAND.outside }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3l9-5z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default BancoIndicator;
