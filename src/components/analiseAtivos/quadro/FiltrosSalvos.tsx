'use client';

/**
 * Filtros salvos do Quadro (bloco 1, fatia B; só com recursos.salvos).
 *
 * - "Filtros salvos (n) ▾": popover no computador, BottomSheet no celular, com os filtros DA
 *   CLASSE (cada classe tem os seus) e o rodapé "n de 20". Tocar num filtro aplica: router.replace
 *   com escreverEstadoQuadro (janela, critérios, setor/segmento, Na minha carteira) + ?filtro=<id>,
 *   e marca o uso (PATCH {usado:true}, silencioso). No celular, a URL muda só depois de desfazer a
 *   entrada do sheet no histórico (fecharEntao).
 * - Lixeira com confirmação NA PRÓPRIA LINHA ("Apagar X?" Cancelar | Apagar).
 * - "Salvar filtros" aparece com algum filtro ligado e nenhum filtro salvo aplicado; abre o
 *   ModalSalvarFiltro (montado pelo Quadro, que também atende o "Salvar como novo" da faixa).
 * - Consultor: os dois botões desabilitados com o title dos filtros pessoais.
 *
 * Também aqui os puros que o Quadro e a faixa usam (estado do Quadro ↔ estado salvo, "alterado",
 * resumo do filtro) e o useAplicarEstadoQuadro. Cópia só de textosSalvos.
 */
import { useCallback, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  BOTAO_CAMADA_SEC,
  CamadaEscolha,
  FOCO_SALVOS,
} from '@/components/analiseAtivos/ativo/acoes/SheetSalvarEmListas';
import { mostrarToastSalvo } from '@/components/analiseAtivos/salvos/compartilhados/mostrarToastSalvo';
import {
  criteriosDaClasse,
  escreverEstadoQuadro,
  type EstadoQuadro,
} from '@/components/analiseAtivos/quadro/useEstadoQuadroUrl';
import {
  useApagarFiltro,
  useFiltrosSalvos,
  useMarcarUsoFiltro,
} from '@/hooks/useAnaliseAtivosSalvos';
import { useAuth } from '@/hooks/useAuth';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import { LIMITES_SALVOS } from '@/services/analiseAtivos/salvos/contrato';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { ClasseQuadro } from '@/types/analiseAtivosApi';
import type { DefCriterioChip, IdCriterio } from '@/types/analiseAtivosCriterios';
import type { EstadoFiltroSalvoV1, FiltroSalvoApi } from '@/types/analiseAtivosSalvos';

const T = TEXTOS_SALVOS.filtros;
const TL = T.lista;
const NOME_CLASSE: Record<ClasseQuadro, string> = TEXTOS_SALVOS.pagina.abas;

// ---------------------------------------------------------------------------
// Puros
// ---------------------------------------------------------------------------

/** O que um filtro salvo guarda, a partir do estado do Quadro (sem modo/ordem/dir). */
export function estadoFiltroDoQuadro(e: EstadoQuadro): EstadoFiltroSalvoV1 {
  return {
    janela: e.janela,
    criterios: [...e.criterios],
    naCarteira: e.naCarteira,
    setor: e.setor,
  };
}

/** true quando os chips da tela diferem do filtro salvo (critérios comparados sem ordem). */
export function filtroAlterado(e: EstadoQuadro, f: EstadoFiltroSalvoV1): boolean {
  const a = [...e.criterios].sort().join(',');
  const b = [...f.criterios].sort().join(',');
  return (
    e.janela !== f.janela ||
    a !== b ||
    e.naCarteira !== f.naCarteira ||
    (e.setor ?? null) !== (f.setor ?? null)
  );
}

/** O estado do Quadro com o filtro salvo aplicado (modo e ordem continuam os da tela). */
export function estadoComFiltro(e: EstadoQuadro, f: FiltroSalvoApi): EstadoQuadro {
  return {
    ...e,
    janela: f.estado.janela,
    criterios: criteriosDaClasse(e.classe, f.estado.criterios),
    naCarteira: f.estado.naCarteira,
    setor: f.estado.setor,
    filtro: f.id,
  };
}

/** Rótulo do chip de um critério (inclusive o par de papel dos FIIs); sem definição, o id. */
export function rotuloCriterio(id: IdCriterio, definicoes: readonly DefCriterioChip[]): string {
  for (const d of definicoes) {
    if (d.id === id) return d.rotulo;
    if (d.equivalente?.id === id) return d.equivalente.rotulo;
  }
  return id;
}

/** "5 anos · Lucro em todos os anos, ROE ≥ 10% · Setor: Energia · Na minha carteira" */
export function resumoFiltro(
  f: EstadoFiltroSalvoV1,
  classe: ClasseQuadro,
  definicoes: readonly DefCriterioChip[],
): string {
  const r = T.resumo;
  const partes = [formatarTexto(r.janela, { n: f.janela })];
  if (f.criterios.length)
    partes.push(f.criterios.map((id) => rotuloCriterio(id, definicoes)).join(', '));
  if (f.setor)
    partes.push(formatarTexto(classe === 'acao' ? r.setor : r.segmento, { setor: f.setor }));
  if (f.naCarteira) partes.push(r.naCarteira);
  return partes.join(r.separador);
}

/** router.replace com o estado do Quadro (mesma URL que o useEstadoQuadroUrl escreve). */
export function useAplicarEstadoQuadro(): (e: EstadoQuadro) => void {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (e: EstadoQuadro) => {
      const qs = escreverEstadoQuadro(e).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
}

/** Consultor agindo pelo cliente (ou podeSalvar=false na resposta): filtros salvos desabilitados. */
export function useFiltrosPessoaisBloqueados(podeSalvar: boolean | undefined): boolean {
  const { actingClient } = useAuth();
  return !!actingClient || podeSalvar === false;
}

// ---------------------------------------------------------------------------
// Ícones
// ---------------------------------------------------------------------------

export function IconeFiltro() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h16l-6 8v5l-4 2v-7z" />
    </svg>
  );
}

function IconeLixeira() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconeMarcadorPequeno() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M6 4h12v16l-6-4-6 4z" />
    </svg>
  );
}

const BOTAO_PERIGO = `inline-flex min-h-11 items-center justify-center rounded-lg bg-[#D92D20] px-3 text-[13px] font-medium text-white hover:bg-[#B42318] disabled:opacity-50 dark:bg-[#F04438] dark:hover:bg-[#D92D20] ${FOCO_SALVOS}`;
const ICONE_44 = `grid h-11 w-11 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 ${FOCO_SALVOS}`;

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export interface FiltrosSalvosProps {
  classe: ClasseQuadro;
  estado: EstadoQuadro;
  definicoes: readonly DefCriterioChip[];
  /** algum filtro ligado na tela (critério, carteira ou setor) */
  temFiltro: boolean;
  celular: boolean;
  /** "Salvar filtros" (o Quadro abre o ModalSalvarFiltro) */
  onSalvarFiltros: () => void;
  className?: string;
}

export default function FiltrosSalvos({
  classe,
  estado,
  definicoes,
  temFiltro,
  celular,
  onSalvarFiltros,
  className = '',
}: FiltrosSalvosProps) {
  const consulta = useFiltrosSalvos(classe);
  const apagar = useApagarFiltro();
  const marcarUso = useMarcarUsoFiltro();
  const aplicarEstado = useAplicarEstadoQuadro();
  const bloqueado = useFiltrosPessoaisBloqueados(consulta.data?.podeSalvar);
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const fechar = useCallback(() => {
    setAberto(false);
    setConfirmando(null);
  }, []);
  const { fecharEntao } = useMobileHistoryLayer(aberto, fechar, celular);

  const filtros = consulta.data?.filtros ?? [];
  const limites = consulta.data?.limites ?? LIMITES_SALVOS;
  const n = filtros.length;
  const nomeClasse = NOME_CLASSE[classe];

  const aplicar = (f: FiltroSalvoApi) => {
    fecharEntao(() => aplicarEstado(estadoComFiltro(estado, f)));
    marcarUso.mutate({ id: f.id });
  };

  const confirmarApagar = async (f: FiltroSalvoApi) => {
    try {
      await apagar.mutateAsync({ id: f.id });
      setConfirmando(null);
      mostrarToastSalvo({
        tipo: 'info',
        mensagem: formatarTexto(T.toast.apagado, { nome: f.nome }),
      });
      // computador: apagar o filtro aplicado tira o ?filtro= (os chips continuam). No celular o
      // sheet segue aberto (entrada no histórico); a faixa mostra que o filtro não existe mais.
      if (!celular && estado.filtro === f.id) aplicarEstado({ ...estado, filtro: null });
    } catch {
      mostrarToastSalvo({ tipo: 'erro', mensagem: TEXTOS_SALVOS.toast.erroGenerico });
    }
  };

  const titulo = formatarTexto(TL.titulo, { classe: nomeClasse });

  let corpo;
  if (consulta.isPending) {
    corpo = (
      <p aria-busy="true" className="px-2 py-4 text-sm text-gray-500 dark:text-gray-400">
        {TEXTOS_SALVOS.pagina.carregando}
      </p>
    );
  } else if (consulta.isError) {
    corpo = (
      <div role="alert" className="flex flex-col items-start gap-2 px-2 py-4 text-sm">
        <span className="text-gray-700 dark:text-gray-300">{TEXTOS_SALVOS.toast.erroGenerico}</span>
        <button type="button" className={BOTAO_CAMADA_SEC} onClick={() => void consulta.refetch()}>
          {TEXTOS_SALVOS.toast.tentarDeNovo}
        </button>
      </div>
    );
  } else if (n === 0) {
    corpo = (
      <p className="px-2 py-4 text-sm text-gray-500 dark:text-gray-400" data-filtros-vazio="">
        {formatarTexto(TL.vazio, { classe: nomeClasse })}
      </p>
    );
  } else {
    corpo = (
      <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
        {filtros.map((f) => (
          <li key={f.id} data-filtro-salvo={f.id} className="py-1">
            {confirmando === f.id ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 px-2 py-1 text-sm">
                <span className="min-w-0 flex-1 text-gray-800 dark:text-white/90">
                  {formatarTexto(TL.confirmarApagar, { nome: f.nome })}
                </span>
                <button
                  type="button"
                  className={BOTAO_CAMADA_SEC}
                  onClick={() => {
                    setConfirmando(null);
                    requestAnimationFrame(() =>
                      document.getElementById(`apagar-filtro-${f.id}`)?.focus(),
                    );
                  }}
                >
                  {TL.cancelar}
                </button>
                <button
                  type="button"
                  autoFocus
                  className={BOTAO_PERIGO}
                  disabled={apagar.isPending}
                  onClick={() => void confirmarApagar(f)}
                >
                  {TL.apagar}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => aplicar(f)}
                  aria-current={estado.filtro === f.id ? 'true' : undefined}
                  data-aplicar-filtro={f.id}
                  className={`flex min-h-11 min-w-0 flex-1 flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 aria-[current=true]:bg-[#EDF2F8] dark:hover:bg-white/5 dark:aria-[current=true]:bg-white/5 ${FOCO_SALVOS}`}
                >
                  <span className="max-w-full truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                    {f.nome}
                  </span>
                  <span className="max-w-full text-xs text-gray-500 dark:text-gray-400">
                    {resumoFiltro(f.estado, classe, definicoes)}
                  </span>
                </button>
                <button
                  type="button"
                  id={`apagar-filtro-${f.id}`}
                  className={ICONE_44}
                  aria-label={formatarTexto(TL.apagarAria, { nome: f.nome })}
                  onClick={() => setConfirmando(f.id)}
                >
                  <IconeLixeira />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  const rodape = (
    <>
      <span className="min-w-0 flex-1 text-xs text-gray-500 tabular-nums dark:text-gray-400">
        {formatarTexto(TL.contador, { n, max: limites.filtrosPorClasse })}
      </span>
      <button type="button" className={BOTAO_CAMADA_SEC} onClick={fechar}>
        {TL.fechar}
      </button>
    </>
  );

  const titleBloqueado = bloqueado ? TEXTOS_SALVOS.consultor.titleFiltros : undefined;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} data-filtros-salvos="">
      <button
        ref={botaoRef}
        type="button"
        className={BOTAO_CAMADA_SEC}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        disabled={bloqueado}
        title={titleBloqueado}
        onClick={() => {
          setAncora(botaoRef.current);
          setConfirmando(null);
          setAberto((x) => !x);
        }}
        data-botao-filtros-salvos=""
      >
        <IconeFiltro />
        {n > 0 && !bloqueado ? formatarTexto(T.botaoContagem, { n }) : T.botao}
        <span aria-hidden="true">▾</span>
      </button>
      {temFiltro && !estado.filtro ? (
        <button
          type="button"
          className={BOTAO_CAMADA_SEC}
          disabled={bloqueado}
          title={titleBloqueado}
          onClick={onSalvarFiltros}
          data-botao-salvar-filtros=""
        >
          <IconeMarcadorPequeno />
          {T.salvarFiltros}
        </button>
      ) : null}
      {!bloqueado ? (
        <CamadaEscolha
          aberto={aberto}
          onFechar={fechar}
          ancora={ancora}
          rotulo={titulo}
          titulo={titulo}
          celular={celular}
          largura={360}
          rodape={celular ? <div className="flex w-full items-center gap-2">{rodape}</div> : rodape}
          dataCamada="filtros-salvos"
        >
          {!celular ? (
            <div className="px-2 pt-1 pb-1">
              <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
                {titulo}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{TL.instrucao}</p>
            </div>
          ) : (
            <p className="px-1 pb-1 text-[13px] text-gray-500 dark:text-gray-400">
              {TL.instrucaoCelular}
            </p>
          )}
          {corpo}
        </CamadaEscolha>
      ) : null}
    </div>
  );
}
