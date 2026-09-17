'use client';
import React, { useEffect } from 'react';
import Label from '@/components/form/Label';
import { useCarteiraResumoContextOptional } from '@/context/CarteiraResumoContext';
import { formatBRL } from '@/utils/format';

interface CreditarCaixaFieldProps {
  /** Valor do resgate (na moeda do ativo). */
  valor: number;
  /** Moeda do ativo — só resgate em reais volta ao caixa (sem câmbio no resgate). */
  moeda: string;
  checked: boolean | undefined;
  onChange: (value: boolean) => void;
  /** Reinvestimento vai direto pra outro ativo: não passa pelo caixa. */
  isReinvestimento?: boolean;
}

/**
 * Resgate → Caixa para Investir (17/09/2026): o valor volta ao bolso total
 * como caixa LIVRE. Ligado por padrão. Não mexe no Fluxo de Caixa.
 */
export default function CreditarCaixaField({
  valor,
  moeda,
  checked,
  onChange,
  isReinvestimento = false,
}: CreditarCaixaFieldProps) {
  const caixa = useCarteiraResumoContextOptional()?.resumo?.caixa ?? null;
  const emReais = (moeda || 'BRL') === 'BRL';
  const visivel = !isReinvestimento && valor > 0 && emReais;

  useEffect(() => {
    if (visivel && checked === undefined) onChange(true);
  }, [visivel, checked, onChange]);

  if (!isReinvestimento && valor > 0 && !emReais) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Resgate em moeda estrangeira não volta automaticamente ao Caixa para Investir. Se quiser,
        ajuste o caixa na Carteira Consolidada.
      </p>
    );
  }
  if (!visivel) return null;

  const ligado = checked === true;
  return (
    <div className="rounded-lg border border-[#0079F2]/30 bg-[#0079F2]/5 p-3 dark:border-[#80BCF8]/30 dark:bg-[#0079F2]/10">
      <div className="flex items-start gap-2">
        <input
          id="creditarCaixa"
          type="checkbox"
          checked={ligado}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1"
        />
        <div className="min-w-0">
          <Label htmlFor="creditarCaixa" className="text-[#314666] dark:text-blue-100">
            Devolver ao Caixa para Investir
          </Label>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
            {ligado
              ? `${formatBRL(valor)} voltam como caixa livre` +
                (caixa ? `. O caixa total fica em ${formatBRL(caixa.total + valor)}.` : '.')
              : 'O caixa não será alterado.'}
          </p>
        </div>
      </div>
    </div>
  );
}
