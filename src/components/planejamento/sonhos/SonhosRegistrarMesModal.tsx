'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import { logger } from '@/lib/logger';
import { addMonths, planned, pmt } from '@/services/planejamento/planejamentoSonhos';
import { useCreateEntry, type PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';
import { currentYearMonth, formatBRL } from './utils';
import MobileNumberField from '@/components/ui/sheet/MobileNumberField';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { MODAL_STICKY_FOOTER } from '@/lib/ui/mobile';
import { formatDecimalInput, parseDecimalInput } from '@/lib/ui/numberInput';

/**
 * Valor do campo. Desktop: `Number(s)` (input type=number, como sempre). Celular: texto com
 * vírgula ('1.500,50') via parseDecimalInput — o mesmo número vai para a API.
 */
function toNumber(value: string, isBelowLg: boolean): number {
  if (!isBelowLg) return Number(value) || 0;
  return parseDecimalInput(value) ?? 0;
}

interface SonhosRegistrarMesModalProps {
  objetivo: PlanejamentoObjetivoDTO;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Modal pra registrar um entry mensal (saldo + aporte).
 *
 * Defaults inteligentes:
 *  - month: próximo mês após o último entry, ou startDate, ou current YYYY-MM
 *  - aporte: valor sugerido pelo pmt()
 *  - saldo: balance do último entry (ou `available` se for o primeiro)
 *
 * Mostra deltas em tempo real (Δ saldo vs planejado, Δ aporte vs pmt).
 */
export default function SonhosRegistrarMesModal({
  objetivo,
  isOpen,
  onClose,
  onSaved,
}: SonhosRegistrarMesModalProps) {
  const aporteSugerido = useMemo(() => pmt(objetivo), [objetivo]);
  const lastEntry = useMemo(() => {
    if (objetivo.entries.length === 0) return null;
    return [...objetivo.entries].sort((a, b) => a.month.localeCompare(b.month)).at(-1) ?? null;
  }, [objetivo.entries]);

  const initialMonth = useMemo(() => {
    if (lastEntry) return addMonths(lastEntry.month, 1);
    if (objetivo.startDate) return objetivo.startDate;
    return currentYearMonth();
  }, [lastEntry, objetivo.startDate]);

  const initialBalance = lastEntry?.balance ?? objetivo.available;
  const isBelowLg = useIsBelowLg();
  // Celular: os campos começam com vírgula decimal ('1.500,50').
  const fmt = (n: number) => (isBelowLg ? formatDecimalInput(n) : n.toFixed(2));

  const [month, setMonth] = useState(initialMonth);
  const [aporte, setAporte] = useState(() => fmt(aporteSugerido));
  const [balance, setBalance] = useState(() => fmt(initialBalance));
  const [error, setError] = useState<string | null>(null);

  // Reset quando reabre — reseta defaults a partir do estado mais recente
  // do objetivo (ex: depois de outro entry, último saldo muda).
  useEffect(() => {
    if (isOpen) {
      setMonth(initialMonth);
      setAporte(fmt(aporteSugerido));
      setBalance(fmt(initialBalance));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fmt só troca com isBelowLg
  }, [isOpen, initialMonth, aporteSugerido, initialBalance, isBelowLg]);

  const createEntry = useCreateEntry(objetivo.id);

  const aporteNum = toNumber(aporte, isBelowLg);
  const balanceNum = toNumber(balance, isBelowLg);
  const idxProximo = objetivo.entries.length + 1;
  const saldoPlanejado = planned(objetivo, idxProximo);
  const deltaSaldo = balanceNum - saldoPlanejado;
  const deltaAporte = aporteNum - aporteSugerido;
  const pct = objetivo.target > 0 ? (balanceNum / objetivo.target) * 100 : 0;

  const handleSave = async () => {
    setError(null);
    if (!month) {
      setError('Informe o mês de referência.');
      return;
    }
    if (balanceNum < 0) {
      setError('Saldo não pode ser negativo.');
      return;
    }
    try {
      await createEntry.mutateAsync({ month, aporte: aporteNum, balance: balanceNum });
      onSaved?.();
      onClose();
    } catch (err) {
      logger.error('Erro ao registrar mês:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar registro.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white/90">
        Registrar mês — {objetivo.name}
      </h3>

      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        <div>
          <Label htmlFor="entry-month">Mês de referência</Label>
          <Input
            id="entry-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>

        {isBelowLg ? (
          <>
            <MobileNumberField
              id="entry-aporte"
              label="Aporte realizado"
              kind="currency"
              prefix="R$"
              value={aporte}
              onChange={setAporte}
              hint={`Planejado: ${formatBRL(aporteSugerido)}`}
            />
            <MobileNumberField
              id="entry-balance"
              label="Saldo ao final do mês"
              kind="currency"
              prefix="R$"
              value={balance}
              onChange={setBalance}
              hint={`Saldo planejado: ${formatBRL(saldoPlanejado)}`}
            />
          </>
        ) : (
          <>
            <div>
              <Label htmlFor="entry-aporte">Aporte realizado (R$)</Label>
              <Input
                id="entry-aporte"
                type="number"
                value={aporte}
                onChange={(e) => setAporte(e.target.value)}
                min="0"
                step="10"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Planejado: {formatBRL(aporteSugerido)}
              </p>
            </div>

            <div>
              <Label htmlFor="entry-balance">Saldo ao final do mês (R$)</Label>
              <Input
                id="entry-balance"
                type="number"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                min="0"
                step="100"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Saldo planejado: {formatBRL(saldoPlanejado)}
              </p>
            </div>
          </>
        )}

        {/* Análise */}
        <div className="rounded-lg bg-gray-50 p-3 text-xs dark:bg-gray-800">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>
              Progresso:{' '}
              <strong
                className={
                  pct >= 100
                    ? 'text-emerald-600 max-lg:text-mf-patrimonio'
                    : 'text-brand-500 max-lg:text-mf-patrimonio'
                }
              >
                {pct.toFixed(1)}%
              </strong>
            </span>
            <span>
              Δ Saldo:{' '}
              <strong
                className={
                  deltaSaldo >= 0
                    ? 'text-emerald-600 max-lg:text-gray-800 dark:max-lg:text-white/90'
                    : 'text-red-600 max-lg:text-[#D92D20] dark:max-lg:text-[#F97066]'
                }
              >
                {deltaSaldo >= 0 ? '+' : ''}
                {formatBRL(deltaSaldo)}
              </strong>
            </span>
            <span>
              Δ Aporte:{' '}
              <strong
                className={
                  deltaAporte >= 0
                    ? 'text-emerald-600 max-lg:text-gray-800 dark:max-lg:text-white/90'
                    : 'text-red-600 max-lg:text-[#D92D20] dark:max-lg:text-[#F97066]'
                }
              >
                {deltaAporte >= 0 ? '+' : ''}
                {formatBRL(deltaAporte)}
              </strong>
            </span>
          </div>
        </div>

        <div className={`flex justify-end gap-2 pt-2 ${MODAL_STICKY_FOOTER.p6}`}>
          <Button onClick={onClose} size="sm" variant="outline">
            Cancelar
          </Button>
          <Button onClick={handleSave} size="sm" disabled={createEntry.isPending}>
            {createEntry.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
