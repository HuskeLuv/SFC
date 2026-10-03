'use client';

/**
 * Abas (Em conferência = lista principal · Revisão · Fechados) e filtros da fila: busca por ticker,
 * classe, origem e responsável. Todos os controles com 44px (48px no celular).
 */
import { useEffect, useState } from 'react';
import type {
  CasosListaFiltro,
  ContagensFila,
  FilaCuradoria,
} from '@/services/analiseAtivos/curadoria/filaCuradoria';
import { T_CUR, TEXTOS_FILA } from './marcasCaso';

export interface FiltrosFilaProps {
  filtros: CasosListaFiltro;
  contagens: ContagensFila | null;
  onMudar: (filtros: CasosListaFiltro) => void;
}

const ABAS: Array<{ fila: FilaCuradoria; rotulo: string }> = [
  { fila: 'principal', rotulo: T_CUR.abas.emConferencia },
  { fila: 'revisao', rotulo: T_CUR.abas.revisao },
  { fila: 'fechados', rotulo: T_CUR.abas.fechados },
];

const CAMPO =
  'min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 max-lg:min-h-12 max-lg:text-base';

const ROTULO = 'text-xs font-medium text-gray-600 dark:text-gray-300';

export default function FiltrosFila({ filtros, contagens, onMudar }: FiltrosFilaProps) {
  const fila = filtros.fila ?? 'principal';
  const abaAtiva = ABAS.some((a) => a.fila === fila) ? fila : 'principal';
  const [busca, setBusca] = useState(filtros.q ?? '');

  useEffect(() => {
    setBusca(filtros.q ?? '');
  }, [filtros.q]);

  // busca com atraso curto (não refaz a consulta a cada tecla)
  useEffect(() => {
    const limpo = busca
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (limpo === (filtros.q ?? '')) return;
    const t = setTimeout(
      () => onMudar({ ...filtros, q: limpo || undefined, cursor: undefined }),
      300,
    );
    return () => clearTimeout(t);
  }, [busca, filtros, onMudar]);

  const mudar = (parcial: Partial<CasosListaFiltro>) =>
    onMudar({ ...filtros, ...parcial, cursor: undefined });

  const temFiltro = !!(filtros.q || filtros.classe || filtros.origem || filtros.responsavel);

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={T_CUR.filtros.rotulo} className="flex flex-wrap gap-2">
        {ABAS.map((a) => {
          const ativo = abaAtiva === a.fila;
          const n = a.fila === 'revisao' ? contagens?.revisao : undefined;
          return (
            <button
              key={a.fila}
              type="button"
              aria-pressed={ativo}
              data-aba={a.fila}
              onClick={() => mudar({ fila: a.fila })}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium max-lg:min-h-12 ${
                ativo
                  ? 'border-[#314666] bg-[#314666] text-white dark:border-[#6E9DC4] dark:bg-[#6E9DC4]/25 dark:text-white'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.04]'
              }`}
            >
              {a.rotulo}
              {n !== undefined && (
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${
                    ativo ? 'bg-white/20' : 'bg-gray-100 dark:bg-white/10'
                  }`}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 @min-[720px]:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] @min-[720px]:items-end">
        <label className="col-span-2 flex flex-col gap-1 @min-[720px]:col-span-1">
          <span className={ROTULO}>{T_CUR.filtros.busca}</span>
          <input
            type="search"
            inputMode="text"
            autoCapitalize="characters"
            maxLength={12}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={CAMPO}
            placeholder="WEGE3"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={ROTULO}>{T_CUR.filtros.classe}</span>
          <select
            className={CAMPO}
            value={filtros.classe ?? ''}
            onChange={(e) =>
              mudar({ classe: (e.target.value || undefined) as CasosListaFiltro['classe'] })
            }
          >
            <option value="">{TEXTOS_FILA.todos}</option>
            <option value="acao">{TEXTOS_FILA.acao}</option>
            <option value="fii">{TEXTOS_FILA.fii}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={ROTULO}>{T_CUR.filtros.origem}</span>
          <select
            className={CAMPO}
            value={filtros.origem ?? ''}
            onChange={(e) =>
              mudar({ origem: (e.target.value || undefined) as CasosListaFiltro['origem'] })
            }
          >
            <option value="">{TEXTOS_FILA.todos}</option>
            <option value="usuario">{T_CUR.origens.usuario}</option>
            <option value="misto">{T_CUR.origens.misto}</option>
            <option value="regra">{T_CUR.origens.regra}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={ROTULO}>{T_CUR.filtros.responsavel}</span>
          <select
            className={CAMPO}
            value={filtros.responsavel ?? ''}
            onChange={(e) =>
              mudar({
                responsavel: (e.target.value || undefined) as CasosListaFiltro['responsavel'],
              })
            }
          >
            <option value="">{TEXTOS_FILA.todos}</option>
            <option value="eu">{T_CUR.filtros.eu}</option>
            <option value="ninguem">{T_CUR.filtros.ninguem}</option>
          </select>
        </label>
        {temFiltro && (
          <button
            type="button"
            onClick={() => onMudar({ fila: filtros.fila })}
            className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-[#396CAA] hover:bg-gray-50 dark:text-[#6E9DC4] dark:hover:bg-white/[0.04] @min-[720px]:col-span-1 max-lg:min-h-12"
          >
            {T_CUR.filtros.limpar}
          </button>
        )}
      </div>
    </div>
  );
}
