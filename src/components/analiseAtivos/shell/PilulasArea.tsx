'use client';

/**
 * Pílulas do topo da área (Bloco D, fatia D; bloco 1, fatia C: lista declarativa). A ordem é a da
 * spec: Quadro | Comparador | [Ranking, reservado para o bloco 3] | Salvos. Cada item vale só com o
 * seu recurso (config.recursos); o Ranking fica no array SEM rótulo e sem recurso até o bloco 3
 * ('ranking' é palavra proibida na varredura e só entra como literal registrado).
 *
 * - Renderiza com ao menos 1 recurso além do Quadro; sem nenhum, null (casca igual à de hoje).
 * - Aba ativa preenchida seguranca (#314666; escuro: escolha #EAEAEA), inativas em texto patrimonio
 *   (#396CAA; escuro: tranquilidade), como o `.ptabs` do HTML do Pedro; SEM contagem (o sino já
 *   mostra os não lidos).
 * - Leva ?classe= ao trocar de pílula para as páginas que leem a classe (Quadro e Salvos; o
 *   Comparador deduz a classe dos tickers).
 * - Links com aria-current="page" na página atual e 44px em todos os tamanhos (decisão 13); a
 *   ≤ 420 px dividem a largura.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ABA_AREA_DESLIGADA,
  ABA_AREA_LIGADA,
} from '@/components/analiseAtivos/comum/estiloPilulas';
import { useAnaliseAtivosConfig } from '@/hooks/useAnaliseAtivos';
import { ROTAS_BLOCO_D } from '@/services/analiseAtivos/cenarios/contrato';
import { ROTAS_SALVOS } from '@/services/analiseAtivos/salvos/contrato';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { RecursosBlocoD } from '@/types/analiseAtivosApi';
import type { PilulasAreaProps as PilulasAreaPropsBlocoD } from '@/types/analiseAtivosBlocoD';

const T = TEXTOS_ENTRADAS_COMPARADOR.pilulas;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

export type IdPilulaArea = 'quadro' | 'comparador' | 'ranking' | 'salvos';

/** Bloco 1: a página Salvos também é uma pílula. */
export type PilulasAreaProps = Omit<PilulasAreaPropsBlocoD, 'ativa'> & {
  ativa: Exclude<IdPilulaArea, 'ranking'>;
};

export interface ItemPilulaArea {
  id: IdPilulaArea;
  href: string;
  /** null = reservado (ainda sem rótulo; nunca renderiza) */
  rotulo: string | null;
  /** a página lê ?classe= (a pílula leva a classe atual) */
  levaClasse: boolean;
  liberado: (r: Partial<RecursosBlocoD> | undefined) => boolean;
}

export const ITENS_PILULAS_AREA: readonly ItemPilulaArea[] = [
  {
    id: 'quadro',
    href: '/analise-ativos',
    rotulo: T.quadro,
    levaClasse: true,
    liberado: () => true,
  },
  {
    id: 'comparador',
    href: ROTAS_BLOCO_D.comparador,
    rotulo: T.comparador,
    levaClasse: false,
    liberado: (r) => r?.comparador === true,
  },
  // Bloco 3: reservado. Sem rótulo e sem recurso até lá (não renderiza).
  {
    id: 'ranking',
    href: '/analise-ativos',
    rotulo: null,
    levaClasse: true,
    liberado: () => false,
  },
  {
    id: 'salvos',
    href: ROTAS_SALVOS.pagina,
    rotulo: TEXTOS_SALVOS.pilula,
    levaClasse: true,
    liberado: (r) => r?.salvos === true,
  },
];

/** Pílulas que aparecem com os recursos; [] quando só o Quadro estaria visível. */
export function pilulasVisiveis(
  recursos: Partial<RecursosBlocoD> | undefined,
): Array<ItemPilulaArea & { rotulo: string }> {
  const itens = ITENS_PILULAS_AREA.filter(
    (i): i is ItemPilulaArea & { rotulo: string } => i.rotulo !== null && i.liberado(recursos),
  );
  return itens.length > 1 ? itens : [];
}

/** href da pílula com a classe atual (só fii vai na URL; ação é o padrão). */
export function hrefPilula(item: ItemPilulaArea, classe: string | null | undefined): string {
  if (!item.levaClasse || classe !== 'fii') return item.href;
  return `${item.href}?classe=fii`;
}

function Pilulas({ ativa, className, classe }: PilulasAreaProps & { classe: string | null }) {
  const config = useAnaliseAtivosConfig();
  const itens = pilulasVisiveis(config.data?.recursos);
  if (itens.length === 0) return null;
  return (
    <nav
      aria-label={T.rotulo}
      data-pilulas-area={ativa}
      className={`inline-flex w-fit gap-0.5 rounded-xl bg-gray-100 p-[3px] max-[420px]:flex max-[420px]:w-full dark:bg-white/[0.06] ${className}`}
    >
      {itens.map((item) => {
        const atual = item.id === ativa;
        return (
          <Link
            key={item.id}
            href={hrefPilula(item, classe)}
            aria-current={atual ? 'page' : undefined}
            data-pilula={item.id}
            className={`inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 text-sm font-semibold max-[420px]:flex-1 max-[420px]:px-2 ${FOCO} ${
              atual ? ABA_AREA_LIGADA : ABA_AREA_DESLIGADA
            }`}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

function PilulasComClasse(props: PilulasAreaProps) {
  const params = useSearchParams();
  return <Pilulas {...props} classe={params?.get('classe') ?? null} />;
}

export default function PilulasArea({ ativa, className = '' }: PilulasAreaProps) {
  return (
    <Suspense fallback={<Pilulas ativa={ativa} className={className} classe={null} />}>
      <PilulasComClasse ativa={ativa} className={className} />
    </Suspense>
  );
}
