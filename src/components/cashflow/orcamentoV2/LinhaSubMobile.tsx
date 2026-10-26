'use client';

import type { SalvarOrcadoEntrada } from '@/hooks/useOrcamentoV2';
import { SELO_TEXTO } from '@/lib/orcamento/tons';
import type { SubcategoriaV2 } from '@/types/orcamentoV2';
import { formatNumber } from '@/utils/format';
import MedidorRitmo from './MedidorRitmo';
import { ETIQUETA_STATUS, TOM_DO_STATUS, num } from './apresentacao';
import { useCampoOrcado } from './useCampoOrcado';

export interface LinhaSubMobileProps {
  sub: SubcategoriaV2;
  categoriaNome: string;
  poupanca: boolean;
  ritmo: number;
  mostrarRitmo: boolean;
  /** "real" (passado/corrente) ou "previsto" (mês futuro no Lançado). */
  rotuloReal: string;
  onSalvarOrcado: (entrada: SalvarOrcadoEntrada) => Promise<unknown>;
}

const ETIQUETA =
  'inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10.5px] font-semibold whitespace-nowrap';
const ETIQUETA_NEUTRA = `${ETIQUETA} bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400`;

/**
 * Subcategoria no cartão do celular (spec mobile, desenho técnico §9 PR 11), em DUAS linhas:
 * 1) nome com as etiquetas (padrão, fixa, status) e, à direita, o realizado e o % consumido;
 * 2) o campo do orçado (R$, ou % nas subs que já estão em %) com o medidor do consumo.
 * Mesmo contrato de edição da linha do desktop (`useCampoOrcado`, R-18): Enter/sair confirma,
 * inválido mostra o erro e restaura, vazio limpa, Esc desfaz; gravação otimista no hook. Na
 * visão acumulada (`editavelOrcado` falso) o orçado é só leitura (Q7).
 */
export default function LinhaSubMobile({
  sub,
  categoriaNome,
  poupanca,
  ritmo,
  mostrarRitmo,
  rotuloReal,
  onSalvarOrcado,
}: LinhaSubMobileProps) {
  const { emPct, erro, inputProps } = useCampoOrcado(sub, onSalvarOrcado);
  const tom = TOM_DO_STATUS[sub.status];
  const etiquetaStatus = ETIQUETA_STATUS[sub.status];
  const destaque = sub.status === 'warn' || sub.status === 'bad';
  const consumido = sub.consumido === null ? '—' : `${formatNumber(sub.consumido * 100, 0)}%`;

  return (
    <div
      data-mf-sub-mobile=""
      data-item-id={sub.id}
      className="border-t border-gray-100 py-2.5 first:border-t-0 dark:border-gray-800"
    >
      {/* Linha 1: nome e valores */}
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-800 dark:text-gray-100">
          <span className="min-w-0 break-words">{sub.nome}</span>
          {sub.geral && <span className={ETIQUETA_NEUTRA}>padrão</span>}
          {sub.fixa && !sub.geral && !poupanca && <span className={ETIQUETA_NEUTRA}>fixa</span>}
          {etiquetaStatus && (
            <span
              className={`${ETIQUETA} bg-gray-100 dark:bg-white/[0.06] ${SELO_TEXTO[tom]}`}
              data-mf-etiqueta={sub.status}
            >
              {etiquetaStatus}
            </span>
          )}
        </p>
        <p className="shrink-0 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
          <span className="block">
            {rotuloReal}{' '}
            <b className="font-semibold text-gray-800 dark:text-white/90">
              {sub.realizado !== 0 ? num(sub.realizado) : '—'}
            </b>
          </span>
          <span
            data-mf-consumo-mobile={sub.status}
            className={`block font-semibold ${
              destaque ? SELO_TEXTO[tom] : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            {consumido}
          </span>
        </p>
      </div>

      {/* Linha 2: orçado (editável) e medidor */}
      <div className="mt-1.5 flex items-center gap-3">
        {sub.editavelOrcado ? (
          <label className="flex min-w-0 flex-1 basis-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 focus-within:border-[#0079F2] focus-within:ring-2 focus-within:ring-[#0079F2]/20 dark:border-gray-700 dark:bg-gray-900">
            <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
              {emPct ? '%' : 'R$'}
            </span>
            <input
              {...inputProps}
              aria-label={
                emPct
                  ? `Orçado de ${sub.nome} em % da receita`
                  : `Orçado de ${sub.nome} em ${categoriaNome}`
              }
              className="h-10 w-full min-w-0 bg-transparent text-right text-base tabular-nums text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </label>
        ) : (
          <p className="min-w-0 flex-1 basis-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
            orçado{' '}
            <b className="font-semibold text-gray-800 dark:text-white/90">
              {sub.orcado > 0 ? num(sub.orcado) : '—'}
            </b>
          </p>
        )}
        <MedidorRitmo
          consumido={sub.consumido}
          status={sub.status}
          ritmo={ritmo}
          mostrarRitmo={mostrarRitmo}
          altura="h-1.5"
          className="flex-1 basis-0"
        />
      </div>
      {emPct && sub.editavelOrcado && (
        <p className="mt-1 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
          = R$ {num(sub.orcado)}
        </p>
      )}
      {erro && (
        <p role="alert" className={`mt-1 break-words text-xs ${SELO_TEXTO.estourou}`}>
          {erro}
        </p>
      )}
    </div>
  );
}
