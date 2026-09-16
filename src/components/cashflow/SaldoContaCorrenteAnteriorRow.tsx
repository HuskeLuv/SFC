import React from 'react';
import { SummaryRow } from './SummaryRow';

interface SaldoContaCorrenteAnteriorRowProps {
  /** 12 valores mensais; null quando o mês ainda não é calculável. */
  cells: (number | null)[];
}

/**
 * Linha "Saldo Conta Corrente Mês Anterior", injetada antes do primeiro grupo
 * de despesas. Mesmo visual do "Saldo do mês" (pedido 16/09/2026): fundo azul
 * claro, positivo azul, negativo vermelho. Anual fica em branco: somar saldos
 * (estoque) mês a mês não tem significado econômico — não é um fluxo do ano.
 */
export const SaldoContaCorrenteAnteriorRow: React.FC<SaldoContaCorrenteAnteriorRowProps> = ({
  cells,
}) => (
  <SummaryRow
    label="Saldo Conta Corrente Mês Anterior"
    tooltip="Janeiro puxa a Conta Corrente de dezembro do ano anterior; os demais meses puxam o bloco Conta Corrente do mês anterior. Não soma nas entradas — só compõe o Fluxo de Caixa livre."
    cells={cells}
    annual={null}
    variant="highlight"
    negativeRed
    positiveBlue
  />
);
