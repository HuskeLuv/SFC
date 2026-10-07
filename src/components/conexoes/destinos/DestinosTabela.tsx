'use client';

import React from 'react';
import { twMerge } from 'tailwind-merge';
import {
  TABLE_HEADER_STYLE,
  TABLE_SECTION_STYLE,
  TABLE_STYLES,
} from '@/components/ui/table/tableStyles';
import { rotuloVia, type DestinoImportadoItem } from '@/lib/pluggyDestinos';
import type { CategoriaMovivel } from '@/lib/carteiraMover';
import { formatBRL } from '@/utils/format';
import DestinoPainelLinha from './DestinoPainelLinha';
import {
  ehRevisavel,
  itemMudou,
  podeServirDeReserva,
  rotuloItem,
  rotuloSugestao,
  rotuloVigente,
  type EstadoDestinos,
  type FaixaDestinos,
  type ItemRevisavel,
} from './destinosEstado';

/**
 * Tabela da revisão no computador (protótipo D2-D7): TABLE_STYLES, cabeçalho `seguranca`, faixas
 * `patrimonio` por aba sugerida (com "marcar todos"), colunas seleção · Investimento · Saldo no
 * banco · Entra na Carteira em. O botão do destino abre o painel na própria linha.
 */

export const ICONE_CADEADO = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const CHEVRON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const SELO =
  'inline-flex items-center rounded-full px-2 py-px text-[11.5px] font-semibold whitespace-nowrap';

/** Selos do item: 'não salvou', 'alterado', 'salvo' ou 'confira' (sempre com texto). */
export function SelosDestino({
  item,
  estado,
}: {
  item: DestinoImportadoItem;
  estado: EstadoDestinos;
}) {
  const id = item.bankInvestmentId;
  let selo: React.ReactNode = null;
  if (estado.falhas[id]) {
    selo = (
      <span
        className={twMerge(
          SELO,
          'bg-[#D92D20]/[0.08] text-[#B42318] dark:bg-[#F97066]/10 dark:text-[#F97066]',
        )}
      >
        não salvou
      </span>
    );
  } else if (itemMudou(item, estado)) {
    selo = (
      <span
        className={twMerge(
          SELO,
          'bg-mf-tranquilidade/[0.18] text-mf-seguranca dark:text-mf-escolha',
        )}
      >
        alterado
      </span>
    );
  } else if (estado.salvos.has(id) && id in estado.escolhas) {
    selo = (
      <span
        className={twMerge(
          SELO,
          'bg-mf-tranquilidade/[0.18] text-mf-seguranca dark:text-mf-escolha',
        )}
      >
        salvo
      </span>
    );
  } else if (item.confira && ehRevisavel(item) && !estado.salvos.has(id)) {
    selo = (
      <span
        className={twMerge(
          SELO,
          'border border-dashed border-mf-patrimonio py-0 text-mf-seguranca dark:border-mf-tranquilidade dark:text-mf-escolha',
        )}
      >
        confira
      </span>
    );
  }
  return selo;
}

/** Linha de origem (12px): de onde veio a sugestão, ou "Escolhido por você · sugestão era …". */
export function OrigemDestino({
  item,
  estado,
  className,
}: {
  item: ItemRevisavel;
  estado: EstadoDestinos;
  className?: string;
}) {
  const id = item.bankInvestmentId;
  let texto: string | null = null;
  if (itemMudou(item, estado)) texto = `Escolhido por você · sugestão era ${rotuloSugestao(item)}`;
  else if (estado.salvos.has(id))
    texto = id in estado.escolhas ? 'No lugar que você escolheu' : 'Conferido';
  else if (item.via) texto = `Sugestão: ${rotuloVia(item.via)}`;
  const dica = !itemMudou(item, estado) && podeServirDeReserva(item);
  if (!texto && !dica) return null;
  return (
    <span className={twMerge('block text-xs text-gray-600 dark:text-gray-300', className)}>
      {texto}
      {dica && <span className="block">Pode servir de reserva de emergência</span>}
    </span>
  );
}

/** Destino sem escolha: cadeado/frase do servidor (previdência, "Já estava", "Cadastre à mão"). */
export function DestinoSemEscolha({ item }: { item: DestinoImportadoItem }) {
  const fixo = item.situacao === 'fixo';
  const rotulo = fixo ? (item.atual?.label ?? null) : (item.atual?.rotulo ?? null);
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      {rotulo && (
        <span className="inline-flex items-center gap-1.5 font-medium text-gray-800 dark:text-white/90">
          {fixo && ICONE_CADEADO}
          {rotulo}
        </span>
      )}
      {item.texto && <span className="text-xs text-gray-600 dark:text-gray-300">{item.texto}</span>}
    </div>
  );
}

/** Caixa nativa de 20px numa área de 44×44 (estado misto por `indeterminate`). */
export function CaixaSelecao({
  checked,
  misto = false,
  disabled,
  rotulo,
  onChange,
}: {
  checked: boolean;
  misto?: boolean;
  disabled?: boolean;
  rotulo: string;
  onChange: () => void;
}) {
  return (
    <label className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-mf-outside dark:has-[:focus-visible]:ring-mf-tranquilidade">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={rotulo}
        ref={(el) => {
          if (el) el.indeterminate = misto;
        }}
        onChange={onChange}
        className="h-5 w-5 cursor-pointer rounded border-gray-400 accent-mf-seguranca outline-none disabled:cursor-not-allowed dark:accent-mf-tranquilidade"
      />
    </label>
  );
}

export interface DestinosTabelaProps {
  faixas: FaixaDestinos[];
  estado: EstadoDestinos;
  painelAberto: string | null;
  salvando: boolean;
  onAlternarPainel: (id: string) => void;
  onAlternarSelecao: (id: string) => void;
  onMarcarFaixa: (ids: string[], marcar: boolean) => void;
  onEscolher: (item: ItemRevisavel, categoria: CategoriaMovivel, subgrupo: string | null) => void;
  onVoltarASugestao: (id: string) => void;
  /** Guarda o botão do destino (o foco volta a ele quando o painel fecha). */
  registrarBotao?: (id: string, el: HTMLButtonElement | null) => void;
}

export const painelId = (id: string) => `destino-painel-${id}`;

export default function DestinosTabela({
  faixas,
  estado,
  painelAberto,
  salvando,
  onAlternarPainel,
  onAlternarSelecao,
  onMarcarFaixa,
  onEscolher,
  onVoltarASugestao,
  registrarBotao,
}: DestinosTabelaProps) {
  return (
    <div className={TABLE_STYLES.wrapper} data-mf-destinos-tabela="">
      <table
        className={twMerge(TABLE_STYLES.table, 'min-w-[760px]')}
        aria-label="Investimentos trazidos do banco"
      >
        <thead>
          <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
            <th className="w-14 px-1.5 py-3">
              <span className="sr-only">Selecionar</span>
            </th>
            <th className={twMerge(TABLE_STYLES.th, 'pl-1')}>Investimento</th>
            <th className={twMerge(TABLE_STYLES.th, 'text-right')}>Saldo no banco</th>
            <th className={TABLE_STYLES.th}>Entra na Carteira em</th>
          </tr>
        </thead>
        {faixas.map((faixa) => {
          const marcaveis = faixa.revisaveis.filter((id) => !estado.salvos.has(id));
          const nMarcados = marcaveis.filter((id) => estado.selecionados.has(id)).length;
          const todos = marcaveis.length > 0 && nMarcados === marcaveis.length;
          return (
            <tbody key={faixa.grupo} data-mf-destinos-faixa={faixa.grupo}>
              <tr className={TABLE_STYLES.sectionRow} style={TABLE_SECTION_STYLE}>
                <td colSpan={4} className="px-1.5 py-0">
                  <div className="flex min-h-11 items-center gap-1">
                    {marcaveis.length >= 2 ? (
                      <span className="[&_input]:accent-mf-escolha">
                        <CaixaSelecao
                          checked={todos}
                          misto={nMarcados > 0 && !todos}
                          disabled={salvando}
                          rotulo={`Selecionar todos de ${faixa.rotulo}`}
                          onChange={() => onMarcarFaixa(marcaveis, !todos)}
                        />
                      </span>
                    ) : (
                      <span className="w-11" aria-hidden="true" />
                    )}
                    <span>{faixa.rotulo}</span>
                    <span className="font-normal opacity-90">({faixa.itens.length})</span>
                  </div>
                </td>
              </tr>
              {faixa.itens.map((item) => {
                const id = item.bankInvestmentId;
                const revisavel = ehRevisavel(item);
                const editavel = revisavel && !estado.salvos.has(id);
                const selecionado = editavel && estado.selecionados.has(id);
                const mudou = itemMudou(item, estado);
                const falhou = !!estado.falhas[id];
                const aberto = editavel && painelAberto === id;
                const rotulo = rotuloItem(item);
                const vigente = rotuloVigente(item, estado);
                return (
                  <React.Fragment key={id}>
                    <tr
                      data-mf-destino-linha={id}
                      className={twMerge(
                        TABLE_STYLES.row,
                        selecionado && 'bg-[#0079F2]/[0.07] dark:bg-[#0079F2]/[0.14]',
                        aberto && 'border-b-0',
                      )}
                    >
                      <td
                        className={twMerge(
                          'w-14 px-1.5 py-1.5 align-middle',
                          mudou && 'shadow-[inset_3px_0_0_#0079F2]',
                          falhou && 'shadow-[inset_3px_0_0_#D92D20]',
                        )}
                      >
                        {editavel && (
                          <CaixaSelecao
                            checked={selecionado}
                            disabled={salvando}
                            rotulo={`Selecionar ${rotulo}`}
                            onChange={() => onAlternarSelecao(id)}
                          />
                        )}
                      </td>
                      <td className={twMerge(TABLE_STYLES.td, 'pl-1')}>
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-gray-800 dark:text-white/90">
                          {item.ticker ? `${item.ticker} · ${item.nome}` : item.nome}
                          <SelosDestino item={item} estado={estado} />
                        </span>
                        <span className="block text-xs text-gray-600 dark:text-gray-300">
                          {item.banco}
                        </span>
                      </td>
                      <td
                        className={twMerge(
                          TABLE_STYLES.td,
                          'text-right whitespace-nowrap tabular-nums',
                        )}
                      >
                        {formatBRL(item.saldo)}
                      </td>
                      <td className={twMerge(TABLE_STYLES.td, 'py-2')}>
                        {revisavel && editavel ? (
                          <div className="flex flex-col items-start gap-1">
                            <button
                              type="button"
                              ref={(el) => registrarBotao?.(id, el)}
                              aria-expanded={aberto}
                              aria-controls={aberto ? painelId(id) : undefined}
                              aria-label={`Destino de ${rotulo}: ${vigente.replace(' › ', ', ')}. Trocar`}
                              disabled={salvando}
                              onClick={() => onAlternarPainel(id)}
                              className={twMerge(
                                'inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-gray-300 bg-white px-3 text-left text-sm font-semibold text-gray-800 outline-none hover:border-mf-patrimonio focus-visible:ring-[3px] focus-visible:ring-mf-outside disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-transparent dark:text-white/90 dark:focus-visible:ring-mf-tranquilidade',
                                (aberto || mudou) &&
                                  'border-mf-seguranca dark:border-mf-tranquilidade',
                              )}
                            >
                              <span>{vigente}</span>
                              {CHEVRON}
                            </button>
                            <OrigemDestino item={item} estado={estado} />
                          </div>
                        ) : revisavel ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                              {vigente}
                            </span>
                            <OrigemDestino item={item} estado={estado} />
                          </div>
                        ) : (
                          <DestinoSemEscolha item={item} />
                        )}
                      </td>
                    </tr>
                    {aberto && revisavel && (
                      <tr className={twMerge(TABLE_STYLES.row, 'bg-gray-50 dark:bg-[#18181B]')}>
                        <td colSpan={4} className="p-0">
                          <DestinoPainelLinha
                            id={painelId(id)}
                            item={item}
                            escolha={estado.escolhas[id] ?? null}
                            mudou={mudou}
                            disabled={salvando}
                            onEscolher={(categoria, subgrupo) =>
                              onEscolher(item, categoria, subgrupo)
                            }
                            onVoltarASugestao={() => onVoltarASugestao(id)}
                            onPronto={() => onAlternarPainel(id)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
