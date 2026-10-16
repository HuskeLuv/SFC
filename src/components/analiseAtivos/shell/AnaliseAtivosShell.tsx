'use client';

/**
 * Casca da área (dono: 0a). 'quadro': título "Análise de Ativos" + pílula Beta, subtítulo neutro,
 * busca, banner do beta; 'ativo': "Voltar ao Quadro" + busca compacta. Rodapé legal nos dois.
 * v2.4 (fatia B): subtítulo sem o indicador antigo (textosQuadro) e aviso legal único provisório.
 * O gate (flag/beta) fica no layout server; aqui só a apresentação.
 *
 * Bloco D (fatia D): PilulasArea "Quadro | Comparador" embaixo do subtítulo do 'quadro' e no ramo
 * 'comparador' (título + Beta, subtítulo neutro, pílulas, busca compacta). As pílulas só existem com
 * config.recursos.comparador; sem o recurso renderizam null e a casca fica igual à de hoje.
 *
 * Bloco 1 (fatia C): ramo 'salvos' (= cabeçalho do 'quadro' sem o banner, pílula Salvos atual) e
 * "Criar lista" navy (BotaoCriarLista) nas variantes quadro/comparador/salvos, só com
 * config.recursos.salvos: ao lado da busca no computador, ao lado do título no celular. Sem o
 * recurso, o DOM é o de antes.
 */
import Link from 'next/link';
import BuscaAtivos from '@/components/analiseAtivos/busca/BuscaAtivos';
import PilulasArea from '@/components/analiseAtivos/shell/PilulasArea';
import BotaoCriarLista from '@/components/analiseAtivos/shell/BotaoCriarLista';
import BannerNovidade from '@/components/analiseAtivos/shell/BannerNovidade';
import RodapeLegal from '@/components/analiseAtivos/shell/RodapeLegal';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { useAnaliseAtivosConfig } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_QUADRO } from '@/services/analiseAtivos/textosQuadro';
import type { AnaliseAtivosShellProps } from '@/types/analiseAtivosApi';

/** Título "Análise de Ativos" + pílula Beta (com "Criar lista" ao lado no celular). */
function TituloArea({ criarLista }: { criarLista: boolean }) {
  const t = TEXTOS_TELA.area;
  const h1 = (
    <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-800 md:text-2xl dark:text-white/90">
      {t.titulo}
      <span className="rounded-full bg-[#314666] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase">
        {t.pilulaBeta}
      </span>
    </h1>
  );
  if (!criarLista) return h1;
  return (
    <div className="flex items-center justify-between gap-3">
      {h1}
      <span className="shrink-0 lg:hidden">
        <BotaoCriarLista />
      </span>
    </div>
  );
}

/** Busca da casca; com Salvos, "Criar lista" ao lado dela no computador. */
function BuscaArea({
  variante,
  className,
  criarLista,
}: {
  variante: 'cabecalho' | 'compacta';
  className: string;
  criarLista: boolean;
}) {
  if (!criarLista) return <BuscaAtivos variante={variante} className={className} />;
  return (
    <div className="flex w-full min-w-0 items-center gap-2 lg:w-auto">
      <BuscaAtivos variante={variante} className={`min-w-0 ${className}`} />
      <span className="hidden shrink-0 lg:block">
        <BotaoCriarLista />
      </span>
    </div>
  );
}

export default function AnaliseAtivosShell({ children, variante }: AnaliseAtivosShellProps) {
  const t = TEXTOS_TELA.area;
  const config = useAnaliseAtivosConfig();
  // bloco 1: "Criar lista" só com o recurso (sem ele, a casca fica idêntica à de hoje)
  const criarLista = config.data?.recursos?.salvos === true;
  return (
    <div className="flex min-w-0 flex-col gap-4 md:gap-6" data-analise-ativos={variante}>
      {variante === 'quadro' || variante === 'salvos' ? (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <TituloArea criarLista={criarLista} />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {TEXTOS_QUADRO.subtitulo}
              </p>
              <PilulasArea ativa={variante} className="mt-3" />
            </div>
            <BuscaArea
              variante="cabecalho"
              className="w-full lg:w-[420px]"
              criarLista={criarLista}
            />
          </div>
          {variante === 'quadro' ? <BannerNovidade /> : null}
        </>
      ) : variante === 'comparador' ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <TituloArea criarLista={criarLista} />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {TEXTOS_ENTRADAS_COMPARADOR.paginaComparador.subtitulo}
            </p>
            <PilulasArea ativa="comparador" className="mt-3" />
          </div>
          <BuscaArea variante="compacta" className="w-full sm:w-[320px]" criarLista={criarLista} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/analise-ativos"
            className={`inline-flex min-h-11 items-center text-sm font-medium ${COR_LINK.classes}`}
          >
            ← {t.voltarQuadro}
          </Link>
          <BuscaAtivos variante="compacta" className="w-full sm:w-[320px]" />
        </div>
      )}
      {children}
      <RodapeLegal className="mt-2" />
    </div>
  );
}
