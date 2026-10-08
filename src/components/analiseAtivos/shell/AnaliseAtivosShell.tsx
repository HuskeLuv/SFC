'use client';

/**
 * Casca da área (dono: 0a). 'quadro': título "Análise de Ativos" + pílula Beta, subtítulo neutro,
 * busca, banner do beta; 'ativo': "Voltar ao Quadro" + busca compacta. Rodapé legal nos dois.
 * O gate (flag/beta) fica no layout server; aqui só a apresentação.
 *
 * Bloco D (fatia D): PilulasArea "Quadro | Comparador" embaixo do subtítulo do 'quadro' e no ramo
 * 'comparador' (título + Beta, subtítulo neutro, pílulas, busca compacta). As pílulas só existem com
 * config.recursos.comparador; sem o recurso renderizam null e a casca fica igual à de hoje.
 */
import Link from 'next/link';
import BuscaAtivos from '@/components/analiseAtivos/busca/BuscaAtivos';
import PilulasArea from '@/components/analiseAtivos/shell/PilulasArea';
import BannerNovidade from '@/components/analiseAtivos/shell/BannerNovidade';
import RodapeLegal from '@/components/analiseAtivos/shell/RodapeLegal';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { AnaliseAtivosShellProps } from '@/types/analiseAtivosApi';

export default function AnaliseAtivosShell({ children, variante }: AnaliseAtivosShellProps) {
  const t = TEXTOS_TELA.area;
  return (
    <div className="flex min-w-0 flex-col gap-4 md:gap-6" data-analise-ativos={variante}>
      {variante === 'quadro' ? (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-800 md:text-2xl dark:text-white/90">
                {t.titulo}
                <span className="rounded-full bg-[#314666] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase">
                  {t.pilulaBeta}
                </span>
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t.subtitulo}</p>
              <PilulasArea ativa="quadro" className="mt-3" />
            </div>
            <BuscaAtivos variante="cabecalho" className="w-full lg:w-[420px]" />
          </div>
          <BannerNovidade />
        </>
      ) : variante === 'comparador' ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-800 md:text-2xl dark:text-white/90">
              {t.titulo}
              <span className="rounded-full bg-[#314666] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase">
                {t.pilulaBeta}
              </span>
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {TEXTOS_ENTRADAS_COMPARADOR.paginaComparador.subtitulo}
            </p>
            <PilulasArea ativa="comparador" className="mt-3" />
          </div>
          <BuscaAtivos variante="compacta" className="w-full sm:w-[320px]" />
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
