'use client';

import React, { useId, useMemo, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { findGroupInTree } from '@/services/cashflow/reorderItemsInTree';
import {
  filterMoveTargets,
  groupMoveTargetsByTrail,
  listMoveTargets,
  type MoveTarget,
} from '@/lib/cashflow/moveTargets';
import { MOBILE_FIELD_CLASS } from '@/components/ui/sheet/MobileNumberField';
import {
  ActionRow,
  ICONS,
  PrimaryButton,
  SaveError,
  SecondaryButton,
  SheetFooter,
} from './sheetUi';
import type { CellPanelProps } from './CellSheet';

/**
 * Painel "Mover" do sheet da célula (PWA fase 2, protótipo cenário d2) — mover sem arrastar:
 * - para cima/baixo: `reorderItem` (POST item/reorder, o mesmo do arrastar) com o vizinho; o
 *   painel fica aberto para toques repetidos;
 * - para outra seção: busca + destinos (`listMoveTargets`, a regra do `acceptsDrop`) →
 *   `moveItem(id, destino, null, true)`, para o fim do destino.
 */

const REORDER_ERROR = 'Não foi possível mover a linha. Tente de novo.';

export function MovePanel({
  groups,
  item,
  group,
  mutations,
  goTo,
  close,
  onSaved,
  setBusy,
  month,
}: CellPanelProps) {
  const baseId = useId();
  const [step, setStep] = useState<'menu' | 'destino'>('menu');
  const [busy, setLocalBusy] = useState<null | 'up' | 'down' | 'move'>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<MoveTarget | null>(null);

  // Grupo e vizinhos sempre da árvore atual (o reorder é otimista no cache).
  const groupId = item.groupId || group.id;
  const current = findGroupInTree(groups, groupId) ?? group;
  const siblings = (current.items ?? []).filter((i) => !i.hidden);
  const index = siblings.findIndex((i) => i.id === item.id);
  const prev = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  const targets = useMemo(() => listMoveTargets(groups, groupId), [groups, groupId]);
  const sections = useMemo(
    () => groupMoveTargetsByTrail(filterMoveTargets(targets, query)),
    [targets, query],
  );

  const run = async (kind: 'up' | 'down' | 'move', fn: () => Promise<string | null>) => {
    if (busy) return;
    setLocalBusy(kind);
    setBusy(true);
    setError(null);
    let failure: string | null;
    try {
      failure = await fn();
    } catch {
      failure = REORDER_ERROR;
    }
    setLocalBusy(null);
    setBusy(false);
    if (failure) setError(failure);
    return failure;
  };

  const swap = (dir: 'up' | 'down') => {
    const neighbor = dir === 'up' ? prev : next;
    if (!neighbor) return;
    void run(dir, async () => {
      const ok = await mutations.reorderItem(groupId, item.id, neighbor.id);
      if (!ok) return REORDER_ERROR;
      onSaved(dir === 'up' ? 'Linha movida para cima' : 'Linha movida para baixo', {
        itemId: item.id,
        month,
      });
      return null;
    });
  };

  const moveTo = () => {
    if (!picked) return;
    void run('move', async () => {
      const res = await mutations.moveItem(item.id, picked.groupId, null, true);
      if (!res.ok) return res.error;
      close();
      onSaved(`Linha movida para ${picked.name}`, { itemId: item.id, month });
      return null;
    });
  };

  if (step === 'menu') {
    return (
      <>
        <div className="pb-3">
          <p className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">
            {item.name} · em {current.name}
          </p>
          <ActionRow
            icon={ICONS.up}
            title={busy === 'up' ? 'Movendo…' : 'Mover para cima'}
            description={prev ? `Troca com ${prev.name}` : 'Já é a primeira do grupo'}
            onClick={() => swap('up')}
            disabled={!prev || !!busy}
            chevron={false}
          />
          <ActionRow
            icon={ICONS.down}
            title={busy === 'down' ? 'Movendo…' : 'Mover para baixo'}
            description={next ? `Troca com ${next.name}` : 'Já é a última do grupo'}
            onClick={() => swap('down')}
            disabled={!next || !!busy}
            chevron={false}
          />
          <ActionRow
            icon={ICONS.move}
            title="Mover para outra seção"
            description={
              targets.length
                ? 'Ex.: de Lazer para Despesas Pessoais'
                : 'Nenhuma outra seção aceita esta linha'
            }
            onClick={() => {
              setError(null);
              setStep('destino');
            }}
            disabled={!!busy || targets.length === 0}
          />
          <p className="mt-2 px-1 text-xs text-gray-500 dark:text-gray-400">
            Para mudar várias linhas de lugar, use &quot;Reordenar linhas&quot; no ⋯ do grupo. Mudar
            a ordem não entra no Histórico de alterações.
          </p>
        </div>
        <SheetFooter>
          <SaveError message={error} />
          <div className="flex gap-2">
            <SecondaryButton onClick={() => goTo('valor')} disabled={!!busy}>
              Voltar
            </SecondaryButton>
          </div>
        </SheetFooter>
      </>
    );
  }

  const searchId = `${baseId}-busca`;
  return (
    <>
      <div className="flex flex-col gap-3 pb-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Para qual seção vai {item.name}?
        </p>
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Buscar seção
          </label>
          <span
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          >
            {ICONS.search}
          </span>
          <input
            id={searchId}
            type="search"
            value={query}
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Buscar seção"
            onChange={(e) => setQuery(e.target.value)}
            className={twMerge(MOBILE_FIELD_CLASS, 'pl-10')}
          />
        </div>
        {sections.length === 0 && (
          <p className="px-1 text-sm text-gray-500 dark:text-gray-400">
            Nenhuma seção com &quot;{query}&quot;.
          </p>
        )}
        {sections.map((section, sectionIndex) => (
          <div key={section.trail || 'raiz'}>
            <p
              id={`${baseId}-secao-${sectionIndex}`}
              className="mb-1 px-1 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
            >
              {section.trail || 'Seções'}
            </p>
            <div role="radiogroup" aria-labelledby={`${baseId}-secao-${sectionIndex}`}>
              {section.targets.map((target) => {
                const checked = picked?.groupId === target.groupId;
                return (
                  <button
                    key={target.groupId}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => setPicked(target)}
                    disabled={!!busy}
                    className={twMerge(
                      'grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2]/40',
                      checked
                        ? 'bg-mf-tranquilidade/15 dark:bg-mf-tranquilidade/15'
                        : 'active:bg-gray-100 dark:active:bg-white/5',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-gray-800 dark:text-white/90">
                        {target.name}
                      </span>
                      <span className="block text-[12.5px] text-gray-500 dark:text-gray-400">
                        {target.itemCount} {target.itemCount === 1 ? 'linha' : 'linhas'}
                      </span>
                    </span>
                    <span
                      className={twMerge(
                        'h-[22px] w-[22px] rounded-full border-2',
                        checked
                          ? 'border-[7px] border-mf-patrimonio dark:border-mf-tranquilidade'
                          : 'border-gray-300 dark:border-gray-600',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <p className="px-1 text-xs text-gray-500 dark:text-gray-400">
          A linha vai para o fim da seção escolhida, com os valores de todos os meses.
        </p>
      </div>
      <SheetFooter>
        <SaveError message={error} />
        <div className="flex gap-2">
          <SecondaryButton onClick={() => setStep('menu')} disabled={!!busy}>
            Voltar
          </SecondaryButton>
          <PrimaryButton
            onClick={moveTo}
            busy={busy === 'move'}
            busyLabel="Movendo…"
            disabled={!picked}
          >
            {picked ? `Mover para ${picked.name}` : 'Mover'}
          </PrimaryButton>
        </div>
      </SheetFooter>
    </>
  );
}

export default MovePanel;
