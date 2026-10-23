'use client';

/**
 * Estado do Quadro espelhado na URL (?classe=&ordem=&dir=&modo=&j=&c=&carteira=&s=): voltar da
 * página do ativo, recarregar ou compartilhar o link mantém classe, janela, critérios, ordem,
 * filtros e modo. Erro de rede não perde nada (o estado está na URL). Valores inválidos caem no
 * padrão (a rota é a autoridade e dá 400 para o resto).
 *
 * - j: janela dos critérios (3 | 5 | 10; padrão 5, fora da URL).
 * - c: critérios ligados (ids, E lógico), separados por vírgula — só os chips habilitados da classe
 *   (CRITERIOS_FILTRAVEIS, dos params vigentes do código; v2.5: com a v2 todos, então ?c=vac e o
 *   chip Vacância/Inadimplência ficam); a ordem dos ids é a da barra.
 * - carteira=1: "Na minha carteira". s: setor (ações) ou segmento CVM (FIIs).
 * - Ordem padrão A–Z (ticker asc, fora da URL).
 * - filtro: id do filtro salvo aplicado (bloco 1, fatia 0: só o tipo e o parse; a UI é da fatia
 *   B). Opcional; valor que não é uuid é ignorado. Trocar de classe ou limpar os filtros o tira.
 * Stocks e REITs (fatia C): classe=stock|reit é lida sempre; sem a chave EUA o QuadroAnalise volta
 * para Ações (a rota daria 404). Filtro: stock usa ?s= como setor (divisão SIC); reit, como segmento.
 * Trocar de classe ZERA os filtros (critérios, carteira e setor; os chips são outros) e volta à
 * ordem A–Z; janela e modo continuam (caso 31).
 */
import { useCallback, useEffect, useMemo } from 'react';
import { lembrarQuadro } from '@/components/analiseAtivos/shell/LinkVoltarQuadro';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  COLUNAS,
  CRITERIOS_FILTRAVEIS,
  DIRECAO_PADRAO,
  ORDEM_PADRAO,
} from '@/constants/analiseAtivosVisual';
import type { FiltrosQuadro } from '@/hooks/useAnaliseAtivos';
import { PARAM_FILTRO_SALVO } from '@/services/analiseAtivos/salvos/contrato';
import {
  CLASSES_QUADRO,
  type ClasseQuadro,
  type DirecaoOrdem,
  type ModoQuadro,
  type OrdemQuadro,
} from '@/types/analiseAtivosApi';
import {
  JANELAS_CRITERIOS,
  JANELA_PADRAO,
  type IdCriterio,
  type Janela,
} from '@/types/analiseAtivosCriterios';

export interface EstadoQuadro {
  classe: ClasseQuadro;
  ordem: OrdemQuadro;
  dir: DirecaoOrdem;
  modo: ModoQuadro;
  janela: Janela;
  /** ids ligados, na ordem da barra */
  criterios: IdCriterio[];
  naCarteira: boolean;
  setor: string | null;
  /** bloco 1: id do filtro salvo aplicado (?filtro=); ausente/null = nenhum */
  filtro?: string | null;
}

/** uuid (id de AnaliseFiltroSalvo); outro valor em ?filtro= é ignorado. */
const RE_ID_FILTRO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLASSES: readonly ClasseQuadro[] = CLASSES_QUADRO;
const DIRECOES: DirecaoOrdem[] = ['asc', 'desc'];
const MODOS: ModoQuadro[] = ['resumo', 'detalhado'];

/** Ordens válidas para a classe: A–Z + as colunas ordenáveis de qualquer modo. */
export function ordensDaClasse(classe: ClasseQuadro): OrdemQuadro[] {
  const s = new Set<OrdemQuadro>([ORDEM_PADRAO]);
  for (const modo of MODOS) for (const c of COLUNAS[classe][modo]) if (c.ordem) s.add(c.ordem);
  return [...s];
}

/** Ids válidos para a classe, sem repetição e na ordem da barra. */
export function criteriosDaClasse(classe: ClasseQuadro, ids: readonly string[]): IdCriterio[] {
  const pedidos = new Set(ids);
  return CRITERIOS_FILTRAVEIS[classe].filter((id) => pedidos.has(id));
}

export function lerEstadoQuadro(params: URLSearchParams): EstadoQuadro {
  const classe = (CLASSES as readonly string[]).includes(params.get('classe') ?? '')
    ? (params.get('classe') as ClasseQuadro)
    : 'acao';
  const ordemBruta = params.get('ordem') as OrdemQuadro | null;
  const ordem =
    ordemBruta && ordensDaClasse(classe).includes(ordemBruta) ? ordemBruta : ORDEM_PADRAO;
  const dirBruta = params.get('dir') as DirecaoOrdem | null;
  const dir = dirBruta && DIRECOES.includes(dirBruta) ? dirBruta : DIRECAO_PADRAO[ordem];
  const modo = params.get('modo') === 'detalhado' ? 'detalhado' : 'resumo';
  const j = Number(params.get('j'));
  const janela = (JANELAS_CRITERIOS as readonly number[]).includes(j)
    ? (j as Janela)
    : JANELA_PADRAO;
  const criterios = criteriosDaClasse(classe, (params.get('c') ?? '').split(','));
  const naCarteira = params.get('carteira') === '1';
  const setor = params.get('s')?.trim() || null;
  const filtroBruto = params.get(PARAM_FILTRO_SALVO)?.trim() ?? '';
  const filtro = RE_ID_FILTRO.test(filtroBruto) ? filtroBruto.toLowerCase() : null;
  return { classe, ordem, dir, modo, janela, criterios, naCarteira, setor, filtro };
}

export function escreverEstadoQuadro(e: EstadoQuadro): URLSearchParams {
  const qs = new URLSearchParams();
  if (e.classe !== 'acao') qs.set('classe', e.classe);
  if (e.ordem !== ORDEM_PADRAO || e.dir !== DIRECAO_PADRAO[e.ordem]) {
    qs.set('ordem', e.ordem);
    qs.set('dir', e.dir);
  }
  if (e.modo !== 'resumo') qs.set('modo', e.modo);
  if (e.janela !== JANELA_PADRAO) qs.set('j', String(e.janela));
  if (e.criterios.length) qs.set('c', e.criterios.join(','));
  if (e.naCarteira) qs.set('carteira', '1');
  if (e.setor) qs.set('s', e.setor);
  if (e.filtro) qs.set(PARAM_FILTRO_SALVO, e.filtro);
  return qs;
}

/** Estado → filtros da API (QuadroParams sem offset/limite). */
export function filtrosDoEstado(e: EstadoQuadro): FiltrosQuadro {
  const f: FiltrosQuadro = { classe: e.classe, ordem: e.ordem, dir: e.dir, janela: e.janela };
  if (e.criterios.length) f.criterios = e.criterios.join(',');
  if (e.naCarteira) f.naCarteira = true;
  if (e.setor) {
    if (e.classe === 'acao' || e.classe === 'stock') f.setor = e.setor;
    else f.segmento = e.setor;
  }
  return f;
}

/** Liga/desliga um critério mantendo a ordem da barra. */
export function alternarCriterio(
  classe: ClasseQuadro,
  atuais: readonly IdCriterio[],
  id: IdCriterio,
): IdCriterio[] {
  const s = new Set(atuais);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  return criteriosDaClasse(classe, [...s]);
}

export function useEstadoQuadroUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const chave = params?.toString() ?? '';
  const estado = useMemo(() => lerEstadoQuadro(new URLSearchParams(chave)), [chave]);
  // "Voltar ao Quadro" da página do ativo reabre o Quadro como estava (só o da raiz da área)
  useEffect(() => {
    if (pathname === '/analise-ativos') lembrarQuadro(chave);
  }, [pathname, chave]);

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
        ...estado,
        classe,
        ordem: ORDEM_PADRAO,
        dir: DIRECAO_PADRAO[ORDEM_PADRAO],
        criterios: [],
        naCarteira: false,
        setor: null,
        filtro: null,
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
  /** A pílula da coluna ativa volta para A–Z. */
  const voltarAz = useCallback(
    () => aplicar({ ...estado, ordem: ORDEM_PADRAO, dir: DIRECAO_PADRAO[ORDEM_PADRAO] }),
    [aplicar, estado],
  );
  const setModo = useCallback(
    (modo: ModoQuadro) => aplicar({ ...estado, modo }),
    [aplicar, estado],
  );
  const setJanela = useCallback(
    (janela: Janela) => aplicar({ ...estado, janela }),
    [aplicar, estado],
  );
  const alternarCriterioUrl = useCallback(
    (id: IdCriterio) =>
      aplicar({ ...estado, criterios: alternarCriterio(estado.classe, estado.criterios, id) }),
    [aplicar, estado],
  );
  const alternarNaCarteira = useCallback(
    () => aplicar({ ...estado, naCarteira: !estado.naCarteira }),
    [aplicar, estado],
  );
  const setSetor = useCallback(
    (setor: string | null) => aplicar({ ...estado, setor }),
    [aplicar, estado],
  );
  const limparFiltros = useCallback(
    () => aplicar({ ...estado, criterios: [], naCarteira: false, setor: null, filtro: null }),
    [aplicar, estado],
  );

  const filtros = useMemo(() => filtrosDoEstado(estado), [estado]);
  const temFiltro = estado.criterios.length > 0 || estado.naCarteira || !!estado.setor;

  return {
    estado,
    filtros,
    temFiltro,
    setClasse,
    ordenarPor,
    setOrdem,
    voltarAz,
    setModo,
    setJanela,
    alternarCriterio: alternarCriterioUrl,
    alternarNaCarteira,
    setSetor,
    limparFiltros,
  };
}
