'use client';
import React, { useEffect, useMemo } from 'react';
import Label from '@/components/form/Label';
import { useCarteiraResumoContextOptional } from '@/context/CarteiraResumoContext';
import { CAIXA_ABAS, planejarDebito, type CaixaAbaKey } from '@/lib/caixaParaInvestirPlano';
import { formatBRL } from '@/utils/format';

interface UsarCaixaFieldProps {
  /** Valor da compra/aporte em R$. */
  valor: number;
  /** Aba do caixa da operação; `null` = sem reserva própria (só o livre). */
  aba: CaixaAbaKey | null;
  checked: boolean | undefined;
  onChange: (value: boolean) => void;
  /** Dinheiro que já estava investido não sai do caixa — o campo some. */
  isReinvestimento?: boolean;
}

/**
 * Caixa para Investir no assistente de compra/aporte (bolso total com reservas
 * por aba, 17/09/2026). Mostra de onde o dinheiro vai sair e avisa quando a
 * reserva da aba ou o caixa total não bastam. Nunca bloqueia a operação: se
 * faltar caixa, só o que existe é descontado. Não mexe no Fluxo de Caixa.
 *
 * Padrão: ligado quando a aba tem reserva; desligado quando não tem (o usuário
 * pode ligar pra usar o caixa livre).
 */
export default function UsarCaixaField({
  valor,
  aba,
  checked,
  onChange,
  isReinvestimento = false,
}: UsarCaixaFieldProps) {
  const caixa = useCarteiraResumoContextOptional()?.resumo?.caixa ?? null;
  const plano = useMemo(
    () => (caixa ? planejarDebito(caixa, aba, valor) : null),
    [caixa, aba, valor],
  );
  const temCaixa = !!caixa && (caixa.total > 0 || caixa.reservado > 0);
  const visivel = temCaixa && !isReinvestimento && valor > 0 && !!plano;

  useEffect(() => {
    if (visivel && checked === undefined) onChange(plano.reservaAba > 0);
  }, [visivel, checked, onChange, plano]);

  if (!visivel) return null;

  const abaLabel = aba ? CAIXA_ABAS[aba].label : null;
  const ligado = checked === true;
  const totalDepois = Math.max(0, caixa.total - plano.coberto);

  const origem: string[] = [];
  if (plano.daReserva > 0) origem.push(`${formatBRL(plano.daReserva)} da reserva de ${abaLabel}`);
  if (plano.doLivre > 0) origem.push(`${formatBRL(plano.doLivre)} do caixa livre`);

  const avisos: string[] = [];
  if (ligado) {
    if (abaLabel && plano.reservaAba < valor && plano.doLivre > 0) {
      avisos.push(
        `A reserva de ${abaLabel} (${formatBRL(plano.reservaAba)}) não cobre este investimento. ` +
          `${formatBRL(plano.doLivre)} vão sair do caixa livre.`,
      );
    }
    if (plano.faltou > 0) {
      avisos.push(
        plano.coberto > 0
          ? `O Caixa para Investir não tem saldo suficiente: faltam ${formatBRL(plano.faltou)}. ` +
              `Só ${formatBRL(plano.coberto)} serão descontados.`
          : `O Caixa para Investir não tem saldo disponível para ${abaLabel ?? 'este tipo'}. ` +
              'Nada será descontado.',
      );
    }
  }

  return (
    <div className="rounded-lg border border-[#0079F2]/30 bg-[#0079F2]/5 p-3 dark:border-[#80BCF8]/30 dark:bg-[#0079F2]/10">
      <div className="flex items-start gap-2">
        <input
          id="usarCaixa"
          type="checkbox"
          checked={ligado}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1"
        />
        <div className="min-w-0">
          <Label htmlFor="usarCaixa" className="text-[#314666] dark:text-blue-100">
            Descontar do Caixa para Investir
          </Label>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
            {ligado
              ? origem.length > 0
                ? `Sai ${origem.join(' e ')}. O caixa total fica em ${formatBRL(totalDepois)}.`
                : 'Nada será descontado.'
              : `O caixa não será alterado (hoje: ${formatBRL(caixa.total)}` +
                (abaLabel ? `, reserva de ${abaLabel} ${formatBRL(plano.reservaAba)}` : '') +
                ').'}
          </p>
          {!abaLabel && ligado && (
            <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
              Este tipo de investimento não tem reserva própria: usa só o caixa livre.
            </p>
          )}
          {avisos.map((aviso) => (
            <p
              key={aviso}
              role="alert"
              className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300"
            >
              {aviso}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
