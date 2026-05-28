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

  const [month, setMonth] = useState(initialMonth);
  const [aporte, setAporte] = useState(aporteSugerido.toFixed(2));
  const [balance, setBalance] = useState(initialBalance.toFixed(2));
  const [error, setError] = useState<string | null>(null);

  // Reset quando reabre — reseta defaults a partir do estado mais recente
  // do objetivo (ex: depois de outro entry, último saldo muda).
  useEffect(() => {
    if (isOpen) {
      setMonth(initialMonth);
      setAporte(aporteSugerido.toFixed(2));
      setBalance(initialBalance.toFixed(2));
      setError(null);
    }
  }, [isOpen, initialMonth, aporteSugerido, initialBalance]);

  const createEntry = useCreateEntry(objetivo.id);

  const aporteNum = Number(aporte) || 0;
  const balanceNum = Number(balance) || 0;
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

        {/* Análise */}
        <div className="rounded-lg bg-gray-50 p-3 text-xs dark:bg-gray-800">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>
              Progresso:{' '}
              <strong className={pct >= 100 ? 'text-emerald-600' : 'text-brand-500'}>
                {pct.toFixed(1)}%
              </strong>
            </span>
            <span>
              Δ Saldo:{' '}
              <strong className={deltaSaldo >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                {deltaSaldo >= 0 ? '+' : ''}
                {formatBRL(deltaSaldo)}
              </strong>
            </span>
            <span>
              Δ Aporte:{' '}
              <strong className={deltaAporte >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                {deltaAporte >= 0 ? '+' : ''}
                {formatBRL(deltaAporte)}
              </strong>
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
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
