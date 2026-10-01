'use client';

import React, { useId, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { CARTEIRA_CLASS_TABS } from '@/components/carteira/carteiraTabsConfig';
import {
  CATEGORIAS_MOVIVEIS,
  isCategoriaMovivel,
  rotuloCategoria,
  rotuloSubgrupo,
  type CategoriaMovivel,
  type DestinoOpcao,
  type MoverOpcoesResponse,
} from '@/lib/carteiraMover';

/**
 * Lista de destinos do mover (out/2026): uma entrada por aba compatível, com a aba atual
 * primeiro, e um bloco recolhido com as abas que não aceitam o ativo e o motivo de cada uma.
 * - `dialog` (computador, D10): fieldset + legend por aba e rádios nativos com um único `name`
 *   (chips de 34px); a seção atual vem marcada "atual" e desabilitada.
 * - `sheet` (celular, M2-M6): opções de 56px no padrão do MovePanel do Fluxo (`role=radio`).
 */

export interface EscolhaDestino {
  categoria: CategoriaMovivel;
  subgrupo: string;
}

/** Abas fora da fase 1 (Renda Fixa, Reservas, Imóveis…): nunca recebem ativos por aqui. */
export const MOTIVO_ABA_FORA_DA_FASE = 'Ainda não dá para mover ativos para esta aba';

export interface AbaIndisponivel {
  id: string;
  label: string;
  motivo: string;
}

/** Aba atual primeiro, depois as permitidas na ordem da barra de abas. */
export function ordenarDestinos(opcoes: MoverOpcoesResponse): {
  disponiveis: DestinoOpcao[];
  indisponiveis: AbaIndisponivel[];
} {
  const atual = opcoes.atual.categoria;
  const porCategoria = new Map(opcoes.destinos.map((d) => [d.categoria, d]));
  const disponiveis: DestinoOpcao[] = [];
  const daAtual = isCategoriaMovivel(atual) ? porCategoria.get(atual) : undefined;
  if (daAtual) disponiveis.push(daAtual);
  for (const categoria of CATEGORIAS_MOVIVEIS) {
    const d = porCategoria.get(categoria);
    if (d && d.permitido && d !== daAtual) disponiveis.push(d);
  }
  const indisponiveis: AbaIndisponivel[] = [];
  for (const tab of CARTEIRA_CLASS_TABS) {
    if (!tab.categoria || tab.categoria === atual) continue;
    const d = isCategoriaMovivel(tab.categoria) ? porCategoria.get(tab.categoria) : undefined;
    if (d?.permitido) continue;
    indisponiveis.push({
      id: tab.id,
      label: tab.label,
      motivo: d?.motivo ?? MOTIVO_ABA_FORA_DA_FASE,
    });
  }
  return { disponiveis, indisponiveis };
}

/** "FII's › Infra" (outra aba) ou só "Infra" (mesma aba). */
export function rotuloDestino(atual: string, escolha: EscolhaDestino): string {
  const secao = rotuloSubgrupo(escolha.categoria, escolha.subgrupo) ?? escolha.subgrupo;
  return escolha.categoria === atual ? secao : `${rotuloCategoria(escolha.categoria)} › ${secao}`;
}

/** "FII's › FOF (Fundos de Fundos)" — onde o item está hoje. */
export function rotuloAtual(opcoes: MoverOpcoesResponse): string {
  const aba = rotuloCategoria(opcoes.atual.categoria);
  return opcoes.atual.subgrupoLabel ? `${aba} › ${opcoes.atual.subgrupoLabel}` : aba;
}

const comPonto = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** Avisos do destino escolhido (objetivo zera, IR, volta à aba de origem). */
export function avisosDoDestino(
  opcoes: MoverOpcoesResponse,
  escolha: EscolhaDestino | null,
): string[] {
  if (!escolha) return [];
  const avisos: string[] = [];
  const trocaAba = escolha.categoria !== opcoes.atual.categoria;
  const destino = opcoes.destinos.find((d) => d.categoria === escolha.categoria);
  if (trocaAba && destino) {
    for (const aviso of destino.avisos) {
      avisos.push(
        /objetivo/i.test(aviso) ? `${comPonto(aviso)} Ajuste depois na aba.` : comPonto(aviso),
      );
    }
  }
  if (trocaAba && opcoes.original && escolha.categoria === opcoes.original.categoria) {
    avisos.push(
      `Voltando para ${rotuloCategoria(escolha.categoria)}, ${opcoes.item.ticker} deixa de ter escolha manual e segue o tipo do catálogo.`,
    );
  }
  return avisos;
}

interface DestinoAbaListProps {
  opcoes: MoverOpcoesResponse;
  escolha: EscolhaDestino | null;
  onEscolher: (escolha: EscolhaDestino) => void;
  disabled?: boolean;
  variante: 'dialog' | 'sheet';
}

const chave = (categoria: string, subgrupo: string) => `${categoria}|${subgrupo}`;

export function DestinoAbaList(props: DestinoAbaListProps) {
  return props.variante === 'dialog' ? <ListaDialog {...props} /> : <ListaSheet {...props} />;
}

function ListaDialog({ opcoes, escolha, onEscolher, disabled }: DestinoAbaListProps) {
  const baseId = useId();
  const nome = `${baseId}-destino`;
  const notaAtualId = `${baseId}-atual`;
  const { disponiveis, indisponiveis } = ordenarDestinos(opcoes);
  const atual = opcoes.atual;
  const original = opcoes.original;
  const marcado = escolha ? chave(escolha.categoria, escolha.subgrupo) : null;

  return (
    <div className="flex flex-col gap-3">
      <span id={notaAtualId} className="sr-only">
        Lugar atual
      </span>
      {disponiveis.map((destino) => {
        const ehAtual = destino.categoria === atual.categoria;
        const ehOrigem = !!original && original.categoria === destino.categoria && !ehAtual;
        return (
          <fieldset
            key={destino.categoria}
            data-mf-destino={destino.categoria}
            className={twMerge(
              'm-0 flex min-w-0 flex-col gap-2 rounded-xl border border-gray-200 px-3 pt-1 pb-2.5 dark:border-gray-700',
              ehAtual && 'bg-gray-50 dark:bg-white/[0.03]',
            )}
          >
            <legend className="px-1 text-[13px] font-semibold text-gray-800 dark:text-white/90">
              {destino.label}
              {ehAtual && (
                <small className="ml-1.5 font-normal text-gray-500 dark:text-gray-400">
                  aba atual
                </small>
              )}
              {ehOrigem && (
                <small className="ml-1.5 font-normal text-gray-500 dark:text-gray-400">
                  aba de origem
                </small>
              )}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {destino.subgrupos.map((s) => {
                const secaoAtual = ehAtual && s.atual;
                const antes = ehOrigem && original?.subgrupo === s.id;
                const valor = chave(destino.categoria, s.id);
                return (
                  <label key={s.id} className="relative">
                    <input
                      type="radio"
                      name={nome}
                      value={valor}
                      checked={marcado === valor}
                      disabled={secaoAtual || disabled}
                      aria-describedby={secaoAtual ? notaAtualId : undefined}
                      onChange={() => onEscolher({ categoria: destino.categoria, subgrupo: s.id })}
                      className="peer absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    />
                    <span className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 text-[13.5px] text-gray-700 peer-checked:border-mf-seguranca peer-checked:bg-mf-seguranca peer-checked:text-white peer-focus-visible:ring-[3px] peer-focus-visible:ring-mf-outside peer-disabled:cursor-not-allowed peer-disabled:border-dashed peer-disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:peer-checked:border-mf-patrimonio dark:peer-checked:bg-mf-patrimonio dark:peer-focus-visible:ring-mf-tranquilidade">
                      {s.label}
                      {secaoAtual && ' · atual'}
                      {antes && ' · antes'}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      {indisponiveis.length > 0 && (
        <details className="rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-[13px] text-gray-500 dark:border-gray-700 dark:text-gray-400">
          <summary className="flex min-h-7 cursor-pointer items-center rounded-md font-medium text-gray-800 outline-none focus-visible:ring-[3px] focus-visible:ring-mf-outside dark:text-white/90 dark:focus-visible:ring-mf-tranquilidade">
            {indisponiveis.length}{' '}
            {indisponiveis.length === 1 ? 'aba não aceita' : 'abas não aceitam'}{' '}
            {opcoes.item.ticker}
          </summary>
          <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-[18px]">
            {indisponiveis.map((aba) => (
              <li key={aba.id}>
                <b className="font-medium text-gray-800 dark:text-white/90">{aba.label}</b>:{' '}
                {aba.motivo}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ListaSheet({ opcoes, escolha, onEscolher, disabled }: DestinoAbaListProps) {
  const baseId = useId();
  const [maisAberto, setMaisAberto] = useState(false);
  const { disponiveis, indisponiveis } = ordenarDestinos(opcoes);
  const atual = opcoes.atual;
  const marcado = escolha ? chave(escolha.categoria, escolha.subgrupo) : null;
  const listaId = `${baseId}-indisponiveis`;

  return (
    <div className="flex flex-col gap-3">
      {disponiveis.map((destino, i) => {
        const ehAtual = destino.categoria === atual.categoria;
        const grupoId = `${baseId}-g${i}`;
        return (
          <div key={destino.categoria} data-mf-destino={destino.categoria}>
            <p
              id={grupoId}
              className="mb-1 px-1 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
            >
              {ehAtual ? `Nesta aba · ${destino.label}` : destino.label}
            </p>
            <div role="radiogroup" aria-labelledby={grupoId}>
              {destino.subgrupos.map((s) => {
                const secaoAtual = ehAtual && s.atual;
                const valor = chave(destino.categoria, s.id);
                const checked = marcado === valor;
                const inativo = secaoAtual || !!disabled;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-disabled={inativo || undefined}
                    onClick={() => {
                      if (inativo) return;
                      onEscolher({ categoria: destino.categoria, subgrupo: s.id });
                    }}
                    className={twMerge(
                      'grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-mf-outside dark:focus-visible:ring-mf-tranquilidade',
                      checked
                        ? 'bg-mf-tranquilidade/15'
                        : inativo
                          ? 'cursor-default'
                          : 'active:bg-gray-100 dark:active:bg-white/5',
                    )}
                  >
                    <span className="min-w-0">
                      <span
                        className={twMerge(
                          'block truncate text-[15px] font-semibold text-gray-800 dark:text-white/90',
                          secaoAtual && 'font-medium text-gray-500 dark:text-gray-400',
                        )}
                      >
                        {s.label}
                      </span>
                      {secaoAtual && (
                        <span className="block text-[12.5px] text-gray-500 dark:text-gray-400">
                          Atual
                        </span>
                      )}
                    </span>
                    <span
                      aria-hidden="true"
                      className={twMerge(
                        'h-[22px] w-[22px] rounded-full border-2',
                        checked
                          ? 'border-[7px] border-mf-patrimonio dark:border-mf-tranquilidade'
                          : 'border-gray-300 dark:border-gray-600',
                        inativo && !checked && 'opacity-40',
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {indisponiveis.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={maisAberto}
            aria-controls={listaId}
            onClick={() => setMaisAberto((v) => !v)}
            className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-mf-outside dark:focus-visible:ring-mf-tranquilidade"
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-medium text-gray-800 dark:text-white/90">
                {indisponiveis.length}{' '}
                {indisponiveis.length === 1 ? 'aba não aceita' : 'abas não aceitam'}{' '}
                {opcoes.item.ticker}
              </span>
              <span className="block text-[12.5px] text-gray-500 dark:text-gray-400">
                Ver o motivo
              </span>
            </span>
            <span aria-hidden="true" className="text-gray-500 dark:text-gray-400">
              {maisAberto ? '▴' : '▾'}
            </span>
          </button>
          {maisAberto && (
            <ul
              id={listaId}
              className="m-0 flex list-disc flex-col gap-1 pr-3 pl-7 text-[13px] text-gray-500 dark:text-gray-400"
            >
              {indisponiveis.map((aba) => (
                <li key={aba.id}>
                  <b className="font-medium text-gray-800 dark:text-white/90">{aba.label}</b>:{' '}
                  {aba.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default DestinoAbaList;
