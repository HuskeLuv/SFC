'use client';

import { useMemo, useState } from 'react';
import { filtrarCategorias, normalizarBusca, type FiltroOrcamento } from '@/lib/orcamento/regras';
import type { ContagensOrcamento } from '@/lib/orcamento/regras';
import type { CategoriaV2 } from '@/types/orcamentoV2';

/**
 * Estado dos chips + busca (R-10), igual no desktop e no celular. `visiveis` são as categorias que
 * sobram (cópias com as subs já filtradas — a linha/cartão da categoria continua recebendo a
 * original, para "n de m com orçamento" não mudar). Com filtro ou busca ativos, quem chama abre as
 * categorias com resultado sem mexer na preferência salva.
 */
export function useFiltroOrcamento(categorias: CategoriaV2[]) {
  const [filtro, setFiltro] = useState<FiltroOrcamento>('todas');
  const [busca, setBusca] = useState('');
  const ativo = filtro !== 'todas' || normalizarBusca(busca) !== '';
  const visiveis = useMemo(
    () => filtrarCategorias(categorias, filtro, busca),
    [categorias, filtro, busca],
  );
  const limpar = () => {
    setFiltro('todas');
    setBusca('');
  };
  return { filtro, setFiltro, busca, setBusca, ativo, visiveis, limpar };
}

export type FiltroOrcamentoEstado = ReturnType<typeof useFiltroOrcamento>;

const CHIPS: { valor: FiltroOrcamento; rotulo: string; chave?: keyof ContagensOrcamento }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'estouro', rotulo: 'Estouro', chave: 'estouro' },
  { valor: 'aFrente', rotulo: 'À frente do ritmo', chave: 'aFrente' },
  { valor: 'semOrcamento', rotulo: 'Sem orçamento', chave: 'semOrcamento' },
];

const chip = (ativo: boolean) =>
  `inline-flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs transition ${
    ativo
      ? 'border-transparent bg-mf-outside font-semibold text-white'
      : 'border-gray-200 bg-white font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/5'
  }`;
const contador = (ativo: boolean) =>
  `rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums ${
    ativo
      ? 'bg-white/25 text-white'
      : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'
  }`;

/** Chips "Todas · Estouro (n) · À frente do ritmo (n) · Sem orçamento (n)" (spec §4.4, R-10). */
export function ChipsFiltro({
  estado,
  contagens,
  className = '',
}: {
  estado: FiltroOrcamentoEstado;
  /** Do servidor (`resumo.contagens`): não mudam com o filtro nem com a busca. */
  contagens: ContagensOrcamento;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Filtrar por status" className={`flex gap-1.5 ${className}`}>
      {CHIPS.map((c) => {
        const ativo = estado.filtro === c.valor;
        return (
          <button
            key={c.valor}
            type="button"
            data-mf-chip={c.valor}
            aria-pressed={ativo}
            onClick={() => estado.setFiltro(c.valor)}
            className={chip(ativo)}
          >
            {c.rotulo}
            {/* O espaço separa rótulo e número no nome acessível ("Estouro 6"); o flex o ignora. */}
            {c.chave && ' '}
            {c.chave && <span className={contador(ativo)}>{contagens[c.chave]}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Busca por nome de subcategoria ou de categoria, sem acento/caixa (R-10, D13). */
export function BuscaSubcategoria({
  estado,
  placeholder = 'Buscar subcategoria (ex.: iFood)',
  className = '',
}: {
  estado: FiltroOrcamentoEstado;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`relative flex items-center ${className}`}>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-2.5 h-4 w-4 text-gray-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={estado.busca}
        onChange={(e) => estado.setBusca(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar subcategoria"
        className="min-h-9 w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#0079F2] focus:outline-none focus:ring-2 focus:ring-[#0079F2]/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      />
    </label>
  );
}

/** "Nenhuma categoria corresponde ao filtro. Limpar filtros" (spec §4.4). */
export function NadaNoFiltro({ estado }: { estado: FiltroOrcamentoEstado }) {
  return (
    <span data-mf-orcamento-vazio-filtro="" className="text-sm text-gray-500 dark:text-gray-400">
      Nenhuma categoria corresponde ao filtro.{' '}
      <button
        type="button"
        onClick={estado.limpar}
        className="font-medium text-mf-patrimonio hover:underline dark:text-mf-tranquilidade"
      >
        Limpar filtros
      </button>
    </span>
  );
}
