'use client';

/**
 * Linha de ações do cabeçalho do ativo (fatia C1, v2.4): Comparar (só com o recurso Comparador) ·
 * Planejar na carteira (vira "Ajustar plano" quando há alvo) · Ver na Carteira · Registrar operação
 * (navy, ÚNICO primário). Cada botão abre o seu modal (ModalAnalise: diálogo no computador,
 * BottomSheet no celular). Sem Índice/semáforo. 44 px; no celular grade 2×2 e "Registrar operação"
 * na largura toda.
 *
 * Também aqui: o AddAssetWizard com preset (link "abrir o formulário completo" do Registrar) e os
 * estilos de botão que a página do ativo reusa (re-exportados por AcoesCarteiraAtivo).
 * Consultor agindo pelo cliente: Ver, Planejar e Registrar continuam, com o aviso (rec. 9).
 */
import { Suspense, lazy, useCallback, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalComparar from '@/components/analiseAtivos/ativo/acoes/ModalComparar';
import ModalPlanejar from '@/components/analiseAtivos/ativo/acoes/ModalPlanejar';
import ModalRegistrarOperacao from '@/components/analiseAtivos/ativo/acoes/ModalRegistrarOperacao';
import ModalVerNaCarteira from '@/components/analiseAtivos/ativo/acoes/ModalVerNaCarteira';
import SeloEstado from '@/components/analiseAtivos/comum/SeloEstado';
import { useAnaliseAtivosConfig, useOverlayCarteira } from '@/hooks/useAnaliseAtivos';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import {
  CLASSE_CARTEIRA,
  TEXTOS_ACOES_CARTEIRA,
} from '@/services/analiseAtivos/textosAcoesCarteira';
import { formatNumber } from '@/utils/format';
import type { AddAssetWizardPreset } from '@/components/carteira/AddAssetWizard';
import type { BarraAcoesAtivoProps, ModalAcaoAtivo } from '@/types/analiseAtivosCriterios';
import type { AcoesCarteiraAtivoProps, ClasseQuadro } from '@/types/analiseAtivosApi';

export type { BarraAcoesAtivoProps };

const AddAssetWizard = lazy(() => import('@/components/carteira/AddAssetWizard'));

const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';
const BASE_BOTAO =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium whitespace-nowrap transition-colors sm:w-auto lg:min-h-11';
export const BOTAO_PRIMARIO = `${BASE_BOTAO} bg-[#314666] text-white hover:bg-[#396CAA] dark:bg-[#396CAA] dark:hover:bg-[#6E9DC4] dark:hover:text-gray-900`;
export const BOTAO_SECUNDARIO = `${BASE_BOTAO} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-white/90 dark:hover:bg-white/5`;
/** Botões pequenos da linha (Comparar, Planejar, Ver): 44 px, 13 px de texto. */
const BOTAO_PEQUENO = `${BOTAO_SECUNDARIO} px-3 text-[13px] ${FOCO}`;

export type OperacaoWizard = AddAssetWizardPreset['operacao'];

/**
 * Abre o AddAssetWizard com o ativo já escolhido (o mesmo fluxo da Carteira). O wizard só é
 * carregado no 1º clique; sucesso → invalidatePortfolioDerivedQueries.
 */
export function useWizardCarteiraAtivo({
  ticker,
  classe,
  nome,
  assetId,
}: AcoesCarteiraAtivoProps): { abrir: (operacao: OperacaoWizard) => void; wizard: ReactNode } {
  const qc = useQueryClient();
  const [preset, setPreset] = useState<AddAssetWizardPreset | null>(null);
  const [aberto, setAberto] = useState(false);

  const abrir = useCallback(
    (operacao: OperacaoWizard) => {
      setPreset({
        operacao,
        tipoAtivo: classe === 'fii' ? 'fii' : 'acoes-brasil',
        ativo: assetId ? `${ticker} - ${nome}` : ticker,
        assetId,
        ...(classe === 'acao' ? { acoesBrasilTipo: 'acao' as const } : {}),
      });
      setAberto(true);
    },
    [ticker, classe, nome, assetId],
  );

  const wizard = preset ? (
    <Suspense fallback={null}>
      <AddAssetWizard
        isOpen={aberto}
        preset={preset}
        onClose={() => setAberto(false)}
        onSuccess={() => invalidatePortfolioDerivedQueries(qc)}
      />
    </Suspense>
  ) : null;

  return { abrir, wizard };
}

function Icone({ d }: { d: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d}
    </svg>
  );
}

/**
 * Chips de estado do cabeçalho (overlay da Carteira): "Na carteira" (há posição) e "Planejado" (há
 * alvo: Objetivo da posição > 0 ou ativo planejado sem posição). Os dois podem aparecer juntos.
 */
export function ChipsCarteira({ ticker, classe }: { ticker: string; classe: ClasseQuadro }) {
  const overlay = useOverlayCarteira();
  const t = ticker.toUpperCase();
  const tx = TEXTOS_ACOES_CARTEIRA.barra;
  const cl = CLASSE_CARTEIRA[classe];
  const posicao = overlay.data?.posicoes[t] ?? null;
  const planejado = posicao ? null : (overlay.data?.planejados[t] ?? null);
  const alvo = posicao
    ? (posicao.objetivoPct ?? null)
    : planejado
      ? (planejado.objetivoPct ?? 0)
      : null;
  return (
    <>
      {posicao ? (
        <span
          title={formatarTexto(tx.chipNaCarteiraTitulo, {
            qtd: posicao.quantidade.toLocaleString('pt-BR'),
            un: cl.un,
          })}
        >
          <SeloEstado tipo="na_carteira" texto={tx.chipNaCarteira} />
        </span>
      ) : null}
      {alvo !== null ? (
        <span
          title={formatarTexto(tx.chipPlanejadoTitulo, {
            pct: `${formatNumber(alvo, 1)}%`,
            aba: cl.aba,
          })}
        >
          <SeloEstado tipo="planejado" texto={tx.chipPlanejado} />
        </span>
      ) : null}
    </>
  );
}

export default function BarraAcoesAtivo({
  ticker,
  classe,
  nome,
  assetId,
  preco,
  fiiTipo,
  className = '',
}: BarraAcoesAtivoProps) {
  const t = ticker.toUpperCase();
  const tx = TEXTOS_ACOES_CARTEIRA.barra;
  const overlay = useOverlayCarteira();
  // Comparar só com o recurso Comparador (Bloco D) — mesma regra do useComparadorLigado.
  const config = useAnaliseAtivosConfig();
  const comparador =
    config.data?.recursos?.comparador === true && (classe === 'acao' || classe === 'fii');
  const [modal, setModal] = useState<ModalAcaoAtivo | null>(null);
  const { abrir: abrirWizard, wizard } = useWizardCarteiraAtivo({
    ticker: t,
    classe,
    nome,
    assetId,
  });
  const fechar = useCallback(() => setModal(null), []);
  const celular = useIsBelowLg();
  /**
   * Fecha o modal atual e só então segue (abre outro modal ou o wizard). No celular o painel tem
   * uma entrada no histórico: o próximo passo espera o "voltar" dela terminar (popstate), senão o
   * pushState do próximo painel seria desfeito por ele.
   */
  const trocar = useCallback(
    (seguir: () => void) => {
      setModal(null);
      if (celular && typeof window !== 'undefined') {
        window.addEventListener('popstate', () => seguir(), { once: true });
      } else {
        seguir();
      }
    },
    [celular],
  );

  const posicao = overlay.data?.posicoes[t] ?? null;
  const planejado = posicao ? null : (overlay.data?.planejados[t] ?? null);
  const temAlvo =
    (posicao?.objetivoPct ?? null) !== null ||
    (planejado ? (planejado.objetivoPct ?? 0) > 0 : false);

  const base = { ticker: t, classe, nome, onFechar: fechar };

  return (
    <div
      role="group"
      aria-label={formatarTexto(tx.rotulo, { ticker: t })}
      data-acoes-carteira={posicao ? 'posicao' : planejado ? 'planejado' : 'nada'}
      className={`grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end ${className}`}
    >
      {comparador ? (
        <button
          type="button"
          className={BOTAO_PEQUENO}
          onClick={() => setModal('comparar')}
          aria-label={formatarTexto(tx.compararAria, { ticker: t })}
          data-botao-comparar=""
        >
          <Icone d={<path d="M4 5h6v14H4zM14 5h6v14h-6z" />} />
          {tx.comparar}
        </button>
      ) : null}
      <button
        type="button"
        className={BOTAO_PEQUENO}
        onClick={() => setModal('planejar')}
        data-botao-planejar=""
      >
        <Icone
          d={
            <>
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="3" />
            </>
          }
        />
        {temAlvo ? tx.ajustarPlano : tx.planejar}
      </button>
      <button
        type="button"
        className={BOTAO_PEQUENO}
        onClick={() => setModal('verNaCarteira')}
        data-botao-ver=""
      >
        <Icone
          d={
            <>
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="M3 10h18" />
            </>
          }
        />
        {tx.verNaCarteira}
      </button>
      <button
        type="button"
        className={`${BOTAO_PRIMARIO} col-span-2 ${FOCO}`}
        onClick={() => setModal('registrar')}
        data-botao-registrar=""
      >
        <Icone d={<path d="M12 5v14M5 12h14" />} />
        {tx.registrar}
      </button>

      {comparador ? <ModalComparar {...base} aberto={modal === 'comparar'} /> : null}
      <ModalPlanejar {...base} aberto={modal === 'planejar'} assetId={assetId} preco={preco} />
      <ModalVerNaCarteira
        {...base}
        aberto={modal === 'verNaCarteira'}
        assetId={assetId}
        onRegistrar={() => trocar(() => setModal('registrar'))}
      />
      <ModalRegistrarOperacao
        {...base}
        aberto={modal === 'registrar'}
        assetId={assetId}
        preco={preco}
        fiiTipo={fiiTipo}
        onFormularioCompleto={() => trocar(() => abrirWizard('compra'))}
      />
      {wizard}
    </div>
  );
}
