'use client';

/**
 * "← Voltar ao Quadro de {classe}" da página do ativo (HTML do Pedro, data-back): volta ao Quadro
 * como o usuário o deixou — classe, filtros, ordem, modo e janela. O Quadro guarda a própria query
 * na sessionStorage (lembrarQuadro, só conveniência por aba); se a classe guardada não for a do
 * ativo (chegou pela busca), volta ao Quadro da classe do ativo. A janela da página (?j=) vence a
 * guardada, para a escolha feita no card de critérios voltar junto.
 *
 * useJanelaDaPagina: a janela 3/5/10 é uma só entre o Quadro e o ativo (S.win do protótipo). A
 * página do ativo abre na ?j= do link ou na do Quadro guardado e grava a troca em ?j=.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { useAtivoTopo } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';
import { JANELA_PADRAO, type Janela } from '@/types/analiseAtivosCriterios';

const CHAVE_QUADRO = 'analiseAtivos:quadro';
const BASE = '/analise-ativos';

export function lembrarQuadro(qs: string): void {
  try {
    sessionStorage.setItem(CHAVE_QUADRO, qs);
  } catch {
    // sem storage (aba privada, bloqueio): o voltar cai no Quadro da classe do ativo
  }
}

function lerQuadroGuardado(): string | null {
  try {
    return sessionStorage.getItem(CHAVE_QUADRO);
  } catch {
    return null;
  }
}

function janelaDe(bruta: string | null | undefined): Janela | null {
  return bruta === '3' || bruta === '5' || bruta === '10' ? (Number(bruta) as Janela) : null;
}

/** [janela inicial do card de critérios, gravar a troca na URL da página]. */
export function useJanelaDaPagina(): [Janela, (j: Janela) => void] {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const daUrl = janelaDe(params.get('j'));
  const inicial =
    daUrl ??
    (typeof window === 'undefined'
      ? null
      : janelaDe(new URLSearchParams(lerQuadroGuardado() ?? '').get('j'))) ??
    JANELA_PADRAO;
  const trocar = useCallback(
    (j: Janela) => {
      // explícita mesmo em 5: senão o voltar herdaria a janela do Quadro guardado
      const qs = new URLSearchParams(params.toString());
      qs.set('j', String(j));
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
    },
    [router, pathname, params],
  );
  return [inicial, trocar];
}

export function hrefVoltarQuadro(
  classe: ClasseQuadro | null,
  guardado: string | null,
  janela: string | null,
): string {
  let qs = new URLSearchParams(guardado ?? '');
  const classeGuardada = qs.get('classe') ?? 'acao';
  if (classe && classeGuardada !== classe) {
    qs = new URLSearchParams(classe === 'acao' ? '' : `classe=${classe}`);
  }
  if (janela === '3' || janela === '10') qs.set('j', janela);
  else if (janela === '5') qs.delete('j');
  const s = qs.toString();
  return s ? `${BASE}?${s}` : BASE;
}

export default function LinkVoltarQuadro() {
  const t = TEXTOS_TELA.area;
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const ticker = decodeURIComponent(pathname.slice(BASE.length + 1).split('/')[0] ?? '');
  const classe = useAtivoTopo(ticker).data?.classe ?? null;
  const [guardado, setGuardado] = useState<string | null>(null);
  useEffect(() => setGuardado(lerQuadroGuardado()), []);
  const href = hrefVoltarQuadro(classe, guardado, params.get('j'));
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center text-sm font-medium ${COR_LINK.classes}`}
    >
      ← {classe ? TEXTOS_TELA.ativo.voltarQuadroClasse[classe] : t.voltarQuadro}
    </Link>
  );
}
