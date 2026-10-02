'use client';

/**
 * Ações da Carteira na página do ativo (fatia D, decisão 9). Nunca "Comprar".
 * - Sem posição: "Planejar na Carteira" (primário) + "Registrar operação".
 * - Planejado: "Registrar operação" (primário) + "Ver na Carteira".
 * - Com posição: "Registrar operação" + "Ver na Carteira" (/ativos/{portfolioId}).
 * - Consultor agindo pelo cliente: aviso de que posição e alvo são do cliente e a tese não aparece.
 * Os dois botões abrem o AddAssetWizard existente com preset (o mesmo fluxo da Carteira);
 * sucesso → invalidatePortfolioDerivedQueries (cobre abas, resumo e o overlay da área).
 * Celular: botões em largura total, 48px.
 */
import Link from 'next/link';
import { Suspense, lazy, useCallback, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useOverlayCarteira } from '@/hooks/useAnaliseAtivos';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { AddAssetWizardPreset } from '@/components/carteira/AddAssetWizard';
import type { AcoesCarteiraAtivoProps } from '@/types/analiseAtivosApi';

export type { AcoesCarteiraAtivoProps };

const AddAssetWizard = lazy(() => import('@/components/carteira/AddAssetWizard'));

const BASE_BOTAO =
  'inline-flex min-h-12 w-full items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors sm:w-auto lg:min-h-11';
export const BOTAO_PRIMARIO = `${BASE_BOTAO} bg-[#314666] text-white hover:bg-[#396CAA] dark:bg-[#396CAA] dark:hover:bg-[#6E9DC4] dark:hover:text-gray-900`;
export const BOTAO_SECUNDARIO = `${BASE_BOTAO} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-white/90 dark:hover:bg-white/5`;

export type OperacaoWizard = AddAssetWizardPreset['operacao'];

/**
 * Abre o AddAssetWizard com o ativo já escolhido. O wizard só é carregado no 1º clique.
 * Usado aqui e no bloco "Na sua carteira" (estado "Você não tem").
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

export default function AcoesCarteiraAtivo(props: AcoesCarteiraAtivoProps) {
  const ticker = props.ticker.toUpperCase();
  const { actingClient } = useAuth();
  const overlay = useOverlayCarteira();
  const { abrir, wizard } = useWizardCarteiraAtivo(props);
  const t = TEXTOS_TELA.acoes;

  if (actingClient) {
    return (
      <p
        data-acoes-carteira="agindo"
        className="max-w-md rounded-lg bg-gray-100 px-3 py-2 text-[13px] text-gray-700 dark:bg-white/5 dark:text-gray-300"
      >
        {TEXTOS_TELA.naCarteira.agindo}
      </p>
    );
  }

  if (overlay.isPending) {
    return (
      <div aria-hidden="true" className="flex w-full gap-2 sm:w-auto">
        <span className="h-12 w-full animate-pulse rounded-lg bg-gray-100 motion-reduce:animate-none sm:w-40 lg:h-11 dark:bg-white/5" />
      </div>
    );
  }

  const posicao = overlay.data?.posicoes[ticker] ?? null;
  const planejado = posicao ? null : (overlay.data?.planejados[ticker] ?? null);

  let botoes: ReactNode;
  if (posicao) {
    botoes = (
      <>
        <button type="button" className={BOTAO_SECUNDARIO} onClick={() => abrir('compra')}>
          {t.registrar}
        </button>
        <Link
          href={`/ativos/${encodeURIComponent(posicao.portfolioId)}`}
          className={BOTAO_SECUNDARIO}
        >
          {t.verNaCarteira}
        </Link>
      </>
    );
  } else if (planejado) {
    botoes = (
      <>
        <button type="button" className={BOTAO_PRIMARIO} onClick={() => abrir('compra')}>
          {t.registrar}
        </button>
        <Link href="/carteira" className={BOTAO_SECUNDARIO}>
          {t.verNaCarteira}
        </Link>
      </>
    );
  } else {
    botoes = (
      <>
        <button type="button" className={BOTAO_PRIMARIO} onClick={() => abrir('planejar')}>
          {t.planejar}
        </button>
        <button type="button" className={BOTAO_SECUNDARIO} onClick={() => abrir('compra')}>
          {t.registrar}
        </button>
      </>
    );
  }

  return (
    <div
      data-acoes-carteira={posicao ? 'posicao' : planejado ? 'planejado' : 'nada'}
      className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end"
    >
      {botoes}
      {wizard}
    </div>
  );
}
