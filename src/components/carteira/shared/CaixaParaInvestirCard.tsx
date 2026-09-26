import React, { useEffect, useMemo, useState } from 'react';
import Input from '@/components/form/input/InputField';
import { parseCurrencyInput } from '@/utils/parseCurrencyInput';
import {
  CARD_ACTION_CLASS,
  CARD_BASE_CLASS,
  CARD_COLOR_CLASSES,
  CARD_HEADER_CLASS,
  CARD_ICON_ACTION_CLASS,
  CARD_TITLE_CLASS,
  CARD_VALUE_CLASS,
  type CardColor,
} from './cardStyles';
import { formatBRL } from '@/utils/format';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import MobileEditSheet from '@/components/ui/sheet/MobileEditSheet';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import { useCarteiraResumoContextOptional } from '@/context/CarteiraResumoContext';
import type { CaixaSaveFailure, SaveCaixaFn } from '@/lib/caixaParaInvestirClient';

type CaixaParaInvestirCardProps = {
  title?: string;
  value: number;
  formatCurrency: (value: number | null | undefined) => string;
  onSave?: SaveCaixaFn;
  color?: CardColor;
  readOnly?: boolean;
  /**
   * Modelo "bolso total com reservas por aba" (17/09/2026):
   *   - 'total' → card da Carteira Consolidada: o bolso inteiro;
   *   - 'aba'   → card de uma aba: a RESERVA daquela classe dentro do bolso.
   */
  escopo?: 'total' | 'aba';
};

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (sem Date: evita virar o dia pelo fuso). */
const formatDataBr = (iso: string): string => iso.split('-').reverse().join('/');

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
  const contexto = useCarteiraResumoContextOptional();
  const caixa = contexto?.resumo?.caixa ?? null;
  // Proventos → caixa (fase 3): só no card do bolso total, com a ação disponível.
  const definirCaixaProventos =
    escopo === 'total' && !readOnly ? contexto?.definirCaixaProventos : undefined;
  const proventosDesde = caixa?.proventosDesde ?? null;
  const [salvandoProventos, setSalvandoProventos] = useState(false);
  const [erroProventos, setErroProventos] = useState<string | null>(null);
  const [failure, setFailure] = useState<CaixaSaveFailure | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Celular (PWA fase 1): edição num sheet, com o MESMO onSave.
  const isBelowLg = useIsBelowLg();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetFailure, setSheetFailure] = useState<CaixaSaveFailure | null>(null);
  const [sheetUltimoValor, setSheetUltimoValor] = useState<number | null>(null);
  const [sheetAjustando, setSheetAjustando] = useState(false);

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

  const handleToggleProventos = async (ativo: boolean) => {
    if (!definirCaixaProventos) return;
    setSalvandoProventos(true);
    setErroProventos(null);
    const ok = await definirCaixaProventos(ativo);
    setSalvandoProventos(false);
    if (!ok) setErroProventos('Não foi possível alterar a opção de proventos.');
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

  const detalhes =
    caixa &&
    (escopo === 'total'
      ? [
          { rotulo: 'Nas abas', valor: caixa.reservado },
          { rotulo: 'Livre', valor: Math.max(0, caixa.livre) },
        ]
      : [
          { rotulo: 'Caixa total', valor: caixa.total },
          { rotulo: 'Livre', valor: Math.max(0, caixa.livre) },
        ]);

  if (isBelowLg) {
    // Recusa por regra do bolso: o sheet fica aberto (retorno false) e mostra o motivo; em
    // "reserva não cabe" oferece subir o total junto, como no desktop.
    const handleSheetSubmit = async (valor: number | string | null) => {
      if (!onSave || typeof valor !== 'number') return false;
      setSheetFailure(null);
      setSheetUltimoValor(valor);
      const result = await onSave(valor);
      if (result === true) return true;
      if (result !== false) setSheetFailure(result);
      return false;
    };
    const handleAjustarTotal = async () => {
      if (!onSave || sheetUltimoValor === null) return;
      setSheetAjustando(true);
      const result = await onSave(sheetUltimoValor, { ajustarTotal: true });
      setSheetAjustando(false);
      if (result === true) {
        setSheetFailure(null);
        setSheetOpen(false);
      } else if (result !== false) setSheetFailure(result);
    };
    const livre = caixa ? Math.max(0, caixa.livre) : 0;
    const somaBarra = caixa ? caixa.reservado + livre : 0;
    const sheetHint = (
      <>
        {sheetFailure && (
          <span className="block text-[12.5px] text-[#D92D20] dark:text-[#F97066]">
            {sheetFailure.message}
          </span>
        )}
        {sheetFailure?.totalNecessario != null && (
          <button
            type="button"
            onClick={() => void handleAjustarTotal()}
            disabled={sheetAjustando}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-mf-patrimonio px-3 text-sm font-semibold text-mf-patrimonio disabled:opacity-60 dark:border-mf-tranquilidade dark:text-mf-tranquilidade"
          >
            Aumentar o total para {formatBRL(sheetFailure.totalNecessario)} e salvar
          </button>
        )}
        {definirCaixaProventos && (
          <label className="mt-2 flex min-h-11 items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={!!proventosDesde}
              disabled={salvandoProventos}
              onChange={(e) => void handleToggleProventos(e.target.checked)}
            />
            <span>
              {proventosDesde
                ? `Proventos pagos entram aqui como caixa livre (desde ${formatDataBr(proventosDesde)})`
                : 'Somar aqui os proventos pagos a partir de hoje'}
              {erroProventos && (
                <span className="block text-[#D92D20] dark:text-[#F97066]">{erroProventos}</span>
              )}
            </span>
          </label>
        )}
        {!sheetFailure && escopo === 'aba' && (
          <span className="mt-1 block">Reserva desta aba dentro do Caixa para Investir total.</span>
        )}
      </>
    );

    return (
      <div className={`${CARD_BASE_CLASS} ${CARD_COLOR_CLASSES[color]}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={CARD_TITLE_CLASS} title={title}>
              {title}
            </p>
            <p className={CARD_VALUE_CLASS}>{formattedValue}</p>
          </div>
          {!readOnly && (
            <button
              type="button"
              data-mf-edit="valor"
              className={`-mt-1.5 -mr-2 shrink-0 ${TABLE_MOBILE_STYLES.editButton}`}
              onClick={() => {
                setSheetFailure(null);
                setSheetOpen(true);
              }}
              aria-label={`Editar ${title.toLowerCase()}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Zm9.5-13.5 4 4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Editar
            </button>
          )}
        </div>

        {escopo === 'total' && caixa && somaBarra > 0 && (
          <div
            aria-hidden="true"
            className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-mf-escolha dark:bg-white/10"
          >
            <span
              className="h-full bg-[#0079F2]"
              style={{ width: `${(caixa.reservado / somaBarra) * 100}%` }}
            />
          </div>
        )}

        {detalhes && (
          <dl className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
            {detalhes.map(({ rotulo, valor }) => (
              <div key={rotulo} className="flex items-baseline gap-1">
                <dt className="opacity-80">{rotulo}</dt>
                <dd className="whitespace-nowrap font-medium tabular-nums">{formatBRL(valor)}</dd>
              </div>
            ))}
            {escopo === 'total' && proventosDesde && (
              <div className="flex items-baseline">
                <dt className="sr-only">Proventos</dt>
                <dd className="opacity-80">+ proventos</dd>
              </div>
            )}
          </dl>
        )}

        {caixa && caixa.livre < 0 && (
          <p className="mt-1 text-xs font-medium text-[#B45309] dark:text-amber-300">
            As reservas das abas passam do total em {formatBRL(-caixa.livre)}. Ajuste o total ou as
            reservas.
          </p>
        )}

        {!readOnly && (
          <MobileEditSheet
            isOpen={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title={`Editar ${title.toLowerCase()}`}
            label={escopo === 'total' ? 'Valor total do caixa' : 'Reserva desta aba'}
            kind="currency"
            prefix="R$"
            min={0}
            initialValue={value ?? 0}
            parseValue={(raw) => parseCurrencyInput(raw)}
            hint={sheetHint}
            onSubmit={handleSheetSubmit}
            savedMessage={() => `${title} salvo`}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`${CARD_BASE_CLASS} ${CARD_COLOR_CLASSES[color]}`}>
      {/* Ações na MESMA linha do título: o card fica da altura dos MetricCards
          vizinhos, em vez de esticar a linha inteira da grade. */}
      <div className={CARD_HEADER_CLASS}>
        <p className={CARD_TITLE_CLASS} title={title}>
          {title}
        </p>
        {!readOnly &&
          (isEditing ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className={`${CARD_ICON_ACTION_CLASS} bg-brand-500 text-white hover:bg-brand-600`}
                onClick={() => void handleSaveValue()}
                disabled={isSaving}
                aria-label="Salvar caixa para investir"
                title="Salvar (Enter)"
              >
                {isSaving ? '…' : '✓'}
              </button>
              <button
                type="button"
                className={`${CARD_ICON_ACTION_CLASS} border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800`}
                onClick={handleCancelEditing}
                aria-label="Cancelar edição do caixa para investir"
                title="Cancelar (Esc)"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={CARD_ACTION_CLASS}
              onClick={handleStartEditing}
              aria-label="Editar caixa para investir"
            >
              Editar
            </button>
          ))}
      </div>

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
        <p className={CARD_VALUE_CLASS}>{formattedValue}</p>
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

      {isEditing && definirCaixaProventos && (
        <label className="mt-2 flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!!proventosDesde}
            disabled={salvandoProventos}
            onChange={(e) => void handleToggleProventos(e.target.checked)}
          />
          <span>
            {proventosDesde
              ? `Proventos pagos entram aqui como caixa livre (desde ${formatDataBr(proventosDesde)})`
              : 'Somar aqui os proventos pagos a partir de hoje'}
            {erroProventos && (
              <span className="block text-red-600 dark:text-red-400">{erroProventos}</span>
            )}
          </span>
        </label>
      )}

      {!isEditing && detalhes && (
        <dl
          className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs opacity-80"
          title={
            escopo === 'total'
              ? 'Bolso total. Nas abas = quanto já está reservado para cada classe; Livre = o que ainda não tem destino.'
              : 'Este valor é a reserva desta aba dentro do Caixa para Investir total.'
          }
        >
          {detalhes.map(({ rotulo, valor }) => (
            <div key={rotulo} className="flex items-baseline gap-1">
              <dt>{rotulo}</dt>
              <dd className="whitespace-nowrap font-medium">{formatBRL(valor)}</dd>
            </div>
          ))}
          {escopo === 'total' && proventosDesde && (
            <div
              className="flex items-baseline"
              title={`Proventos pagos desde ${formatDataBr(proventosDesde)} entram no caixa livre.`}
            >
              <dt className="sr-only">Proventos</dt>
              <dd>+ proventos</dd>
            </div>
          )}
        </dl>
      )}

      {!isEditing && caixa && caixa.livre < 0 && (
        <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
          As reservas das abas passam do total em {formatBRL(-caixa.livre)}. Ajuste o total ou as
          reservas.
        </p>
      )}
    </div>
  );
};

export default CaixaParaInvestirCard;
