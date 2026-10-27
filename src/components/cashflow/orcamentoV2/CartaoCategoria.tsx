'use client';

import { useId } from 'react';
import { twMerge } from 'tailwind-merge';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import type { SalvarOrcadoEntrada } from '@/hooks/useOrcamentoV2';
import { SELO_TEXTO } from '@/lib/orcamento/tons';
import type { CategoriaV2 } from '@/types/orcamentoV2';
import { formatNumber } from '@/utils/format';
import IconeCategoria from './IconeCategoria';
import LinhaSubMobile from './LinhaSubMobile';
import MedidorRitmo from './MedidorRitmo';
import { TOM_DO_STATUS, num, pct, plural } from './apresentacao';

export interface CartaoCategoriaProps {
  categoria: CategoriaV2;
  aberta: boolean;
  onAlternar: () => void;
  ritmo: number;
  mostrarRitmo: boolean;
  /** "real" ou "previsto" (mês futuro no Lançado). */
  rotuloReal: string;
  onSalvarOrcado: (entrada: SalvarOrcadoEntrada) => Promise<unknown>;
  /** Subs que passaram no filtro/busca (R-10); sem isso, todas as da categoria. */
  subcategorias?: CategoriaV2['subcategorias'];
}

const ETIQUETA =
  'inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap dark:bg-white/[0.06]';

/**
 * Cartão de uma categoria no celular (spec mobile §cartões; desenho técnico §9 PR 11), no padrão
 * de cartão do `ResponsiveCardList` (`TABLE_MOBILE_STYLES.card`): o cabeçalho inteiro é o botão
 * que abre/fecha (ícone, nome, "n de m com orçamento · x% da receita", % consumido na cor do
 * status, "real de orçado", disponível ou "a mais", medidor com o ritmo e as etiquetas de
 * estouro/à frente). Aberto, lista as subcategorias em duas linhas (`LinhaSubMobile`). Tudo vem
 * pronto do payload; nada é recalculado aqui.
 */
export default function CartaoCategoria({
  categoria: c,
  aberta,
  onAlternar,
  ritmo,
  mostrarRitmo,
  rotuloReal,
  onSalvarOrcado,
  subcategorias = c.subcategorias,
}: CartaoCategoriaProps) {
  const corpoId = useId();
  const tom = TOM_DO_STATUS[c.status];
  const destaque = c.status === 'warn' || c.status === 'bad';
  const consumido = c.consumido === null ? '—' : `${formatNumber(c.consumido * 100, 0)}%`;
  const negativa = c.diferenca < -0.005;
  const resumoSubs = `${c.qtdComOrcamento} de ${plural(
    c.subcategorias.length,
    'subcategoria',
    'subcategorias',
  )} com orçamento${c.pctReceita !== null && c.orcado > 0 ? ` · ${pct(c.pctReceita)} da receita` : ''}`;

  return (
    <div className={twMerge(TABLE_MOBILE_STYLES.card, 'p-0')}>
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={corpoId}
        onClick={onAlternar}
        className="block w-full rounded-2xl px-4 pt-3.5 pb-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0079F2]"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EDF2F8] text-mf-patrimonio dark:bg-white/[0.06] dark:text-mf-tranquilidade">
            <IconeCategoria icone={c.icone} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-800 dark:text-white/90">
              {c.nome}
            </span>
            <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
              {resumoSubs}
            </span>
          </span>
          <span
            data-mf-consumo-mobile={c.status}
            className={`shrink-0 text-sm font-bold tabular-nums ${
              c.consumido === null
                ? 'font-medium text-gray-400 dark:text-gray-500'
                : destaque
                  ? SELO_TEXTO[tom]
                  : 'text-gray-800 dark:text-white/90'
            }`}
          >
            {consumido}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-gray-400 motion-safe:transition-transform dark:text-gray-500 ${
              aberta ? '' : '-rotate-90'
            }`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>

        <span className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs tabular-nums text-gray-500 dark:text-gray-400">
          <span className="min-w-0">
            <b className="font-semibold text-gray-800 dark:text-white/90">{num(c.realizado)}</b> de{' '}
            {num(c.orcado)}
          </span>
          <span className={negativa ? `font-semibold ${SELO_TEXTO.estourou}` : ''}>
            {negativa ? `−${num(Math.abs(c.diferenca))} a mais` : `${num(c.diferenca)} disponível`}
          </span>
        </span>
        <MedidorRitmo
          consumido={c.consumido}
          status={c.status}
          ritmo={ritmo}
          mostrarRitmo={mostrarRitmo}
          className="mt-1.5"
        />
        {(c.qtdEstouro > 0 || c.qtdAFrente > 0) && (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {c.qtdEstouro > 0 && (
              <span className={`${ETIQUETA} ${SELO_TEXTO.estourou}`}>
                {plural(c.qtdEstouro, 'estouro', 'estouros')}
              </span>
            )}
            {c.qtdAFrente > 0 && (
              <span className={`${ETIQUETA} ${SELO_TEXTO.atencao}`}>{c.qtdAFrente} à frente</span>
            )}
          </span>
        )}
      </button>

      {aberta && (
        <div
          id={corpoId}
          data-mf-cartao-subs=""
          className="mx-4 mb-1 border-t border-gray-200 dark:border-gray-800"
        >
          {subcategorias.map((s) => (
            <LinhaSubMobile
              key={s.id}
              sub={s}
              categoriaNome={c.nome}
              poupanca={c.poupanca}
              ritmo={ritmo}
              mostrarRitmo={mostrarRitmo}
              rotuloReal={rotuloReal}
              onSalvarOrcado={onSalvarOrcado}
            />
          ))}
        </div>
      )}
    </div>
  );
}
