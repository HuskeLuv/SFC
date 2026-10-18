'use client';

/**
 * Linha de ações do cabeçalho do ativo (fatia C1, v2.4): Comparar (só com o recurso Comparador) ·
 * Planejar na carteira (vira "Ajustar plano" quando há alvo — v2.5: o de planning_asset_targets) ·
 * Ver na Carteira · Registrar operação
 * (navy, ÚNICO primário). Cada botão abre o seu modal (ModalAnalise: diálogo no computador,
 * BottomSheet no celular). Sem Índice/semáforo. 44 px; no celular grade 2×2 e "Registrar operação"
 * na largura toda.
 *
 * Também aqui: o AddAssetWizard com preset (link "abrir o formulário completo" do Registrar) e os
 * estilos de botão que a página do ativo reusa (re-exportados por AcoesCarteiraAtivo).
 * Consultor agindo pelo cliente: Ver, Planejar e Registrar continuam, com o aviso (rec. 9).
 *
 * Bloco 1 (fatia B), só com recursos.salvos: "Salvar" entre Comparar e Planejar (BotaoSalvarAtivo,
 * regra 0/1/2+ listas) e, com o ativo salvo, a linha "Salvo em…" embaixo (LinhaSalvoEm). Sem o
 * recurso, o DOM é o de antes.
 */
import { Suspense, lazy, useCallback, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import BotaoSalvarAtivo, {
  useSalvarAtivo,
} from '@/components/analiseAtivos/ativo/acoes/BotaoSalvarAtivo';
import LinhaSalvoEm from '@/components/analiseAtivos/ativo/acoes/LinhaSalvoEm';
import ModalComparar from '@/components/analiseAtivos/ativo/acoes/ModalComparar';
import ModalPlanejar from '@/components/analiseAtivos/ativo/acoes/ModalPlanejar';
import ModalRegistrarOperacao from '@/components/analiseAtivos/ativo/acoes/ModalRegistrarOperacao';
import ModalVerNaCarteira from '@/components/analiseAtivos/ativo/acoes/ModalVerNaCarteira';
import SeloEstado from '@/components/analiseAtivos/comum/SeloEstado';
import { useAnaliseAtivosConfig, useOverlayCarteira } from '@/hooks/useAnaliseAtivos';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import { rotuloCategoria } from '@/lib/carteiraMover';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import {
  CLASSE_CARTEIRA,
  TEXTOS_ACOES_CARTEIRA,
} from '@/services/analiseAtivos/textosAcoesCarteira';
import { formatNumber } from '@/utils/format';
import type { AddAssetWizardPreset } from '@/components/carteira/AddAssetWizard';
import type { BarraAcoesAtivoProps, ModalAcaoAtivo } from '@/types/analiseAtivosCriterios';
import type {
  AcoesCarteiraAtivoProps,
  ClasseQuadro,
  OverlayCarteiraResposta,
} from '@/types/analiseAtivosApi';

export type { BarraAcoesAtivoProps };

const AddAssetWizard = lazy(() => import('@/components/carteira/AddAssetWizard'));

const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';
const FORMA_BOTAO =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg transition-colors sm:w-auto lg:min-h-11';
const BASE_BOTAO = `${FORMA_BOTAO} px-4 text-sm font-medium whitespace-nowrap`;
export const BOTAO_PRIMARIO = `${BASE_BOTAO} bg-[#314666] text-white hover:bg-[#396CAA] dark:bg-[#396CAA] dark:hover:bg-[#6E9DC4] dark:hover:text-gray-900`;
export const BOTAO_SECUNDARIO = `${BASE_BOTAO} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-white/90 dark:hover:bg-white/5`;
/**
 * Botões de ação da linha (Comparar, Planejar, Ver): 44 px, 14 px semibold, contorno #CCCCCC e
 * texto seguranca, ícone patrimonio (HTML do Pedro: `.btn`). Só o Registrar usa o fundo navy.
 * Sem o px-4/text-sm do BASE_BOTAO (no Tailwind v4 o px-4 venceria o px-3): na grade de 2 colunas
 * do celular, 13 px e quebra de linha permitida ('Planejar na carteira' não vaza em 360 px).
 */
const BOTAO_ACAO = `${FORMA_BOTAO} border border-[#CCCCCC] bg-white px-3 text-center text-[13px] leading-tight font-semibold sm:text-sm sm:whitespace-nowrap text-[#314666] shadow-[0_1px_2px_rgba(16,24,40,0.06)] hover:border-[#396CAA] hover:bg-[#EDF2F8] dark:border-gray-600 dark:bg-white/[0.04] dark:text-white/90 dark:hover:border-[#6E9DC4] dark:hover:bg-[#6E9DC4]/15 ${FOCO}`;

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

/** Ícone 16 px; azul (patrimonio/tranquilidade) por padrão, `className` substitui a cor. */
function Icone({
  d,
  className = 'text-[#396CAA] dark:text-[#6E9DC4]',
}: {
  d: ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-4 w-4 flex-none ${className}`}
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
 * Plano do ativo NA CARTEIRA (17/10/2026): posição com Objetivo > 0 ou linha planejada na aba. É o
 * que o "Planejar na carteira" grava — acende o chip "Planejado" e troca o botão por "Ajustar plano".
 */
export function planoNaCarteira(
  overlay: OverlayCarteiraResposta | undefined,
  ticker: string,
): { objetivoPct: number | null; categoria: string } | null {
  const t = ticker.toUpperCase();
  const posicao = overlay?.posicoes[t] ?? null;
  if (posicao) {
    const o = posicao.objetivoPct ?? null;
    return o !== null && o > 0 ? { objetivoPct: o, categoria: posicao.categoria } : null;
  }
  const planejado = overlay?.planejados[t] ?? null;
  if (!planejado) return null;
  const o = planejado.objetivoPct;
  return { objetivoPct: o !== null && o > 0 ? o : null, categoria: planejado.categoria };
}

/**
 * Chips de estado do cabeçalho (overlay da Carteira): "Na carteira" (há posição) e "Planejado" (há
 * plano na Carteira — Objetivo > 0 da posição ou linha planejada; planoNaCarteira). Os dois podem
 * aparecer juntos.
 */
export function ChipsCarteira({ ticker, classe }: { ticker: string; classe: ClasseQuadro }) {
  const overlay = useOverlayCarteira();
  const t = ticker.toUpperCase();
  const tx = TEXTOS_ACOES_CARTEIRA.barra;
  const cl = CLASSE_CARTEIRA[classe];
  const posicao = overlay.data?.posicoes[t] ?? null;
  const plano = planoNaCarteira(overlay.data, t);
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
      {plano ? (
        <span
          title={formatarTexto(
            plano.objetivoPct !== null ? tx.chipPlanejadoTitulo : tx.chipPlanejadoSemObjetivoTitulo,
            {
              pct: `${formatNumber(plano.objetivoPct ?? 0, 1)}%`,
              aba: rotuloCategoria(plano.categoria as Parameters<typeof rotuloCategoria>[0]),
            },
          )}
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
  // Bloco 1: Salvar (sem recursos.salvos, salvar.ligado = false e nada aparece)
  const salvar = useSalvarAtivo({ ticker: t, classe, detalhes: true });
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
  // "Ajustar plano" quando já há plano na Carteira (Objetivo > 0 da posição ou linha planejada)
  const temAlvo = !!planoNaCarteira(overlay.data, t);

  const base = { ticker: t, classe, nome, onFechar: fechar };

  const grupo = (
    <div
      role="group"
      aria-label={formatarTexto(tx.rotulo, { ticker: t })}
      data-acoes-carteira={posicao ? 'posicao' : planejado || temAlvo ? 'planejado' : 'nada'}
      className={`grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end ${className}`}
    >
      {comparador ? (
        <button
          type="button"
          className={BOTAO_ACAO}
          onClick={() => setModal('comparar')}
          aria-label={formatarTexto(tx.compararAria, { ticker: t })}
          data-botao-comparar=""
        >
          <Icone d={<path d="M4 5h6v14H4zM14 5h6v14h-6z" />} />
          {tx.comparar}
        </button>
      ) : null}
      {salvar.ligado ? <BotaoSalvarAtivo controle={salvar} /> : null}
      <button
        type="button"
        className={BOTAO_ACAO}
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
        className={BOTAO_ACAO}
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
        className={`${BOTAO_PRIMARIO} col-span-2 font-semibold shadow-[0_6px_16px_-6px_rgba(49,70,102,0.55)] ${FOCO}`}
        onClick={() => setModal('registrar')}
        data-botao-registrar=""
      >
        <Icone d={<path d="M12 5v14M5 12h14" />} className="text-current" />
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
      {salvar.camadas}
    </div>
  );

  if (!salvar.ligado) return grupo;
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:items-end">
      {grupo}
      <LinhaSalvoEm controle={salvar} />
    </div>
  );
}
