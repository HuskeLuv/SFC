'use client';
import React from 'react';
import Label from '@/components/form/Label';

interface ReinvestimentoToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

/**
 * F1.10: toggle opcional exibido em Step4 das compras de RV
 * (Ações, FII, ETF, REIT, Stocks). Marca a operação como reinvestimento
 * de proventos — a transação é gravada com `notes.operation.action =
 * 'reinvestimento'` e o endpoint /api/cashflow/investimentos exibe esse
 * volume em uma categoria separada "Reinvestimentos de Proventos", fora
 * das somas normais de aporte/resgate.
 */
export default function ReinvestimentoToggle({ checked, onChange }: ReinvestimentoToggleProps) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-900/20">
      <div className="flex items-start gap-2">
        <input
          id="isReinvestimento"
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1"
        />
        <div>
          <Label htmlFor="isReinvestimento" className="text-amber-900 dark:text-amber-100">
            Esta operação é reinvestimento de proventos?
          </Label>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-200/80">
            Marque se você está usando dividendos/JCP/rendimentos recebidos para comprar mais cotas.
            Nesse caso, a compra não será contabilizada como novo aporte no Fluxo de Caixa.
          </p>
        </div>
      </div>
    </div>
  );
}
