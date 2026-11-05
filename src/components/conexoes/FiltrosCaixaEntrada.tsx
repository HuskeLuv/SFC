'use client';

import type { BancoPendente, FiltrosCaixaEntrada } from '@/hooks/useConexoesBancarias';

/**
 * Filtros da Caixa de entrada (05/11/2026): banco e período pela data da transação. Mesma barra no
 * desktop e no celular; quem aplica é o servidor (a paginação respeita o filtro).
 */
export interface FiltrosCaixaEntradaProps {
  bancos: BancoPendente[];
  filtros: FiltrosCaixaEntrada;
  onChange(filtros: FiltrosCaixaEntrada): void;
}

const CAMPO =
  'min-h-11 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 lg:min-h-0 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90';
const ROTULO = 'mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400';

export const temFiltro = (f: FiltrosCaixaEntrada): boolean => Boolean(f.banco || f.de || f.ate);

export default function FiltrosCaixaEntradaBar({
  bancos,
  filtros,
  onChange,
}: FiltrosCaixaEntradaProps) {
  const set = (parcial: FiltrosCaixaEntrada) => onChange({ ...filtros, ...parcial });
  return (
    <div
      role="group"
      aria-label="Filtros da Caixa de entrada"
      className="mb-3 grid grid-cols-2 items-end gap-2 lg:flex lg:flex-wrap"
    >
      <div className="col-span-2 lg:w-56">
        <label htmlFor="caixa-filtro-banco" className={ROTULO}>
          Banco
        </label>
        <select
          id="caixa-filtro-banco"
          className={CAMPO}
          value={filtros.banco ?? ''}
          onChange={(e) => set({ banco: e.target.value || undefined })}
        >
          <option value="">Todos os bancos</option>
          {bancos.map((b) => (
            <option key={b.connectionId} value={b.connectionId}>
              {b.banco} ({b.total})
            </option>
          ))}
        </select>
      </div>
      <div className="lg:w-40">
        <label htmlFor="caixa-filtro-de" className={ROTULO}>
          De
        </label>
        <input
          id="caixa-filtro-de"
          type="date"
          className={CAMPO}
          value={filtros.de ?? ''}
          max={filtros.ate || undefined}
          onChange={(e) => set({ de: e.target.value || undefined })}
        />
      </div>
      <div className="lg:w-40">
        <label htmlFor="caixa-filtro-ate" className={ROTULO}>
          Até
        </label>
        <input
          id="caixa-filtro-ate"
          type="date"
          className={CAMPO}
          value={filtros.ate ?? ''}
          min={filtros.de || undefined}
          onChange={(e) => set({ ate: e.target.value || undefined })}
        />
      </div>
      {temFiltro(filtros) ? (
        <button
          type="button"
          onClick={() => onChange({})}
          className="col-span-2 min-h-11 rounded-lg px-3 text-sm font-medium text-mf-patrimonio underline-offset-2 hover:underline lg:col-span-1 lg:min-h-0 lg:py-1.5 dark:text-mf-tranquilidade"
        >
          Limpar filtros
        </button>
      ) : null}
    </div>
  );
}
