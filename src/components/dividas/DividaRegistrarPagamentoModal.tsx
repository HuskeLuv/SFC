'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import { logger } from '@/lib/logger';
import {
  useRegistrarPagamento,
  type DividaDTO,
  type DividaPagamentoTipo,
} from '@/hooks/useDividas';
import { currentYearMonth, formatBRL } from './utils';

interface DividaRegistrarPagamentoModalProps {
  divida: DividaDTO;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Modal pra registrar um pagamento.
 *
 * Defaults inteligentes (financiamento): parcela nº = próxima do cronograma,
 * valor = parcela esperada, mês = mês da próxima parcela. Rotativa: só mês e
 * valor, com opção de "ajuste" (encargos/novos saques que SOMAM ao saldo).
 */
export default function DividaRegistrarPagamentoModal({
  divida,
  isOpen,
  onClose,
  onSaved,
}: DividaRegistrarPagamentoModalProps) {
  const isFinanciamento = divida.modalidade === 'financiamento';
  const proxima = divida.resumo?.proximaParcela ?? null;

  const initialMonth = proxima?.mes ?? currentYearMonth();
  const initialValor = proxima ? proxima.parcela.toFixed(2) : '';
  const initialParcela = proxima ? String(proxima.numero) : '';

  const [month, setMonth] = useState(initialMonth);
  const [valor, setValor] = useState(initialValor);
  const [parcelaNumero, setParcelaNumero] = useState(initialParcela);
  const [vincularParcela, setVincularParcela] = useState(isFinanciamento);
  const [tipo, setTipo] = useState<DividaPagamentoTipo>('pagamento');
  const [error, setError] = useState<string | null>(null);

  // Reset quando reabre — defaults a partir do estado mais recente da dívida.
  useEffect(() => {
    if (isOpen) {
      setMonth(initialMonth);
      setValor(initialValor);
      setParcelaNumero(initialParcela);
      setVincularParcela(isFinanciamento);
      setTipo('pagamento');
      setError(null);
    }
  }, [isOpen, initialMonth, initialValor, initialParcela, isFinanciamento]);

  const registrar = useRegistrarPagamento(divida.id);

  const valorNum = useMemo(() => Number(valor.replace(',', '.')) || 0, [valor]);
  const deltaParcela = proxima && vincularParcela ? valorNum - proxima.parcela : null;

  const handleSave = async () => {
    setError(null);
    if (!month) {
      setError('Informe o mês do pagamento.');
      return;
    }
    if (valorNum <= 0) {
      setError('Informe um valor positivo.');
      return;
    }
    try {
      await registrar.mutateAsync({
        month,
        valor: valorNum,
        parcelaNumero:
          isFinanciamento && vincularParcela && tipo === 'pagamento'
            ? Number(parcelaNumero) || null
            : null,
        tipo,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      logger.error('Erro ao registrar pagamento:', err);
      setError(err instanceof Error ? err.message : 'Erro ao registrar pagamento.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white/90">
        Registrar pagamento — {divida.nome}
      </h3>

      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {/* Tipo: rotativa lança ajuste; financiamento lança amortização
            com redução de prazo (quita parcelas do FIM do cronograma). */}
        <div className="inline-flex flex-wrap rounded-lg border border-gray-200 p-0.5 dark:border-gray-800">
          {(isFinanciamento
            ? ([
                ['pagamento', 'Pagamento'],
                ['amortizacao_prazo', 'Amortização (reduz prazo)'],
              ] as const)
            : ([
                ['pagamento', 'Pagamento (reduz saldo)'],
                ['ajuste', 'Ajuste (soma ao saldo)'],
              ] as const)
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTipo(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tipo === value
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              aria-pressed={tipo === value}
            >
              {label}
            </button>
          ))}
        </div>
        {tipo === 'amortizacao_prazo' ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Quita as <strong>últimas parcelas</strong> do cronograma (redução de prazo): o valor
            pago cobre a amortização de cada parcela do fim — os juros que ainda não correram são o
            seu desconto. O saldo devedor cai pelo valor pago e o prazo encurta; a projeção no fluxo
            de caixa perde as parcelas do fim.
          </p>
        ) : null}

        <div>
          <Label htmlFor="pg-month">Mês do pagamento</Label>
          <Input
            id="pg-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="pg-valor">Valor (R$)</Label>
          <Input
            id="pg-valor"
            type="number"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            min="0"
            step="10"
          />
          {proxima && vincularParcela && tipo === 'pagamento' ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Parcela esperada: {formatBRL(proxima.parcela)}
              {deltaParcela != null && Math.abs(deltaParcela) >= 0.01 ? (
                <strong className={deltaParcela > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                  {' '}
                  ({deltaParcela > 0 ? '+' : ''}
                  {formatBRL(deltaParcela)})
                </strong>
              ) : null}
            </p>
          ) : null}
        </div>

        {isFinanciamento && tipo === 'pagamento' ? (
          <>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={vincularParcela}
                onChange={(e) => setVincularParcela(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Vincular a uma parcela do cronograma
            </label>
            {vincularParcela ? (
              <div>
                <Label htmlFor="pg-parcela">Parcela nº</Label>
                <Input
                  id="pg-parcela"
                  type="number"
                  value={parcelaNumero}
                  onChange={(e) => setParcelaNumero(e.target.value)}
                  min="1"
                  max={String(divida.prazoMeses ?? 480)}
                  step="1"
                />
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sem vínculo, o valor é tratado como pagamento extraordinário: abate direto do saldo
                devedor, sem avançar o cronograma.
              </p>
            )}
          </>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} size="sm" variant="outline">
            Cancelar
          </Button>
          <Button onClick={handleSave} size="sm" disabled={registrar.isPending}>
            {registrar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
