'use client';

/**
 * Coluna "Na carteira" do Quadro (decisão 9): os números são OS MESMOS da aba da Carteira — a
 * quantidade e o "% da carteira" vêm de useAcoes/useFii (a mesma query da aba, que já respeita o
 * "mover entre abas" #275). O overlay (/api/analise-ativos/carteira) só completa o que a aba não
 * mostra: posição que foi movida para outra aba e o objetivo de um planejado.
 *
 * O hook da aba só é montado quando a coluna está na tela (`FonteNaCarteira` renderizado pelo
 * Quadro), com uma única chamada por classe.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAcoes } from '@/hooks/useAcoes';
import { useFii } from '@/hooks/useFii';
import { useOverlayCarteira } from '@/hooks/useAnaliseAtivos';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { formatPct } from '@/utils/format';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro, OverlayCarteiraResposta } from '@/types/analiseAtivosApi';

export interface PosicaoAba {
  quantidade: number;
  percentual: number;
  objetivo: number;
  planejado: boolean;
}

export type MapaAba = Map<string, PosicaoAba>;

export type InfoNaCarteira =
  | { tipo: 'posicao'; quantidade: number; percentual: number | null }
  | { tipo: 'planejado'; objetivo: number | null }
  | { tipo: 'nenhum' };

interface SecaoAba {
  ativos?: Array<{
    ticker?: string;
    quantidade?: number;
    percentualCarteira?: number;
    objetivo?: number;
    planejado?: boolean;
  }>;
}

export function mapaDaAba(data: { secoes?: SecaoAba[] } | null | undefined): MapaAba {
  const m: MapaAba = new Map();
  for (const s of data?.secoes ?? []) {
    for (const a of s.ativos ?? []) {
      if (!a.ticker) continue;
      m.set(a.ticker.toUpperCase(), {
        quantidade: a.quantidade ?? 0,
        percentual: a.percentualCarteira ?? 0,
        objetivo: a.objetivo ?? 0,
        planejado: a.planejado === true || (a.quantidade ?? 0) <= 0,
      });
    }
  }
  return m;
}

/** Junta a aba da Carteira (fonte dos números) com o overlay (posição em outra aba, planejado). */
export function infoNaCarteira(
  ticker: string,
  aba: MapaAba | null,
  overlay: OverlayCarteiraResposta | undefined,
): InfoNaCarteira {
  const t = ticker.toUpperCase();
  const naAba = aba?.get(t);
  if (naAba && !naAba.planejado && naAba.quantidade > 0) {
    return { tipo: 'posicao', quantidade: naAba.quantidade, percentual: naAba.percentual };
  }
  const pos = overlay?.posicoes[t];
  if (pos && pos.quantidade > 0)
    return { tipo: 'posicao', quantidade: pos.quantidade, percentual: null };
  const plan = overlay?.planejados[t];
  if (plan) return { tipo: 'planejado', objetivo: plan.objetivoPct ?? (naAba?.objetivo || null) };
  if (naAba?.planejado) return { tipo: 'planejado', objetivo: naAba.objetivo || null };
  return { tipo: 'nenhum' };
}

function FonteAcoes({ onMapa }: { onMapa: (m: MapaAba) => void }) {
  const { data } = useAcoes();
  useEffect(() => {
    if (data) onMapa(mapaDaAba(data));
  }, [data, onMapa]);
  return null;
}

function FonteFii({ onMapa }: { onMapa: (m: MapaAba) => void }) {
  const { data } = useFii();
  useEffect(() => {
    if (data) onMapa(mapaDaAba(data));
  }, [data, onMapa]);
  return null;
}

/**
 * Dados da coluna para a classe ativa. `fonte` é um elemento invisível que monta o hook da aba
 * (renderizar só quando a coluna está visível); `info(ticker)` resolve a célula.
 */
export function useNaCarteira(classe: ClasseQuadro, visivel: boolean) {
  const overlay = useOverlayCarteira({ enabled: visivel });
  const [mapas, setMapas] = useState<Partial<Record<ClasseQuadro, MapaAba>>>({});
  const onAcoes = useCallback((m: MapaAba) => setMapas((x) => ({ ...x, acao: m })), []);
  const onFii = useCallback((m: MapaAba) => setMapas((x) => ({ ...x, fii: m })), []);
  const fonte = !visivel ? null : classe === 'acao' ? (
    <FonteAcoes onMapa={onAcoes} />
  ) : (
    <FonteFii onMapa={onFii} />
  );
  const aba = mapas[classe] ?? null;
  const info = useCallback(
    (ticker: string) => infoNaCarteira(ticker, aba, overlay.data),
    [aba, overlay.data],
  );
  const conjunto = useMemo(() => {
    const s = new Set<string>();
    for (const [t, p] of aba ?? []) if (p.quantidade > 0 || p.planejado) s.add(t);
    for (const t of Object.keys(overlay.data?.posicoes ?? {})) s.add(t);
    for (const t of Object.keys(overlay.data?.planejados ?? {})) s.add(t);
    return s;
  }, [aba, overlay.data]);
  return { fonte, info, conjunto };
}

const inteiro = (n: number) => formatarAnalise(n, 'inteiro');
/** Mesmo formato do "% da carteira" da aba (formatPct, 2 casas), sem o '%' do template. */
const pct = (n: number) => formatPct(n).replace(/%$/, '');

export function textoNaCarteira(info: InfoNaCarteira, classe: ClasseQuadro): string {
  const t = TEXTOS_TELA.quadro;
  if (info.tipo === 'posicao') {
    if (info.percentual === null)
      return formatarTexto(t.posicaoSemPct, { n: inteiro(info.quantidade) });
    return formatarTexto(classe === 'fii' ? t.posicaoCotas : t.posicaoAcoes, {
      n: inteiro(info.quantidade),
      valor: pct(info.percentual),
    });
  }
  if (info.tipo === 'planejado') {
    return info.objetivo
      ? formatarTexto(t.planejadoPct, { valor: pct(info.objetivo) })
      : TEXTOS_TELA.selosEstado.planejado;
  }
  return TEXTOS_TELA.formato.semDado;
}

export interface CelulaNaCarteiraProps {
  info: InfoNaCarteira;
  classe: ClasseQuadro;
  className?: string;
}

export default function CelulaNaCarteira({ info, classe, className = '' }: CelulaNaCarteiraProps) {
  const texto = textoNaCarteira(info, classe);
  if (info.tipo === 'nenhum') {
    return (
      <span
        className={`text-gray-400 dark:text-gray-500 ${className}`}
        aria-label={TEXTOS_TELA.quadro.naoTem}
      >
        {texto}
      </span>
    );
  }
  const planejado = info.tipo === 'planejado';
  return (
    <span
      data-na-carteira={info.tipo}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums ${
        planejado
          ? 'border border-dashed border-[#98A2B3] text-gray-600 dark:text-gray-300'
          : 'bg-[#EDF2F8] text-[#396CAA] dark:bg-[#6E9DC4]/15 dark:text-[#6E9DC4]'
      } ${className}`}
    >
      {texto}
    </span>
  );
}
