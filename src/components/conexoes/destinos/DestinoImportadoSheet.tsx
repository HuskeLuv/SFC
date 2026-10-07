'use client';

import React, { useState } from 'react';
import { twMerge } from 'tailwind-merge';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import { PrimaryButton, SecondaryButton } from '@/components/cashflow/mobile/edit/sheetUi';
import { DestinoAbaList } from '@/components/carteira/mover/DestinoAbaList';
import { EfeitosMoverList } from '@/components/carteira/mover/EfeitosMoverList';
import { intersecaoDestinos } from '@/lib/pluggyDestinos';
import { formatBRL } from '@/utils/format';
import { TEXTO_SEM_DESTINO_COMUM } from './AplicarLoteBarra';
import { TEXTO_NAO_MUDA, paraEscolhaDoMover, useImpactoDestino } from './DestinoPainelLinha';
import {
  ehSugestao,
  opcoesDoLote,
  rotuloEscolha,
  rotuloItem,
  type EscolhaItem,
  type ItemRevisavel,
} from './destinosEstado';

/** Um item ("Trocar") ou a faixa inteira ("Trocar todos"). */
export type AlvoSheet =
  | { tipo: 'item'; item: ItemRevisavel; escolha: EscolhaItem | null }
  | { tipo: 'grupo'; rotulo: string; itens: ItemRevisavel[] };

interface Props {
  alvo: AlvoSheet | null;
  onFechar: () => void;
  onUsar: (escolha: EscolhaItem) => void;
  onVoltarASugestao: (id: string) => void;
}

/**
 * Painel do celular (protótipo M3-M5), BottomSheet no padrão do MovePanel: "Onde <nome> vai
 * entrar" com DestinoAbaList variante 'sheet' (opções de 56px, bloqueados com o motivo do
 * servidor) + efeitos e o primário "Usar <Aba › Seção>". Para a faixa ("Trocar todos"), as
 * opções são a interseção das opções de todos os itens e o primário "Usar para os N".
 */
export default function DestinoImportadoSheet(props: Props) {
  const { alvo } = props;
  // "Voltar" do sistema fecha o sheet (e só ele: a revisão por baixo tem a própria camada).
  useMobileHistoryLayer(alvo !== null, props.onFechar, useIsBelowLg());
  if (!alvo) return null;
  // Remonta por alvo: a escolha em andamento não vaza de um item para outro.
  const chave =
    alvo.tipo === 'item'
      ? alvo.item.bankInvestmentId
      : `grupo-${alvo.itens.map((i) => i.bankInvestmentId).join(',')}`;
  return alvo.tipo === 'item' ? (
    <SheetItem key={chave} {...props} alvo={alvo} />
  ) : (
    <SheetGrupo key={chave} {...props} alvo={alvo} />
  );
}

const CAIXA_IMPACTO =
  'mb-2 rounded-[10px] bg-gray-50 px-3 py-2 text-[13px] text-gray-700 dark:bg-white/[0.04] dark:text-gray-200';

function SheetItem({
  alvo,
  onFechar,
  onUsar,
  onVoltarASugestao,
}: Props & { alvo: Extract<AlvoSheet, { tipo: 'item' }> }) {
  const { item, escolha: escolhaInicial } = alvo;
  const [pick, setPick] = useState<EscolhaItem | null>(escolhaInicial);
  const { efeitos, avisos, caixaRf } = useImpactoDestino(item, pick);
  const rotulo = rotuloItem(item);
  const mudaria =
    !!pick &&
    !ehSugestao(item.opcoes, pick) &&
    !(
      escolhaInicial &&
      escolhaInicial.categoria === pick.categoria &&
      escolhaInicial.subgrupo === pick.subgrupo
    );

  return (
    <BottomSheet
      isOpen
      onClose={onFechar}
      title={`Onde ${rotulo} vai entrar`}
      className="font-outfit"
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={onFechar}>Voltar</SecondaryButton>
          <PrimaryButton disabled={!mudaria} onClick={() => pick && onUsar(pick)}>
            {pick && mudaria ? `Usar ${rotuloEscolha(item.opcoes, pick)}` : 'Usar'}
          </PrimaryButton>
        </div>
      }
    >
      <p className="-mt-1 mb-3 px-1 text-[13px] text-gray-600 dark:text-gray-300">
        {item.ticker ? item.nome : item.banco} · {formatBRL(item.saldo)}
      </p>
      {escolhaInicial && (
        <button
          type="button"
          onClick={() => onVoltarASugestao(item.bankInvestmentId)}
          className="mb-2 min-h-11 rounded-lg px-1 text-sm font-semibold text-mf-patrimonio underline underline-offset-[3px] dark:text-mf-tranquilidade"
        >
          Voltar à sugestão
        </button>
      )}
      <div className="pb-3">
        <DestinoAbaList
          variante="sheet"
          opcoes={item.opcoes}
          escolha={paraEscolhaDoMover(pick)}
          onEscolher={(e) => setPick({ categoria: e.categoria, subgrupo: e.subgrupo || null })}
        />
      </div>
      {/* No corpo rolável (não no rodapé fixo): em telas baixas (320×568) a caixa de impacto
          no rodapé espremia a lista e escondia a opção marcada. */}
      <div aria-live="polite" className={CAIXA_IMPACTO}>
        {caixaRf && efeitos.length > 0 ? (
          <EfeitosMoverList efeitos={efeitos} titulo={false} />
        ) : (
          <p>{TEXTO_NAO_MUDA}</p>
        )}
        {avisos.map((aviso) => (
          <p key={aviso} className="mt-1 text-gray-800 dark:text-white/90">
            {aviso}
          </p>
        ))}
      </div>
    </BottomSheet>
  );
}

function SheetGrupo({
  alvo,
  onFechar,
  onUsar,
}: Props & { alvo: Extract<AlvoSheet, { tipo: 'grupo' }> }) {
  const opcoes = opcoesDoLote(intersecaoDestinos(alvo.itens.map((i) => i.opcoes)));
  const [valor, setValor] = useState<string | null>(null);
  const escolhida = opcoes.find((o) => o.valor === valor);
  const n = alvo.itens.length;
  const titulo = `Onde os ${n} de ${alvo.rotulo} vão ficar`;

  return (
    <BottomSheet
      isOpen
      onClose={onFechar}
      title={titulo}
      className="font-outfit"
      footer={
        <div className="flex gap-2">
          <SecondaryButton onClick={onFechar}>Voltar</SecondaryButton>
          {opcoes.length > 0 && (
            <PrimaryButton
              disabled={!escolhida}
              onClick={() => escolhida && onUsar(escolhida.escolha)}
            >
              {`Usar para os ${n}`}
            </PrimaryButton>
          )}
        </div>
      }
    >
      <p className="-mt-1 mb-3 px-1 text-[13px] text-gray-600 dark:text-gray-300">
        {alvo.itens.map(rotuloItem).join(', ')}
      </p>
      {opcoes.length === 0 ? (
        <p className="px-1 py-3 text-sm text-gray-700 dark:text-gray-200">
          {TEXTO_SEM_DESTINO_COMUM}
        </p>
      ) : (
        <div role="radiogroup" aria-label={titulo} className="pb-3">
          {opcoes.map((o) => {
            const checked = o.valor === valor;
            return (
              <button
                key={o.valor}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => setValor(o.valor)}
                className={twMerge(
                  'grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-mf-outside dark:focus-visible:ring-mf-tranquilidade',
                  checked ? 'bg-mf-tranquilidade/15' : 'active:bg-gray-100 dark:active:bg-white/5',
                )}
              >
                <span className="truncate text-[15px] font-semibold text-gray-800 dark:text-white/90">
                  {o.rotulo}
                </span>
                <span
                  aria-hidden="true"
                  className={twMerge(
                    'h-[22px] w-[22px] rounded-full border-2',
                    checked
                      ? 'border-[7px] border-mf-patrimonio dark:border-mf-tranquilidade'
                      : 'border-gray-300 dark:border-gray-600',
                  )}
                />
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}
