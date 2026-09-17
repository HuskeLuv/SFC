import React, { useEffect, useMemo, useState } from 'react';
import Input from '@/components/form/input/InputField';
import { parseCurrencyInput } from '@/utils/parseCurrencyInput';
import { formatBRL } from '@/utils/format';
import { useCarteiraResumoContextOptional } from '@/context/CarteiraResumoContext';
import type { CaixaSaveFailure, SaveCaixaFn } from '@/lib/caixaParaInvestirClient';

type CaixaParaInvestirCardProps = {
  title?: string;
  value: number;
  formatCurrency: (value: number | null | undefined) => string;
  onSave?: SaveCaixaFn;
  color?: 'primary' | 'success' | 'warning' | 'error';
  readOnly?: boolean;
  /**
   * Modelo "bolso total com reservas por aba" (17/09/2026):
   *   - 'total' → card da Carteira Consolidada: o bolso inteiro;
   *   - 'aba'   → card de uma aba: a RESERVA daquela classe dentro do bolso.
   */
  escopo?: 'total' | 'aba';
};

const CaixaParaInvestirCard: React.FC<CaixaParaInvestirCardProps> = ({
  title = 'Caixa para Investir',
  value,
  formatCurrency,
  onSave,
  color = 'success',
  readOnly = false,
  escopo = 'aba',
}) => {
  // Total/reservado/livre vêm do resumo da carteira (mesma fonte pros 11 cards).
  // Fora do provider (testes/uso isolado) o card só mostra o próprio valor.
  const caixa = useCarteiraResumoContextOptional()?.resumo?.caixa ?? null;
  const [failure, setFailure] = useState<CaixaSaveFailure | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formattedValue = useMemo(() => formatCurrency(value ?? 0), [formatCurrency, value]);

  useEffect(() => {
    if (!isEditing) {
      setInputValue(formattedValue);
    }
  }, [formattedValue, isEditing]);

  const handleStartEditing = () => {
    setFailure(null);
    setErrorMessage(null);
    setInputValue(formattedValue);
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setFailure(null);
    setErrorMessage(null);
    setInputValue(formattedValue);
    setIsEditing(false);
  };

  const handleSaveValue = async (opts?: { ajustarTotal?: boolean }) => {
    const parsedValue = parseCurrencyInput(inputValue);
    if (parsedValue === null || parsedValue < 0) {
      setFailure(null);
      setErrorMessage('Informe um valor válido.');
      return;
    }
    setIsSaving(true);
    // Sem opções chama só com o valor (contrato antigo de onSave).
    const result = onSave ? await (opts ? onSave(parsedValue, opts) : onSave(parsedValue)) : false;
    setIsSaving(false);
    if (result === true) {
      setIsEditing(false);
      setFailure(null);
      setErrorMessage(null);
      return;
    }
    if (result === false) {
      setFailure(null);
      setErrorMessage('Não foi possível salvar o valor.');
      return;
    }
    // Recusa por regra do bolso (reserva não cabe / total abaixo das reservas).
    setFailure(result);
    setErrorMessage(result.message);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSaveValue();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelEditing();
    }
  };

  // Paleta My Finance PARTE 2 (ticket 21/08/2026) — mesmo esquema do MetricCard.
  const colorClasses = {
    primary: 'bg-[#0079F2]/10 text-[#314666] dark:bg-[#0079F2]/20 dark:text-blue-100',
    success: 'bg-[#396CAA]/15 text-[#314666] dark:bg-[#396CAA]/25 dark:text-blue-100',
    warning: 'bg-[#EAEAEA] text-[#2D2D2D] dark:bg-white/10 dark:text-gray-100',
    error: 'bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100',
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <p className="text-xs font-medium opacity-80 mb-1">{title}</p>
      {isEditing ? (
        <Input
          id="caixaParaInvestir"
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]*"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleInputKeyDown}
          error={!!errorMessage}
          hint={errorMessage ?? undefined}
          aria-label="Editar caixa para investir"
        />
      ) : (
        <p className="text-xl font-semibold">{formattedValue}</p>
      )}
      {isEditing && failure?.totalNecessario != null && (
        <button
          type="button"
          className="mt-2 w-full rounded-md border border-[#0079F2] px-3 py-1.5 text-xs font-semibold text-[#0079F2] transition-colors hover:bg-[#0079F2]/10 disabled:opacity-60 dark:border-[#80BCF8] dark:text-[#80BCF8]"
          onClick={() => void handleSaveValue({ ajustarTotal: true })}
          disabled={isSaving}
        >
          Aumentar o total para {formatBRL(failure.totalNecessario)} e salvar
        </button>
      )}
      {!isEditing && caixa && (
        <dl
          className="mt-2 space-y-0.5 text-xs opacity-80"
          title={
            escopo === 'total'
              ? 'Bolso total. Nas abas = quanto já está reservado para cada classe; Livre = o que ainda não tem destino.'
              : 'Este valor é a reserva desta aba dentro do Caixa para Investir total.'
          }
        >
          {escopo === 'total' ? (
            <>
              <div className="flex justify-between gap-2">
                <dt>Nas abas</dt>
                <dd className="whitespace-nowrap font-medium">{formatBRL(caixa.reservado)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Livre</dt>
                <dd className="whitespace-nowrap font-medium">
                  {formatBRL(Math.max(0, caixa.livre))}
                </dd>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between gap-2">
                <dt>Caixa total</dt>
                <dd className="whitespace-nowrap font-medium">{formatBRL(caixa.total)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Livre</dt>
                <dd className="whitespace-nowrap font-medium">
                  {formatBRL(Math.max(0, caixa.livre))}
                </dd>
              </div>
            </>
          )}
        </dl>
      )}
      {!isEditing && caixa && caixa.livre < 0 && (
        <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
          As reservas das abas passam do total em {formatBRL(-caixa.livre)}. Ajuste o total ou as
          reservas.
        </p>
      )}
      {!readOnly && (
        <div className="mt-3 flex items-center justify-end gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                onClick={() => void handleSaveValue()}
                disabled={isSaving}
                aria-label="Salvar caixa para investir"
              >
                {isSaving ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                onClick={handleCancelEditing}
                aria-label="Cancelar edição do caixa para investir"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={handleStartEditing}
              aria-label="Editar caixa para investir"
            >
              Editar
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CaixaParaInvestirCard;
