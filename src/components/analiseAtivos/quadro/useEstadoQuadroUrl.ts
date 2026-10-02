'use client';

/**
 * Estado do Quadro espelhado na URL (?classe=&ordem=&dir=&modo=&f=&s=): voltar da página do ativo,
 * recarregar ou compartilhar o link mantém classe, ordem, filtros e modo. Erro de rede não perde
 * nada (o estado está na URL). Valores inválidos caem no padrão.
 *
 * - f: chips ligados, separados por vírgula (FiltroRapido).
 * - s: setor (ações) ou segmento CVM (FIIs) do popover.
 * Trocar de classe limpa filtros e setor (os chips são diferentes por classe) e volta à ordem padrão.
 */
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  COLUNAS,
  DIRECAO_PADRAO,
  FILTROS_RAPIDOS,
  LIMIARES_FILTRO,
  ORDEM_PADRAO,
  type FiltroRapido,
} from '@/constants/analiseAtivosVisual';
import type { FiltrosQuadro } from '@/hooks/useAnaliseAtivos';
import type { ClasseQuadro, DirecaoOrdem, ModoQuadro, OrdemQuadro } from '@/types/analiseAtivosApi';

export interface EstadoQuadro {
  classe: ClasseQuadro;
  ordem: OrdemQuadro;
  dir: DirecaoOrdem;
  modo: ModoQuadro;
  chips: FiltroRapido[];
  setor: string | null;
}

const CLASSES: ClasseQuadro[] = ['acao', 'fii'];
const DIRECOES: DirecaoOrdem[] = ['asc', 'desc'];
const MODOS: ModoQuadro[] = ['resumo', 'detalhado'];

/** Ordens válidas para a classe: as colunas ordenáveis de qualquer modo + Índice MF. */
export function ordensDaClasse(classe: ClasseQuadro): OrdemQuadro[] {
  const s = new Set<OrdemQuadro>([ORDEM_PADRAO]);
  for (const modo of MODOS) for (const c of COLUNAS[classe][modo]) if (c.ordem) s.add(c.ordem);
  return [...s];
}

export function lerEstadoQuadro(params: URLSearchParams): EstadoQuadro {
  const classe = (CLASSES as string[]).includes(params.get('classe') ?? '')
    ? (params.get('classe') as ClasseQuadro)
    : 'acao';
  const ordemBruta = params.get('ordem') as OrdemQuadro | null;
  const ordem =
    ordemBruta && ordensDaClasse(classe).includes(ordemBruta) ? ordemBruta : ORDEM_PADRAO;
  const dirBruta = params.get('dir') as DirecaoOrdem | null;
  const dir = dirBruta && DIRECOES.includes(dirBruta) ? dirBruta : DIRECAO_PADRAO[ordem];
  const modo = params.get('modo') === 'detalhado' ? 'detalhado' : 'resumo';
  const validos = FILTROS_RAPIDOS[classe];
  const chips = (params.get('f') ?? '')
    .split(',')
    .filter((c): c is FiltroRapido => (validos as string[]).includes(c));
  const setor = params.get('s')?.trim() || null;
  return { classe, ordem, dir, modo, chips: [...new Set(chips)], setor };
}

export function escreverEstadoQuadro(e: EstadoQuadro): URLSearchParams {
  const qs = new URLSearchParams();
  if (e.classe !== 'acao') qs.set('classe', e.classe);
  if (e.ordem !== ORDEM_PADRAO || e.dir !== DIRECAO_PADRAO[e.ordem]) {
    qs.set('ordem', e.ordem);
    qs.set('dir', e.dir);
  }
  if (e.modo !== 'resumo') qs.set('modo', e.modo);
  if (e.chips.length) qs.set('f', e.chips.join(','));
  if (e.setor) qs.set('s', e.setor);
  return qs;
}

/** Chips + setor → filtros da API (QuadroParams sem offset/limite). */
export function filtrosDoEstado(e: EstadoQuadro): FiltrosQuadro {
  const f: FiltrosQuadro = { classe: e.classe, ordem: e.ordem, dir: e.dir };
  const tem = (c: FiltroRapido) => e.chips.includes(c);
  if (tem('lucroConsistente')) f.lucroConsistente = true;
  if (tem('dyMinAcao')) f.dyMin = LIMIARES_FILTRO.dyMinAcao;
  if (tem('dyMinFii')) f.dyMin = LIMIARES_FILTRO.dyMinFii;
  if (tem('pvpMax')) f.pvpMax = LIMIARES_FILTRO.pvpMax;
  if (tem('tijolo')) f.tipo = 'tijolo';
  if (tem('papel')) f.tipo = 'papel';
  if (tem('naCarteira')) f.naCarteira = true;
  if (tem('somenteCompletos')) f.somenteCompletos = true;
  if (e.setor) {
    if (e.classe === 'acao') f.setor = e.setor;
    else f.segmento = e.setor;
  }
  return f;
}

/** Chips que se excluem (o tipo do FII é um só por vez). */
const EXCLUSIVOS: Partial<Record<FiltroRapido, FiltroRapido>> = {
  tijolo: 'papel',
  papel: 'tijolo',
};

export function alternarChip(chips: FiltroRapido[], chip: FiltroRapido): FiltroRapido[] {
  if (chips.includes(chip)) return chips.filter((c) => c !== chip);
  const oposto = EXCLUSIVOS[chip];
  return [...chips.filter((c) => c !== oposto), chip];
}

export function useEstadoQuadroUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const chave = params?.toString() ?? '';
  const estado = useMemo(() => lerEstadoQuadro(new URLSearchParams(chave)), [chave]);

  const aplicar = useCallback(
    (novo: EstadoQuadro) => {
      const qs = escreverEstadoQuadro(novo).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const setClasse = useCallback(
    (classe: ClasseQuadro) => {
      if (classe === estado.classe) return;
      aplicar({
        classe,
        ordem: ORDEM_PADRAO,
        dir: DIRECAO_PADRAO[ORDEM_PADRAO],
        modo: estado.modo,
        chips: [],
        setor: null,
      });
    },
    [aplicar, estado],
  );

  /** Clique no cabeçalho: 1º clique = direção padrão; de novo = inverte. */
  const ordenarPor = useCallback(
    (ordem: OrdemQuadro) => {
      const dir =
        estado.ordem === ordem ? (estado.dir === 'asc' ? 'desc' : 'asc') : DIRECAO_PADRAO[ordem];
      aplicar({ ...estado, ordem, dir });
    },
    [aplicar, estado],
  );

  const setOrdem = useCallback(
    (ordem: OrdemQuadro, dir: DirecaoOrdem) => aplicar({ ...estado, ordem, dir }),
    [aplicar, estado],
  );
  const setModo = useCallback(
    (modo: ModoQuadro) => aplicar({ ...estado, modo }),
    [aplicar, estado],
  );
  const alternarFiltro = useCallback(
    (chip: FiltroRapido) => aplicar({ ...estado, chips: alternarChip(estado.chips, chip) }),
    [aplicar, estado],
  );
  const setSetor = useCallback(
    (setor: string | null) => aplicar({ ...estado, setor }),
    [aplicar, estado],
  );
  const limparFiltros = useCallback(
    () => aplicar({ ...estado, chips: [], setor: null }),
    [aplicar, estado],
  );

  const filtros = useMemo(() => filtrosDoEstado(estado), [estado]);
  const temFiltro = estado.chips.length > 0 || !!estado.setor;

  return {
    estado,
    filtros,
    temFiltro,
    setClasse,
    ordenarPor,
    setOrdem,
    setModo,
    alternarFiltro,
    setSetor,
    limparFiltros,
  };
}
