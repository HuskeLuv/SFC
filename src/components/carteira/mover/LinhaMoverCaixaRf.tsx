'use client';
import React, { type ReactNode } from 'react';
import { TABLE_STYLES } from '@/components/ui/table/tableStyles';
import type { CategoriaMovivel, LinhaMovidaCampos } from '@/lib/carteiraMover';
import type { MoverAlvo } from '@/types/carteiraMover';
import {
  CarteiraDndProvider,
  alvoDaLinha,
  secaoDropIdSintetico,
  useCarteiraMover,
} from './CarteiraDnd';
import { DragHandleCell } from './DragHandleCell';
import { LinhaMoverMenu } from './LinhaMoverMenu';
import { MovidoBadge } from './MovidoBadge';
import { LINHA_REALCE_CLASS } from './SecaoDropRow';

/**
 * Mover nas tabelas das abas de Reservas e Renda Fixa (fase 2, out/2026 — Fatia E).
 *
 * As três tabelas são feitas à mão (não usam o GenericAssetTable), então as peças da linha ficam
 * aqui para não repetir em cada uma: alça ⠿ antes do nome, selos ("movido", "saldo em conta",
 * "Movendo…"), coluna final com o menu ⋯ e o botão "Mover" (44px) do cartão no celular.
 *
 * A UI NUNCA olha a chave MOVER_CAIXA_RF_HABILITADO: com ela desligada, as rotas marcam as linhas
 * com `naoMovivelMotivo` → `alvoDaLinha` devolve null → `tabelaTemMover` é false e a tabela fica
 * idêntica à de antes (sem provider, sem coluna extra, sem selos).
 */

/** Campos do mover numa linha das 3 abas (contrato da rota + linha otimista). */
export interface LinhaCaixaRfMover extends LinhaMovidaCampos {
  /**
   * Item das Reservas sem título por trás (saldo informado, conta corrente, poupança — sem
   * FixedIncomeAsset e sem Tesouro): selo tracejado "saldo em conta". Só com a chave ligada.
   */
  saldoEmConta?: boolean;
  /** Linha otimista do useMoverInvestimento (mutação em andamento). */
  _pendente?: boolean;
}

const camposDe = (linha: unknown) => (linha ?? {}) as LinhaCaixaRfMover;

/** Alguma linha da aba pode ser movida? (chave desligada → nenhuma). */
export const tabelaTemMover = (categoria: CategoriaMovivel, linhas: readonly unknown[]): boolean =>
  linhas.some((l) => alvoDaLinha(categoria, l) !== null);

/**
 * `CarteiraDndProvider` só quando a aba tem mover (`ativo`); senão devolve os filhos como estão
 * (DOM igual ao de antes). `dnd={false}` no celular: sem arrastar, só o botão "Mover".
 */
export function ProviderSeMover({
  categoria,
  ativo,
  dnd = true,
  children,
}: {
  categoria: CategoriaMovivel;
  ativo: boolean;
  dnd?: boolean;
  children: ReactNode;
}) {
  if (!ativo) return <>{children}</>;
  return (
    <CarteiraDndProvider categoria={categoria} dnd={dnd}>
      {children}
    </CarteiraDndProvider>
  );
}

/**
 * Selo "saldo em conta" (protótipo): contorno tracejado neutro, sem preenchimento — não é um
 * título, é um saldo informado. Texto cinza 600/300 (AA nos dois temas).
 */
export function SaldoEmContaBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Saldo informado, sem um título de renda fixa por trás. Troca só entre as Reservas."
      data-mf-saldo-conta=""
      className={`inline-flex items-center rounded-full border border-dashed border-gray-400 px-[7px] py-px text-[11px] leading-4 font-medium whitespace-nowrap text-gray-600 dark:border-gray-500 dark:text-gray-300 ${className}`}
    >
      saldo em conta
    </span>
  );
}

function MovendoLabel() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <span
        aria-hidden
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
      />
      Movendo…
    </span>
  );
}

export interface EstadoLinhaMover {
  alvo: MoverAlvo | null;
  pendente: boolean;
  /** Classes extras do <tr> (grupo da alça, arrasto a 35%, pendente a 60%, realce de chegada). */
  rowClass: string;
}

/**
 * Estado de uma linha. Fora do provider (chave desligada) devolve alvo null e nenhuma classe —
 * a linha fica exatamente como antes.
 */
export function useEstadoLinhaMover(categoria: CategoriaMovivel, linha: unknown): EstadoLinhaMover {
  const ctx = useCarteiraMover();
  if (!ctx) return { alvo: null, pendente: false, rowClass: '' };
  const alvo = alvoDaLinha(categoria, linha);
  const pendente = !!alvo && (!!camposDe(linha)._pendente || ctx.pendingId === alvo.id);
  const arrastando = !!alvo && ctx.ativo?.alvo.id === alvo.id;
  const chegou = !!alvo && ctx.realceId === alvo.id;
  const rowClass = ` group/linha${arrastando ? ' opacity-35' : pendente ? ' opacity-60' : ''}${
    chegou ? ` ${LINHA_REALCE_CLASS}` : ''
  }`;
  return { alvo, pendente, rowClass };
}

/**
 * Conteúdo da 1ª coluna com a alça antes do nome e os selos depois (mesmo arranjo do
 * GenericAssetTable da fase 1). As faixas da RF não são alvo de soltar: a alça parte de um id de
 * seção sintético (o teclado começa direto pela bandeja "Outra aba").
 */
export function NomeComMover({
  categoria,
  linha,
  estado,
  secaoLabel,
  children,
}: {
  categoria: CategoriaMovivel;
  linha: unknown;
  estado: EstadoLinhaMover;
  /** Onde a linha está (anúncios do leitor de tela): seção da RF ou o nome da Reserva. */
  secaoLabel: string;
  children: ReactNode;
}) {
  const ctx = useCarteiraMover();
  if (!ctx) return <>{children}</>;
  const info = camposDe(linha);
  const { alvo, pendente } = estado;
  return (
    <div className="flex items-center gap-1.5">
      {alvo && ctx.dnd ? (
        <DragHandleCell
          alvo={alvo}
          secaoDropId={secaoDropIdSintetico(categoria)}
          secaoLabel={secaoLabel}
          disabled={pendente}
        />
      ) : (
        <span className="inline-block w-6 shrink-0" aria-hidden />
      )}
      <div className="min-w-0">{children}</div>
      {info.movido ? (
        <MovidoBadge movidoEm={info.movidoEm} viaConsultor={info.movidoViaConsultor} />
      ) : null}
      {info.saldoEmConta ? <SaldoEmContaBadge /> : null}
      {pendente ? <MovendoLabel /> : null}
    </div>
  );
}

/**
 * Célula final (coluna "Ações", 40px) com o menu ⋯ — vazia na linha sem alvo. No item movido,
 * "Voltar para <aba>" vem primeiro (protótipo D9).
 */
export function MenuMoverCell({ linha, estado }: { linha: unknown; estado: EstadoLinhaMover }) {
  const info = camposDe(linha);
  return (
    <td className={`${TABLE_STYLES.compact.td} w-10 text-right`}>
      {estado.alvo ? (
        <LinhaMoverMenu
          alvo={estado.alvo}
          movido={info.movido}
          movidoEm={info.movidoEm}
          movidoViaConsultor={info.movidoViaConsultor}
          disabled={estado.pendente}
          voltarPrimeiro
        />
      ) : null}
    </td>
  );
}

/** Selos do cartão do celular ("movido", "saldo em conta"); null fora do provider. */
export function SelosCartaoMover({ linha }: { linha: unknown }) {
  const ctx = useCarteiraMover();
  if (!ctx) return null;
  const info = camposDe(linha);
  if (!info.movido && !info.saldoEmConta) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {info.movido ? (
        <MovidoBadge movidoEm={info.movidoEm} viaConsultor={info.movidoViaConsultor} />
      ) : null}
      {info.saldoEmConta ? <SaldoEmContaBadge /> : null}
    </span>
  );
}

/**
 * Celular: botão "Mover" (44px) no rodapé do cartão aberto, ao lado da ação que já existia
 * (mesmo visual do `renderMoverButton` do AssetCardSections). Sem provider ou sem alvo, devolve
 * só a ação de antes.
 */
export function RodapeCartaoMover({
  categoria,
  linha,
  children,
}: {
  categoria: CategoriaMovivel;
  linha: unknown;
  children: ReactNode;
}) {
  const ctx = useCarteiraMover();
  const alvo = ctx ? alvoDaLinha(categoria, linha) : null;
  if (!ctx || !alvo) return <>{children}</>;
  const pendente = ctx.pendingId === alvo.id || !!camposDe(linha)._pendente;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {children}
      <button
        type="button"
        onClick={() => ctx.abrirMover(alvo)}
        disabled={pendente}
        aria-label={`Mover ${alvo.label}`}
        data-mover-card={alvo.id}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-mf-patrimonio focus-visible:ring-[3px] focus-visible:ring-[#0079F2] focus-visible:outline-none disabled:opacity-45 dark:border-gray-700 dark:bg-gray-900 dark:text-mf-tranquilidade dark:focus-visible:ring-mf-tranquilidade"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {pendente ? 'Movendo…' : 'Mover'}
      </button>
    </div>
  );
}
