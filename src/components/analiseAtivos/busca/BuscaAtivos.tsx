'use client';

/**
 * Busca de ativos (fatia A): combobox ARIA (aria-activedescendant, listbox/option; setas, Enter,
 * Esc; "/" foca a busca em qualquer tela da área). O índice inteiro (useIndiceBusca) chega uma vez,
 * no primeiro uso, e o filtro roda no cliente (quadro/indiceBusca.ts) — nenhuma requisição por
 * tecla. Grupos Ações/FIIs com o trecho destacado (até 8), selos Na carteira/Planejado (overlay) e
 * "fora do Quadro · motivo" para quem não teve negócio recente.
 *
 * Celular (< lg): botão que abre um sheet de tela cheia com campo de 16px e as buscas recentes
 * (localStorage, só conveniência).
 */
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useIndiceBusca, useOverlayCarteira } from '@/hooks/useAnaliseAtivos';
import { filtrarBusca, trechoDestacado } from '@/services/analiseAtivos/quadro/indiceBusca';
import { TEXTOS_TELA, formatarTexto, textoForaDoQuadro } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import type {
  BuscaAtivosProps,
  ItemBusca,
  OverlayCarteiraResposta,
} from '@/types/analiseAtivosApi';

export type { BuscaAtivosProps };

/**
 * Extras locais do Comparador (Bloco D, fatia C), além do contrato BuscaAtivosProps:
 * - embutida: campo sempre visível e lista no fluxo (dentro do popover/sheet do slot "Adicionar"),
 *   sem o botão + sheet próprios do celular; resultados com 52px;
 * - indisponiveis: ticker → motivo (ex.: 'já está na comparação'); o item aparece desabilitado;
 * - semConsulta: conteúdo mostrado com o campo vazio (sugestões do mesmo segmento).
 */
export interface BuscaAtivosExtras {
  embutida?: boolean;
  indisponiveis?: Readonly<Record<string, string>>;
  semConsulta?: ReactNode;
  /** rótulo/placeholder do campo (padrão: os da busca da área) */
  rotulo?: string;
  placeholder?: string;
}

/**
 * Bloco D: com `classe`, os itens da outra classe somem ou, com `desabilitarOutraClasse`, ficam
 * desabilitados com o motivo. `indisponiveis` desabilita tickers específicos. Devolve os itens e o
 * motivo de cada desabilitado.
 */
export function filtrarPorClasse(
  itens: ItemBusca[],
  classe: BuscaAtivosProps['classe'],
  desabilitarOutraClasse: boolean,
  indisponiveis: Readonly<Record<string, string>> = {},
): { itens: ItemBusca[]; motivos: Map<string, string> } {
  const motivos = new Map<string, string>();
  const TB = TEXTOS_COMPARADOR.busca;
  const out: ItemBusca[] = [];
  for (const item of itens) {
    if (classe && item.c !== classe) {
      if (!desabilitarOutraClasse) continue;
      motivos.set(item.t, item.c === 'fii' ? TB.outraClasseFii : TB.outraClasseAcao);
    } else if (indisponiveis[item.t]) {
      motivos.set(item.t, indisponiveis[item.t]);
    }
    out.push(item);
  }
  return { itens: out, motivos };
}

const T = TEXTOS_TELA.busca;
const CHAVE_RECENTES = 'mf-analise-ativos-buscas-recentes';
const MAX_RECENTES = 5;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

function lerRecentes(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(CHAVE_RECENTES) ?? '[]');
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENTES)
      : [];
  } catch {
    return [];
  }
}

function guardarRecente(ticker: string) {
  try {
    const lista = [ticker, ...lerRecentes().filter((t) => t !== ticker)].slice(0, MAX_RECENTES);
    window.localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista));
  } catch {
    /* sem storage: só não lembra */
  }
}

/** Grupos na ordem Ações → FIIs, mantendo a relevância dentro de cada um. */
export function agruparResultados(
  itens: ItemBusca[],
): Array<{ classe: 'acao' | 'fii'; itens: ItemBusca[] }> {
  return (['acao', 'fii'] as const)
    .map((classe) => ({ classe, itens: itens.filter((i) => i.c === classe) }))
    .filter((g) => g.itens.length > 0);
}

function Destaque({ texto, consulta }: { texto: string; consulta: string }) {
  const t = trechoDestacado(texto, consulta);
  if (!t) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, t[0])}
      <mark className="rounded-sm bg-[#DCE6F2] text-inherit dark:bg-[#6E9DC4]/30">
        {texto.slice(t[0], t[1])}
      </mark>
      {texto.slice(t[1])}
    </>
  );
}

function SeloItem({
  item,
  overlay,
}: {
  item: ItemBusca;
  overlay: OverlayCarteiraResposta | undefined;
}) {
  const base =
    'inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap';
  if (overlay?.posicoes[item.t]) {
    return (
      <span
        className={`${base} bg-[#EDF2F8] text-[#396CAA] dark:bg-[#6E9DC4]/15 dark:text-[#6E9DC4]`}
      >
        {TEXTOS_TELA.selosEstado.na_carteira}
      </span>
    );
  }
  if (overlay?.planejados[item.t]) {
    return (
      <span
        className={`${base} border border-dashed border-[#98A2B3] text-gray-600 dark:text-gray-300`}
      >
        {TEXTOS_TELA.selosEstado.planejado}
      </span>
    );
  }
  if (!item.q && item.m) {
    return (
      <span
        className={`${base} border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300`}
      >
        {formatarTexto(TEXTOS_TELA.foraDoQuadro.comMotivo, { motivo: textoForaDoQuadro(item.m) })}
      </span>
    );
  }
  return null;
}

interface ListaProps {
  idBase: string;
  consulta: string;
  resultados: ItemBusca[];
  ativo: number;
  overlay: OverlayCarteiraResposta | undefined;
  onEscolher: (ticker: string) => void;
  onAtivo: (i: number) => void;
  celular: boolean;
  carregando: boolean;
  /** Bloco D: lista no fluxo (embutida no slot do Comparador) com linhas de 52px */
  embutida?: boolean;
  /** Bloco D: ticker → motivo do item desabilitado */
  motivos?: ReadonlyMap<string, string>;
}

function ListaResultados({
  idBase,
  consulta,
  resultados,
  ativo,
  overlay,
  onEscolher,
  onAtivo,
  celular,
  carregando,
  embutida = false,
  motivos,
}: ListaProps) {
  const grupos = agruparResultados(resultados);
  let i = -1;
  return (
    <div
      id={`${idBase}-lista`}
      role="listbox"
      aria-label={T.sugestoes}
      className={
        celular || embutida
          ? 'flex flex-col'
          : 'absolute top-full right-0 left-0 z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900'
      }
    >
      {resultados.length === 0 ? (
        <div className="px-4 py-4 text-sm" role="presentation">
          {carregando ? (
            <span className="text-gray-500 dark:text-gray-400">{T.carregando}</span>
          ) : (
            <>
              <b className="block text-gray-800 dark:text-white/90">
                {formatarTexto(T.nenhumResultado, { valor: consulta.trim() })}
              </b>
              <span className="text-gray-500 dark:text-gray-400">{T.semResultado}</span>
            </>
          )}
        </div>
      ) : (
        grupos.map((g) => (
          <div key={g.classe} role="group" aria-label={T.grupos[g.classe]}>
            <div
              role="presentation"
              className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
            >
              {T.grupos[g.classe]}
            </div>
            {g.itens.map((item) => {
              i += 1;
              const idx = i;
              const sel = idx === ativo;
              const motivo = motivos?.get(item.t) ?? null;
              return (
                <div
                  key={item.t}
                  id={`${idBase}-opt-${idx}`}
                  role="option"
                  aria-selected={sel}
                  aria-disabled={motivo ? true : undefined}
                  data-ticker={item.t}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!motivo) onEscolher(item.t);
                  }}
                  onMouseMove={() => onAtivo(idx)}
                  className={`flex items-center gap-3 px-4 py-2 ${
                    embutida ? 'min-h-[52px] rounded-[10px] px-2' : 'min-h-11'
                  } ${motivo ? 'cursor-not-allowed' : 'cursor-pointer'} ${
                    sel ? 'bg-[#EDF2F8] dark:bg-[#6E9DC4]/15' : ''
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[9.5px] font-semibold text-[#314666] dark:bg-white/[0.06] dark:text-[#6E9DC4]"
                  >
                    {item.t.slice(0, 4)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-sm font-semibold ${
                          motivo
                            ? 'text-gray-500 dark:text-gray-400'
                            : 'text-gray-800 dark:text-white/90'
                        }`}
                      >
                        <Destaque texto={item.t} consulta={consulta} />
                      </span>
                      <SeloItem item={item} overlay={overlay} />
                    </span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      <Destaque texto={item.n} consulta={consulta} />
                    </span>
                  </span>
                  {motivo ? (
                    <span className="shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
                      {motivo}
                    </span>
                  ) : item.i !== null ? (
                    <span className="shrink-0 text-xs text-gray-500 tabular-nums dark:text-gray-400">
                      {formatarTexto(T.indiceCurto, {
                        valor: item.i.toLocaleString('pt-BR', {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        }),
                      })}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))
      )}
      {!celular && !embutida && resultados.length > 0 ? (
        <div
          role="presentation"
          className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-400"
        >
          {T.instrucoes}
        </div>
      ) : null}
    </div>
  );
}

function IconeLupa({ className = '' }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function BuscaAtivos({
  variante,
  autoFocus = false,
  onSelecionar,
  className = '',
  classe,
  desabilitarOutraClasse = false,
  embutida = false,
  indisponiveis,
  semConsulta,
  rotulo,
  placeholder,
}: BuscaAtivosProps & BuscaAtivosExtras) {
  const router = useRouter();
  const telaEstreita = useIsBelowLg();
  // embutida: o popover/sheet é do Comparador; aqui só o campo e a lista
  const celular = telaEstreita && !embutida;
  const idBase = useId().replace(/:/g, '');
  const inputRef = useRef<HTMLInputElement>(null);
  const [consulta, setConsulta] = useState('');
  const [aberto, setAberto] = useState(false);
  const [sheet, setSheet] = useState(false);
  const fecharSheet = useCallback(() => setSheet(false), []);
  // celular: "voltar" do sistema fecha a busca em tela cheia em vez de sair da página
  const { fecharEntao } = useMobileHistoryLayer(sheet, fecharSheet, celular);
  const [usado, setUsado] = useState(autoFocus);
  const [ativo, setAtivo] = useState(0);
  const [recentes, setRecentes] = useState<string[]>([]);

  const indice = useIndiceBusca({ enabled: usado });
  const overlay = useOverlayCarteira({ enabled: usado });
  const filtrados = useMemo(
    () =>
      filtrarPorClasse(
        filtrarBusca(indice.data?.itens ?? [], consulta).map((r) => r.item),
        classe,
        desabilitarOutraClasse,
        indisponiveis,
      ),
    [indice.data, consulta, classe, desabilitarOutraClasse, indisponiveis],
  );
  const resultados = filtrados.itens;
  // ordem visual (Ações → FIIs) = ordem da navegação por setas
  const ordenados = useMemo(
    () => agruparResultados(resultados).flatMap((g) => g.itens),
    [resultados],
  );

  useEffect(() => setAtivo(0), [consulta]);

  // "/" foca a busca (fora de campos de texto)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)))
        return;
      e.preventDefault();
      setUsado(true);
      if (celular) setSheet(true);
      else inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [celular]);

  useEffect(() => {
    if (sheet) setRecentes(lerRecentes());
  }, [sheet]);

  const escolher = useCallback(
    (ticker: string) => {
      guardarRecente(ticker);
      setAberto(false);
      setConsulta('');
      // a navegação só depois de desfazer a entrada da busca no histórico (senão o back a desfaz)
      fecharEntao(() => {
        if (onSelecionar) onSelecionar(ticker);
        else router.push(`/analise-ativos/${encodeURIComponent(ticker)}`);
      });
    },
    [onSelecionar, router, fecharEntao],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => (ordenados.length ? (a + 1) % ordenados.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAtivo((a) => (ordenados.length ? (a - 1 + ordenados.length) % ordenados.length : 0));
    } else if (e.key === 'Enter') {
      const item = ordenados[ativo];
      if (item && filtrados.motivos.has(item.t)) e.preventDefault();
      else if (item) {
        e.preventDefault();
        escolher(item.t);
      }
    } else if (e.key === 'Escape') {
      if (aberto) {
        e.preventDefault();
        setAberto(false);
      } else if (sheet) setSheet(false);
    }
  };

  const mostrarLista = consulta.trim().length > 0 && (aberto || sheet || embutida);
  const campo = (emSheet: boolean) => (
    <input
      ref={emSheet ? undefined : inputRef}
      type="search"
      role="combobox"
      aria-label={rotulo ?? T.rotulo}
      aria-expanded={mostrarLista}
      aria-controls={`${idBase}-lista`}
      aria-autocomplete="list"
      aria-activedescendant={
        mostrarLista && ordenados.length ? `${idBase}-opt-${ativo}` : undefined
      }
      autoComplete="off"
      autoFocus={emSheet || autoFocus}
      placeholder={placeholder ?? T.placeholder}
      value={consulta}
      onFocus={() => {
        setUsado(true);
        setAberto(true);
      }}
      onBlur={() => setAberto(false)}
      onChange={(e) => {
        setConsulta(e.target.value);
        setAberto(true);
      }}
      onKeyDown={onKeyDown}
      className={`w-full min-w-0 bg-transparent text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-white/90 ${
        emSheet || (embutida && telaEstreita) ? 'text-base' : 'text-sm'
      }`}
    />
  );

  if (embutida) {
    return (
      <div className={`flex min-w-0 flex-col gap-1 ${className}`} data-busca-variante={variante}>
        <div className="flex h-11 items-center gap-2 rounded-[10px] border border-gray-200 bg-white px-3 focus-within:ring-[3px] focus-within:ring-[#0079F2]/40 dark:border-gray-700 dark:bg-gray-900">
          <IconeLupa className="shrink-0 text-gray-400" />
          {campo(false)}
        </div>
        {mostrarLista ? (
          <ListaResultados
            idBase={idBase}
            consulta={consulta}
            resultados={ordenados}
            ativo={ativo}
            overlay={overlay.data}
            onEscolher={escolher}
            onAtivo={setAtivo}
            celular={false}
            embutida
            motivos={filtrados.motivos}
            carregando={indice.isPending}
          />
        ) : (
          semConsulta
        )}
      </div>
    );
  }

  if (celular) {
    return (
      <>
        <button
          type="button"
          aria-label={T.abrir}
          aria-haspopup="dialog"
          data-busca-variante={variante}
          onClick={() => {
            setUsado(true);
            setSheet(true);
          }}
          className={`flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-left text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 ${FOCO} ${className}`}
        >
          <IconeLupa />
          <span className="truncate">{T.placeholder}</span>
        </button>
        <BottomSheet
          isOpen={sheet}
          onClose={fecharSheet}
          ariaLabel={T.rotulo}
          className="h-[calc(100dvh-env(safe-area-inset-top)-12px)]"
        >
          <div className="flex min-h-12 items-center gap-2 rounded-xl border border-gray-200 px-3 dark:border-gray-700">
            <IconeLupa className="shrink-0 text-gray-400" />
            {campo(true)}
          </div>
          <div className="pt-2">
            {consulta.trim() ? (
              <ListaResultados
                idBase={idBase}
                consulta={consulta}
                resultados={ordenados}
                ativo={ativo}
                overlay={overlay.data}
                onEscolher={escolher}
                onAtivo={setAtivo}
                celular
                motivos={filtrados.motivos}
                carregando={indice.isPending}
              />
            ) : (
              <div className="flex flex-col gap-2 px-1 py-2 text-sm text-gray-500 dark:text-gray-400">
                <p>{T.dicaCelular}</p>
                {recentes.length ? (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold tracking-wide uppercase">
                      {T.recentes}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recentes.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => escolher(r)}
                          className={`inline-flex min-h-11 items-center rounded-full border border-gray-200 px-3 text-sm text-[#396CAA] dark:border-gray-700 dark:text-[#6E9DC4] ${FOCO}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </BottomSheet>
      </>
    );
  }

  return (
    <div className={`relative ${className}`} data-busca-variante={variante}>
      <div
        className={`flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 focus-within:ring-[3px] focus-within:ring-[#0079F2]/40 dark:border-gray-700 dark:bg-gray-900 ${
          variante === 'compacta' ? 'h-10' : 'h-11'
        }`}
      >
        <IconeLupa className="shrink-0 text-gray-400" />
        {campo(false)}
        <kbd
          aria-hidden="true"
          title={T.atalho}
          className="rounded border border-gray-200 px-1.5 text-[11px] text-gray-500 dark:border-gray-700 dark:text-gray-400"
        >
          /
        </kbd>
      </div>
      {mostrarLista ? (
        <ListaResultados
          idBase={idBase}
          consulta={consulta}
          resultados={ordenados}
          ativo={ativo}
          overlay={overlay.data}
          onEscolher={escolher}
          onAtivo={setAtivo}
          celular={false}
          motivos={filtrados.motivos}
          carregando={indice.isPending}
        />
      ) : null}
    </div>
  );
}
