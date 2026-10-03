'use client';

/**
 * Página do ativo (dono: 0a; os blocos são das fatias B, C e D). Ordem do protótipo revisado:
 *  1. CabecalhoAtivo (slot AcoesCarteiraAtivo)   2. BlocoIndiceSemaforo
 *  3. BlocoNaCarteira + BlocoKpis                4. GraficoLucroCotacao + BlocoDividendos
 *  5. BlocoFundamentosEssencial (preguiçoso)     6. BlocoValuationMultiplos (preguiçoso)
 *  7. BlocoMultiplosHistoricos + BlocoPares (preguiçosos)
 *  8. BlocoEventos + CardEducacao                9. BlocoTese   10. SeloFrescor
 * O rodapé legal (11) vem da AnaliseAtivosShell.
 *
 * Bloco C (fatia B): ConferenciaPaginaProvider leva aos blocos as conferências do topo (chip "em
 * conferência" + "Por quê?"), o frescor por bloco (selo no rodapé de cada card) e
 * config.reporteHabilitado (menu ⋯). Com params v1 e a flag desligada nada disso aparece.
 */
import Link from 'next/link';
import BlocoFundamentosEssencial from '@/components/analiseAtivos/ativo/analise/BlocoFundamentosEssencial';
import BlocoMultiplosHistoricos from '@/components/analiseAtivos/ativo/analise/BlocoMultiplosHistoricos';
import BlocoPares from '@/components/analiseAtivos/ativo/analise/BlocoPares';
import BlocoValuationMultiplos from '@/components/analiseAtivos/ativo/analise/BlocoValuationMultiplos';
import BlocoDividendos from '@/components/analiseAtivos/ativo/topo/BlocoDividendos';
import BlocoEventos from '@/components/analiseAtivos/ativo/topo/BlocoEventos';
import BlocoIndiceSemaforo from '@/components/analiseAtivos/ativo/topo/BlocoIndiceSemaforo';
import BlocoKpis from '@/components/analiseAtivos/ativo/topo/BlocoKpis';
import CabecalhoAtivo from '@/components/analiseAtivos/ativo/topo/CabecalhoAtivo';
import CardEducacao from '@/components/analiseAtivos/ativo/topo/CardEducacao';
import GraficoLucroCotacao from '@/components/analiseAtivos/ativo/topo/GraficoLucroCotacao';
import SeloFrescor from '@/components/analiseAtivos/ativo/topo/SeloFrescor';
import AcoesCarteiraAtivo from '@/components/analiseAtivos/ativo/usuario/AcoesCarteiraAtivo';
import BlocoNaCarteira from '@/components/analiseAtivos/ativo/usuario/BlocoNaCarteira';
import BlocoTese from '@/components/analiseAtivos/ativo/usuario/BlocoTese';
import SeloEstado from '@/components/analiseAtivos/comum/SeloEstado';
import { ConferenciaPaginaProvider } from '@/components/analiseAtivos/comum/PorQueConferencia';
import SecaoPreguicosa from '@/components/analiseAtivos/shell/SecaoPreguicosa';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import {
  ErroAnalise,
  useAnaliseAtivosConfig,
  useAtivoTopo,
  useOverlayCarteira,
} from '@/hooks/useAnaliseAtivos';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { PaginaAtivoProps } from '@/types/analiseAtivosApi';

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]';

export default function PaginaAtivo({ ticker }: PaginaAtivoProps) {
  const topo = useAtivoTopo(ticker);
  const overlay = useOverlayCarteira();
  const config = useAnaliseAtivosConfig();
  const t = TEXTOS_TELA.ativo;

  if (topo.isPending) {
    return (
      <div aria-busy="true" aria-label={t.carregando} className="flex flex-col gap-4">
        <div className={`${CARD} h-24 animate-pulse motion-reduce:animate-none`} />
        <div className={`${CARD} h-64 animate-pulse motion-reduce:animate-none`} />
      </div>
    );
  }

  if (topo.isError) {
    const naoEncontrado = topo.error instanceof ErroAnalise && topo.error.status === 404;
    return (
      <section className={`${CARD} flex flex-col gap-3`} role={naoEncontrado ? undefined : 'alert'}>
        <h1 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {naoEncontrado ? t.naoEncontrado : t.erro}
        </h1>
        {naoEncontrado ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">{t.naoEncontradoTexto}</p>
        ) : (
          <button
            type="button"
            onClick={() => void topo.refetch()}
            className="inline-flex min-h-11 items-center self-start rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200"
          >
            {t.tentarNovamente}
          </button>
        )}
        <Link
          href="/analise-ativos"
          className={`inline-flex min-h-11 items-center text-sm ${COR_LINK.classes}`}
        >
          {TEXTOS_TELA.area.voltarQuadro}
        </Link>
      </section>
    );
  }

  const ativo = topo.data;
  const { classe } = ativo;
  const posicao = overlay.data?.posicoes[ticker];
  const planejado = overlay.data?.planejados[ticker];
  const seloCarteira = posicao ? (
    <SeloEstado tipo="na_carteira" />
  ) : planejado ? (
    <SeloEstado tipo="planejado" />
  ) : null;
  const base = { ticker, classe };
  const contexto = {
    ticker,
    classe,
    versao: ativo.versao,
    reporteHabilitado: config.data?.reporteHabilitado === true,
    conferencias: ativo.conferencias ?? [],
    frescorBlocos: ativo.frescorBlocos ?? null,
  };

  return (
    <ConferenciaPaginaProvider valor={contexto}>
      <div className="flex min-w-0 flex-col gap-4 md:gap-6" data-pagina-ativo={ticker}>
        <CabecalhoAtivo
          ativo={ativo}
          seloCarteira={seloCarteira}
          slotAcoes={<AcoesCarteiraAtivo {...base} nome={ativo.nome} assetId={ativo.assetId} />}
        />
        <BlocoIndiceSemaforo {...base} indice={ativo.indice} semaforo={ativo.semaforo} />
        <div className="grid min-w-0 gap-4 md:gap-6 xl:grid-cols-2">
          <BlocoNaCarteira
            {...base}
            nome={ativo.nome}
            assetId={ativo.assetId}
            precoCabecalho={ativo.cotacao.preco}
            precoData={ativo.cotacao.data}
          />
          <BlocoKpis classe={classe} kpis={ativo.kpis} />
        </div>
        <div className="grid min-w-0 gap-4 md:gap-6 xl:grid-cols-2">
          <GraficoLucroCotacao {...base} grafico={ativo.grafico} />
          <BlocoDividendos classe={classe} dividendos={ativo.dividendos} />
        </div>
        <SecaoPreguicosa rotulo={TEXTOS_TELA.blocos.fundamentos}>
          <BlocoFundamentosEssencial {...base} />
        </SecaoPreguicosa>
        <SecaoPreguicosa rotulo={TEXTOS_TELA.blocos.valuation}>
          <BlocoValuationMultiplos {...base} />
        </SecaoPreguicosa>
        <SecaoPreguicosa rotulo={TEXTOS_TELA.blocos.historicos}>
          {/* Pares em largura total: as 8 colunas não cabem em meia linha (1440 cortava 4) */}
          <div className="grid min-w-0 gap-4 md:gap-6">
            <BlocoMultiplosHistoricos {...base} />
            <BlocoPares {...base} />
          </div>
        </SecaoPreguicosa>
        <div className="grid min-w-0 gap-4 md:gap-6 xl:grid-cols-2">
          <BlocoEventos classe={classe} eventos={ativo.eventos} />
          <CardEducacao educacao={ativo.educacao} />
        </div>
        <BlocoTese ticker={ticker} />
        <SeloFrescor frescor={ativo.frescor} />
      </div>
    </ConferenciaPaginaProvider>
  );
}
