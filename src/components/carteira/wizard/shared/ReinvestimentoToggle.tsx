'use client';
import React from 'react';
import Label from '@/components/form/Label';

interface ReinvestimentoToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** 'compra' (default) = adição/aporte; 'resgate' = fluxo de resgate. */
  mode?: 'compra' | 'resgate';
}

/**
 * F1.10 (generalizado no ticket 19/08/2026): marca a operação como "dinheiro
 * que já estava investido" — reinvestimento de proventos, troca/rolagem de
 * ativo ou posição que o cliente já tinha antes de entrar no sistema. A
 * transação é gravada com `notes.operation.action = 'reinvestimento'` e:
 * - /api/cashflow/investimentos tira o valor das linhas automáticas de
 *   Aporte/Resgate (vai para a categoria separada "Reinvestimentos");
 * - o builder de rentabilidade não trata o valor como fluxo externo (MWR).
 * Não muda nada em posição, IR ou rentabilidade do ativo.
 */
export default function ReinvestimentoToggle({
  checked,
  onChange,
  mode = 'compra',
}: ReinvestimentoToggleProps) {
  const isResgate = mode === 'resgate';
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
            {isResgate
              ? 'Este valor será reinvestido (troca/rolagem de ativo)?'
              : 'Este dinheiro já estava investido?'}
          </Label>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-200/80">
            {isResgate
              ? 'Marque se o valor resgatado vai voltar para outro investimento (título que venceu, troca de ativo). O resgate não será contabilizado na linha automática de Aportes/Resgates do Fluxo de Caixa.'
              : 'Marque para reinvestimento de proventos, troca/rolagem de ativo (ex.: título que venceu e foi recomprado) ou posição que o cliente já tinha antes de entrar no sistema. A compra não será contabilizada como novo aporte no Fluxo de Caixa.'}
          </p>
        </div>
      </div>
    </div>
  );
}
