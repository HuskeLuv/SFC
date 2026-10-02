'use client';

import React, { useId, useState } from 'react';
import { twMerge } from 'tailwind-merge';
import { CARTEIRA_CLASS_TABS } from '@/components/carteira/carteiraTabsConfig';
import {
  CATEGORIAS_CAIXA_RF,
  CATEGORIAS_MOVIVEIS,
  MOTIVO_SALDO_SEM_TITULO,
  SUBGRUPO_EDITAVEL,
  isCategoriaCaixaRf,
  isCategoriaMovivelTodas,
  rotuloCategoria,
  rotuloSubgrupo,
  type CategoriaMovivel,
  type DestinoOpcao,
  type MoverOpcoesResponse,
} from '@/lib/carteiraMover';
import { SeloSecaoAutomatica } from './ConfirmarMoverCard';

/**
 * Lista de destinos do mover (out/2026): uma entrada por aba compatível, com a aba atual
 * primeiro, e um bloco recolhido com as abas que não aceitam o ativo e o motivo de cada uma.
 * - `dialog` (computador, D10): fieldset + legend por aba e rádios nativos com um único `name`
 *   (chips de 34px); a seção atual vem marcada "atual" e desabilitada.
 * - `sheet` (celular, M2-M6): opções de 56px no padrão do MovePanel do Fluxo (`role=radio`).
 *
 * Fase 2 (Reservas + Renda Fixa, out/2026): item do trio mostra um único grupo "Abas de renda
 * fixa", sem seção para escolher (Reservas sem seções; a da RF vem do título, com o selo
 * "Pós-fixada · pelo indexador"). Rádios-chip de 44px no computador, opções de 56px no celular
 * e os bloqueados num <details> com summary de 44px. Itens de bolsa e fundos: como na fase 1.
 */

export interface EscolhaDestino {
  categoria: CategoriaMovivel;
  subgrupo: string;
}

/**
 * Abas que não recebem ativos movidos (Moedas, Previdência, Opções, Imóveis — e, com a fase 2
 * desligada, também Renda Fixa e Reservas, que então não vêm nos destinos do servidor).
 */
export const MOTIVO_ABA_FORA_DA_FASE = 'Ainda não dá para mover ativos para esta aba';

export interface AbaIndisponivel {
  id: string;
  label: string;
  motivo: string;
}

/** O item está numa das 3 abas da fase 2 e pode ser movido (só troca dentro do trio). */
export const isOpcoesCaixaRf = (opcoes: MoverOpcoesResponse | undefined): boolean =>
  !!opcoes?.movivel && isCategoriaCaixaRf(opcoes.atual.categoria);

/** Saldo em conta (sem título): a Renda Fixa vem recusada com o motivo próprio. */
export const isSaldoSemTituloOpcoes = (opcoes: MoverOpcoesResponse): boolean =>
  opcoes.destinos.some(
    (d) =>
      d.categoria === 'rendaFixaFundos' && !d.permitido && d.motivo === MOTIVO_SALDO_SEM_TITULO,
  );

/** Aba atual primeiro, depois as permitidas na ordem da barra de abas. */
export function ordenarDestinos(opcoes: MoverOpcoesResponse): {
  disponiveis: DestinoOpcao[];
  indisponiveis: AbaIndisponivel[];
} {
  const atual = opcoes.atual.categoria;
  const porCategoria = new Map(opcoes.destinos.map((d) => [d.categoria, d]));
  const disponiveis: DestinoOpcao[] = [];
  const daAtual = isCategoriaMovivelTodas(atual) ? porCategoria.get(atual) : undefined;
  if (daAtual) disponiveis.push(daAtual);
  const ordem = isCategoriaCaixaRf(atual) ? CATEGORIAS_CAIXA_RF : CATEGORIAS_MOVIVEIS;
  for (const categoria of ordem) {
    const d = porCategoria.get(categoria);
    if (d && d.permitido && d !== daAtual) disponiveis.push(d);
  }
  const indisponiveis: AbaIndisponivel[] = [];
  for (const tab of CARTEIRA_CLASS_TABS) {
    if (!tab.categoria || tab.categoria === atual) continue;
    const d = isCategoriaMovivelTodas(tab.categoria) ? porCategoria.get(tab.categoria) : undefined;
    if (d?.permitido) continue;
    indisponiveis.push({
      id: tab.id,
      label: tab.label,
      motivo: d?.motivo ?? MOTIVO_ABA_FORA_DA_FASE,
    });
  }
  return { disponiveis, indisponiveis };
}

/** "FII's › Infra" (outra aba) ou só "Infra" (mesma aba); aba sem seção a escolher: só a aba. */
export function rotuloDestino(atual: string, escolha: EscolhaDestino): string {
  if (!SUBGRUPO_EDITAVEL[escolha.categoria]) return rotuloCategoria(escolha.categoria);
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
  // Trio da fase 2: liquidez, Saúde e objetivo vão na lista "O que muda" (EfeitosMoverList).
  if (trocaAba && destino && !isCategoriaCaixaRf(destino.categoria)) {
    for (const aviso of destino.avisos) {
      avisos.push(
        /objetivo/i.test(aviso) ? `${comPonto(aviso)} Ajuste depois na aba.` : comPonto(aviso),
      );
    }
  }
  if (trocaAba && opcoes.original && escolha.categoria === opcoes.original.categoria) {
    const aba = rotuloCategoria(escolha.categoria);
    avisos.push(
      // Trio: símbolo sintético e sem "catálogo" (CDB, saldo) — vale o nome e a aba de origem.
      isOpcoesCaixaRf(opcoes)
        ? `${aba} é a aba de origem: ${opcoes.item.nome || 'o título'} deixa de ter escolha manual.`
        : `Voltando para ${aba}, ${opcoes.item.ticker} deixa de ter escolha manual e segue o tipo do catálogo.`,
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
  if (isOpcoesCaixaRf(props.opcoes)) {
    return props.variante === 'dialog' ? (
      <ListaDialogCaixaRf {...props} />
    ) : (
      <ListaSheetCaixaRf {...props} />
    );
  }
  return props.variante === 'dialog' ? <ListaDialog {...props} /> : <ListaSheet {...props} />;
}

const RADIO_CHIP =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 text-[13.5px] text-gray-700 peer-checked:border-mf-seguranca peer-checked:bg-mf-seguranca peer-checked:text-white peer-focus-visible:ring-[3px] peer-focus-visible:ring-mf-outside peer-disabled:cursor-not-allowed peer-disabled:border-dashed peer-disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:peer-checked:border-mf-patrimonio dark:peer-checked:bg-mf-patrimonio dark:peer-focus-visible:ring-mf-tranquilidade';

/** "3 abas não aceitam este título" / "… este saldo". */
const textoBloqueados = (n: number, saldo: boolean): string =>
  `${n} ${n === 1 ? 'aba não aceita' : 'abas não aceitam'} este ${saldo ? 'saldo' : 'título'}`;

function ListaBloqueados({
  indisponiveis,
  saldo,
}: {
  indisponiveis: AbaIndisponivel[];
  saldo: boolean;
}) {
  if (indisponiveis.length === 0) return null;
  return (
    <details className="rounded-xl border border-dashed border-gray-300 px-3 py-1 text-[13px] text-gray-600 dark:border-gray-700 dark:text-gray-300">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-md font-medium text-gray-800 outline-none focus-visible:ring-[3px] focus-visible:ring-mf-outside dark:text-white/90 dark:focus-visible:ring-mf-tranquilidade">
        {textoBloqueados(indisponiveis.length, saldo)}
      </summary>
      <ul className="mb-2 flex list-disc flex-col gap-0.5 pl-[18px]">
        {indisponiveis.map((aba) => (
          <li key={aba.id}>
            <b className="font-medium text-gray-800 dark:text-white/90">{aba.label}</b>:{' '}
            {aba.motivo}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Computador, fase 2: grupo único "Abas de renda fixa" com rádios-chip de 44px. */
function ListaDialogCaixaRf({ opcoes, escolha, onEscolher, disabled }: DestinoAbaListProps) {
  const baseId = useId();
  const nome = `${baseId}-destino`;
  const notaAtualId = `${baseId}-atual`;
  const { disponiveis, indisponiveis } = ordenarDestinos(opcoes);
  const atual = opcoes.atual.categoria;
  const original = opcoes.original;
  const escolhido = escolha ? disponiveis.find((d) => d.categoria === escolha.categoria) : null;

  return (
    <div className="flex flex-col gap-3">
      <span id={notaAtualId} className="sr-only">
        Lugar atual
      </span>
      <fieldset
        data-mf-destino-grupo="caixaRf"
        className="m-0 flex min-w-0 flex-col gap-2 rounded-xl border border-gray-200 px-3 pt-1 pb-3 dark:border-gray-700"
      >
        <legend className="px-1 text-[13px] font-semibold text-gray-800 dark:text-white/90">
          Abas de renda fixa
          <small className="ml-1.5 font-normal text-gray-600 dark:text-gray-300">
            sem seção para escolher
          </small>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {disponiveis.map((destino) => {
            const ehAtual = destino.categoria === atual;
            const ehOrigem = !!original && original.categoria === destino.categoria && !ehAtual;
            return (
              <label
                key={destino.categoria}
                className="relative"
                data-mf-destino={destino.categoria}
              >
                <input
                  type="radio"
                  name={nome}
                  value={destino.categoria}
                  checked={escolha?.categoria === destino.categoria}
                  disabled={ehAtual || disabled}
                  aria-describedby={ehAtual ? notaAtualId : undefined}
                  onChange={() => onEscolher({ categoria: destino.categoria, subgrupo: '' })}
                  className="peer absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />
                <span className={twMerge(RADIO_CHIP, 'min-h-11 px-3.5')}>
                  {destino.label}
                  {ehAtual && ' · atual'}
                  {ehOrigem && ' · antes'}
                </span>
              </label>
            );
          })}
        </div>
        {escolhido?.categoria === 'rendaFixaFundos' && escolhido.secaoAutomatica && (
          <p className="text-[13px] text-gray-600 dark:text-gray-300">
            Entra em <SeloSecaoAutomatica secao={escolhido.secaoAutomatica} />
          </p>
        )}
      </fieldset>
      <ListaBloqueados indisponiveis={indisponiveis} saldo={isSaldoSemTituloOpcoes(opcoes)} />
    </div>
  );
}

/** Descrição da opção do celular: "Atual", "Entra em Pós-fixada, pelo indexador"… */
const descricaoCaixaRf = (destino: DestinoOpcao, ehAtual: boolean): string => {
  if (ehAtual) return 'Atual';
  if (destino.categoria !== 'rendaFixaFundos') return 'Lista única, sem seções';
  const secao = destino.secaoAutomatica;
  if (!secao) return 'A seção vem do título';
  return `Entra em ${secao.label}, ${secao.via === 'titulo' ? 'pelo tipo do título' : 'pelo indexador'}`;
};

/** Celular, fase 2: "Abas de renda fixa" com opções de 56px. */
function ListaSheetCaixaRf({ opcoes, escolha, onEscolher, disabled }: DestinoAbaListProps) {
  const baseId = useId();
  const grupoId = `${baseId}-grupo`;
  const { disponiveis, indisponiveis } = ordenarDestinos(opcoes);
  const atual = opcoes.atual.categoria;

  return (
    <div className="flex flex-col gap-3">
      <div data-mf-destino-grupo="caixaRf">
        <p
          id={grupoId}
          className="mb-1 px-1 text-xs font-medium tracking-wide text-gray-600 uppercase dark:text-gray-300"
        >
          Abas de renda fixa
        </p>
        <div role="radiogroup" aria-labelledby={grupoId}>
          {disponiveis.map((destino) => {
            const ehAtual = destino.categoria === atual;
            const checked = escolha?.categoria === destino.categoria;
            const inativo = ehAtual || !!disabled;
            return (
              <button
                key={destino.categoria}
                type="button"
                role="radio"
                data-mf-destino={destino.categoria}
                aria-checked={checked}
                aria-disabled={inativo || undefined}
                onClick={() => {
                  if (inativo) return;
                  onEscolher({ categoria: destino.categoria, subgrupo: '' });
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
                      ehAtual && 'font-medium text-gray-600 dark:text-gray-300',
                    )}
                  >
                    {destino.label}
                  </span>
                  <span className="block text-[12.5px] text-gray-600 dark:text-gray-300">
                    {descricaoCaixaRf(destino, ehAtual)}
                  </span>
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
      <ListaBloqueados indisponiveis={indisponiveis} saldo={isSaldoSemTituloOpcoes(opcoes)} />
    </div>
  );
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
