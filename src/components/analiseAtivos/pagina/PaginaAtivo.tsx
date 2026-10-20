'use client';

/**
 * Página do ativo (dono: 0a; os blocos são das fatias B, C e D). v2.4 (fatia C2) — ordem do HTML
 * do Pedro (D1), sem Índice MF nem semáforo:
 *  1. CabecalhoAtivo (slot AcoesCarteiraAtivo)   2. CardCriterios (3 janelas, sem nova requisição)
 *  3. BlocoNaCarteira + BlocoKpis                4. GraficoLucroCotacao + BlocoDividendos
 *  5. BlocoFundamentos (Essencial | Raio-X, preguiçoso)
 *  6. BlocoValuation (Múltiplos | Meus cenários, preguiçoso)
 *  7. BlocoMultiplosHistoricos (1/3) ao lado de BlocoPares (2/3) a partir de xl; abaixo, empilhados
 *     (preguiçosos)
 *  8. BlocoTese (privada) ao lado de BlocoEventos + CardEducacao (card do módulo da Educação)
 *  9. SeloFrescor
 * O rodapé legal vem da AnaliseAtivosShell. A avaliação dos usuários fica fora (D5).
 *
 * Bloco C (fatia B): ConferenciaPaginaProvider leva aos blocos as conferências do topo (chip "em
 * conferência" + "Por quê?"), o frescor por bloco (selo no rodapé de cada card) e
 * config.reporteHabilitado (menu ⋯). Com params v1 e a flag desligada nada disso aparece.
 *
 * Stocks e REITs (fatia C, AtivoTopoResposta.eua presente): variante SEM cotação — cabeçalho com
 * setor/segmento, bolsa e FY (sem índice) e "Cotação não exibida"; card de critérios com o link dos
 * 10-K na SEC; KPIs do último FY; gráfico 'LPA por ano' (stock) ou 'Caixa operacional por ação por
 * ano' (REIT) no lugar do gráfico lucro × cotação; Essencial EUA; Valuation só com a nota (Múltiplos
 * e Meus cenários ocultos). Sem pares/múltiplos históricos, eventos e tese nesta versão (dependem
 * da cotação ou da B3).
 *
 * A6 (fundamentei-trazer, fatia 0 — slots; os blocos são das fatias A, C e D). Desligadas as chaves,
 * a página é idêntica à de hoje:
 *  4b. BlocoRetornosCotacao (largura total) — só quando o topo traz `retornos` (C)
 *  5b. 'Imóveis e composição do fundo' (BlocoImoveisFii, preguiçoso) — só FII e recursos.imoveisFii,
 *      entre Fundamentos e Valuation (A)
 *  7b. 'Dados societários e estatuto' (BlocoSocietario, preguiçoso) — só ação e recursos.societario,
 *      depois de Múltiplos históricos + Pares e antes de Tese/Eventos (D)
 */
import Link from 'next/link';
import BlocoFundamentos from '@/components/analiseAtivos/ativo/analise/BlocoFundamentos';
import BlocoMultiplosHistoricos from '@/components/analiseAtivos/ativo/analise/BlocoMultiplosHistoricos';
import BlocoPares from '@/components/analiseAtivos/ativo/analise/BlocoPares';
import BlocoValuation from '@/components/analiseAtivos/ativo/analise/BlocoValuation';
import CardCriterios from '@/components/analiseAtivos/ativo/criterios/CardCriterios';
import BlocoImoveisFii from '@/components/analiseAtivos/ativo/fii/BlocoImoveisFii';
import BlocoSocietario from '@/components/analiseAtivos/ativo/societario/BlocoSocietario';
import BlocoRetornosCotacao from '@/components/analiseAtivos/ativo/topo/BlocoRetornosCotacao';
import BlocoDividendos from '@/components/analiseAtivos/ativo/topo/BlocoDividendos';
import BlocoEventos from '@/components/analiseAtivos/ativo/topo/BlocoEventos';
import BlocoKpis from '@/components/analiseAtivos/ativo/topo/BlocoKpis';
import CabecalhoAtivo from '@/components/analiseAtivos/ativo/topo/CabecalhoAtivo';
import CardEducacao from '@/components/analiseAtivos/ativo/topo/CardEducacao';
import GraficoLucroCotacao from '@/components/analiseAtivos/ativo/topo/GraficoLucroCotacao';
import GraficoPorAcaoEua from '@/components/analiseAtivos/ativo/topo/GraficoPorAcaoEua';
import { TEXTOS_EUA_TELAS } from '@/services/analiseAtivos/textosEuaTelas';
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
import { TEXTOS_IMOVEIS_FII } from '@/services/analiseAtivos/textosImoveisFii';
import { TEXTOS_SOCIETARIO } from '@/services/analiseAtivos/textosSocietario';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { PaginaAtivoProps } from '@/types/analiseAtivosApi';
import { noOverlay } from '@/services/analiseAtivos/carteira/tickerCarteiraEua';

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
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {config.data?.recursos?.eua === true
              ? TEXTOS_EUA_TELAS.ativo.naoEncontradoTexto
              : t.naoEncontradoTexto}
          </p>
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
  const posicao = noOverlay(overlay.data?.posicoes, ticker);
  const planejado = noOverlay(overlay.data?.planejados, ticker);
  const seloCarteira = posicao ? (
    <SeloEstado tipo="na_carteira" />
  ) : planejado ? (
    <SeloEstado tipo="planejado" />
  ) : null;
  const base = { ticker, classe };
  const recursos = config.data?.recursos;
  const contexto = {
    ticker,
    classe,
    versao: ativo.versao,
    reporteHabilitado: config.data?.reporteHabilitado === true,
    conferencias: ativo.conferencias ?? [],
    frescorBlocos: ativo.frescorBlocos ?? null,
  };

  if (ativo.eua) {
    return (
      <ConferenciaPaginaProvider valor={contexto}>
        <div
          className="flex min-w-0 flex-col gap-4 md:gap-6"
          data-pagina-ativo={ticker}
          data-pagina-eua={classe}
        >
          <CabecalhoAtivo
            ativo={ativo}
            seloCarteira={seloCarteira}
            slotAcoes={<AcoesCarteiraAtivo {...base} nome={ativo.nome} assetId={ativo.assetId} />}
          />
          <CardCriterios
            {...base}
            criterios={ativo.criterios ?? null}
            linkDocumentos={ativo.eua.linkDocumentos}
          />
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
            <GraficoPorAcaoEua ticker={ticker} grafico={ativo.grafico} />
            <BlocoDividendos classe={classe} dividendos={ativo.dividendos} />
          </div>
          <SecaoPreguicosa rotulo={TEXTOS_TELA.blocos.fundamentos}>
            <BlocoFundamentos {...base} />
          </SecaoPreguicosa>
          <BlocoValuation {...base} nome={ativo.nome} />
          <CardEducacao educacao={ativo.educacao} classe={classe} />
          <SeloFrescor frescor={ativo.frescor} />
        </div>
      </ConferenciaPaginaProvider>
    );
  }

  return (
    <ConferenciaPaginaProvider valor={contexto}>
      <div className="flex min-w-0 flex-col gap-4 md:gap-6" data-pagina-ativo={ticker}>
        <CabecalhoAtivo
          ativo={ativo}
          seloCarteira={seloCarteira}
          slotAcoes={<AcoesCarteiraAtivo {...base} nome={ativo.nome} assetId={ativo.assetId} />}
        />
        <CardCriterios {...base} criterios={ativo.criterios ?? null} />
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
        {ativo.retornos ? <BlocoRetornosCotacao ticker={ticker} retornos={ativo.retornos} /> : null}
        <SecaoPreguicosa rotulo={TEXTOS_TELA.blocos.fundamentos}>
          <BlocoFundamentos {...base} />
        </SecaoPreguicosa>
        {classe === 'fii' && recursos?.imoveisFii === true ? (
          <SecaoPreguicosa
            rotulo={
              ativo.fiiTipoCvm === 'papel' || ativo.fiiTipoCvm === 'fof'
                ? TEXTOS_IMOVEIS_FII.secao.rotuloSemLista
                : TEXTOS_IMOVEIS_FII.secao.rotuloComLista
            }
          >
            <BlocoImoveisFii ticker={ticker} fiiTipo={ativo.fiiTipoCvm ?? null} />
          </SecaoPreguicosa>
        ) : null}
        <SecaoPreguicosa rotulo={TEXTOS_TELA.blocos.valuation}>
          <BlocoValuation {...base} nome={ativo.nome} />
        </SecaoPreguicosa>
        <SecaoPreguicosa rotulo={TEXTOS_TELA.blocos.historicos}>
          {/* HTML do Pedro (.grid.g-13): Múltiplos em 1/3 (P/L sobre P/VP) e Pares em 2/3 só a
              partir de xl, os dois cards com a mesma altura (stretch); a tabela de pares cabe nos 2/3
              (cabeçalhos quebram). Abaixo de xl (inclusive 390 px) empilha. */}
          <div className="grid min-w-0 gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <BlocoMultiplosHistoricos {...base} />
            <BlocoPares {...base} />
          </div>
        </SecaoPreguicosa>
        {classe === 'acao' && recursos?.societario === true ? (
          <SecaoPreguicosa rotulo={TEXTOS_SOCIETARIO.titulo}>
            <BlocoSocietario ticker={ticker} />
          </SecaoPreguicosa>
        ) : null}
        <div className="grid min-w-0 items-start gap-4 md:gap-6 xl:grid-cols-2">
          <BlocoTese ticker={ticker} />
          <div className="flex min-w-0 flex-col gap-4 md:gap-6">
            <BlocoEventos classe={classe} eventos={ativo.eventos} />
            <CardEducacao educacao={ativo.educacao} classe={classe} />
          </div>
        </div>
        <SeloFrescor frescor={ativo.frescor} />
      </div>
    </ConferenciaPaginaProvider>
  );
}
