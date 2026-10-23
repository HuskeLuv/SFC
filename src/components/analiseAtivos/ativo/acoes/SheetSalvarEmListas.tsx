'use client';

/**
 * "Salvar <T> em…" (bloco 1, fatia B) — a escolha de listas do botão Salvar quando o usuário tem 2
 * ou mais listas (cabeçalho do ativo, "Mudar listas" e o marcador da linha/cartão do Quadro).
 *
 * - Computador: popover ancorado em quem abriu (portal + posição fixa, para não ser cortado pelo
 *   overflow da tabela); Esc e clique fora fecham e devolvem o foco à âncora.
 * - Celular: BottomSheet; o "voltar" do sistema fecha (useMobileHistoryLayer, no dono do estado).
 * - Uma caixa por lista; o <label> inteiro (52 px) é o alvo; marcar/desmarcar grava NA HORA
 *   (PUT /salvos/[ticker] com o conjunto explícito, otimista no índice). Lista cheia (200) ou
 *   conta cheia (500): as não marcadas ficam desabilitadas, com o motivo.
 * - "Nova lista com <T>" abre o ModalNomeLista (quem monta é o dono do estado). Com 20 listas, o
 *   aviso do limite no lugar do botão. Rodapé: "Os alertas seguem os de cada lista." (só com o
 *   recurso alertas) + "Pronto".
 *
 * Também exporta a CamadaEscolha (popover/BottomSheet) que FiltrosSalvos e MenuComparacoesSalvas
 * reusam. Cópia só de textosSalvos.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import { textoContagemAtivos } from '@/components/analiseAtivos/salvos/compartilhados/formatosSalvos';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import type { LimitesSalvos, ResumoLista } from '@/types/analiseAtivosSalvos';

const T = TEXTOS_SALVOS.escolherListas;

export const FOCO_SALVOS =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

const BASE = `inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCO_SALVOS}`;
/** Secundário pequeno (44 px) das camadas do bloco 1. */
export const BOTAO_CAMADA_SEC = `${BASE} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-white/90 dark:hover:bg-white/5`;
/** Primário pequeno (44 px): patrimônio, hover segurança. */
export const BOTAO_CAMADA_PRI = `${BASE} bg-[#396CAA] text-white hover:bg-[#314666] dark:bg-[#396CAA] dark:hover:bg-[#6E9DC4] dark:hover:text-gray-900`;

const FOCAVEIS =
  'input:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export interface CamadaEscolhaProps {
  aberto: boolean;
  onFechar: () => void;
  /** quem abriu (posição do popover e foco de volta) */
  ancora: HTMLElement | null;
  /** nome acessível (computador) */
  rotulo: string;
  /** título do BottomSheet (celular) */
  titulo: ReactNode;
  celular: boolean;
  /** largura do popover em px (padrão 320) */
  largura?: number;
  rodape?: ReactNode;
  children: ReactNode;
  /** atributo data- para os testes e o QA */
  dataCamada?: string;
}

/** Posição fixa do popover: alinhado à direita da âncora, embaixo (ou em cima, se não cabe). */
function posicionar(ancora: HTMLElement, painel: HTMLElement, largura: number): CSSProperties {
  const r = ancora.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(12, Math.min(r.right - largura, vw - largura - 12));
  const h = painel.offsetHeight;
  let top = r.bottom + 6;
  if (top + h > vh - 12) top = Math.max(12, r.top - h - 6);
  return { position: 'fixed', top, left, width: largura };
}

/** Popover (computador) ou BottomSheet (celular) com o conteúdo de uma escolha. */
export function CamadaEscolha({
  aberto,
  onFechar,
  ancora,
  rotulo,
  titulo,
  celular,
  largura = 320,
  rodape,
  children,
  dataCamada,
}: CamadaEscolhaProps) {
  const painelRef = useRef<HTMLDivElement>(null);
  const [estilo, setEstilo] = useState<CSSProperties>({
    position: 'fixed',
    top: -9999,
    left: -9999,
    width: largura,
  });
  const fecharRef = useRef(onFechar);
  useEffect(() => {
    fecharRef.current = onFechar;
  }, [onFechar]);

  useLayoutEffect(() => {
    if (!aberto || celular || !ancora || !painelRef.current) return;
    const atualizar = () => {
      if (painelRef.current) setEstilo(posicionar(ancora, painelRef.current, largura));
    };
    atualizar();
    window.addEventListener('resize', atualizar);
    window.addEventListener('scroll', atualizar, true);
    return () => {
      window.removeEventListener('resize', atualizar);
      window.removeEventListener('scroll', atualizar, true);
    };
  }, [aberto, celular, ancora, largura]);

  // foco no 1º controle ao abrir; Esc/clique fora fecham e devolvem o foco à âncora
  useEffect(() => {
    if (!aberto || celular) return;
    const painel = painelRef.current;
    const primeiro =
      painel?.querySelector<HTMLElement>('[data-autofocus]') ??
      painel?.querySelector<HTMLElement>(FOCAVEIS);
    primeiro?.focus();
    const fechar = (devolverFoco: boolean) => {
      fecharRef.current();
      if (devolverFoco && ancora && document.contains(ancora)) ancora.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fechar(true);
      }
    };
    const onFora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (painelRef.current?.contains(alvo)) return;
      if (ancora?.contains(alvo)) return;
      // modal aberto por cima (ex.: Nova lista) não fecha a camada
      if ((alvo as Element).closest?.('[data-modal-analise]')) return;
      fechar(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onFora);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onFora);
    };
  }, [aberto, celular, ancora]);

  if (celular) {
    return (
      <BottomSheet isOpen={aberto} onClose={onFechar} title={titulo} footer={rodape}>
        <div className="flex flex-col pt-1 pb-3" data-camada={dataCamada}>
          {children}
        </div>
      </BottomSheet>
    );
  }
  if (!aberto || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={painelRef}
      role="dialog"
      aria-label={rotulo}
      data-camada={dataCamada}
      style={estilo}
      className="z-[99990] flex max-h-[min(480px,calc(100dvh-24px))] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white font-app text-gray-800 shadow-lg dark:border-[#2E3440] dark:bg-[#1F1F22] dark:text-white/90"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
      {rodape ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-gray-100 px-3 py-2 dark:border-gray-800">
          {rodape}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

export interface SheetSalvarEmListasProps {
  aberto: boolean;
  onFechar: () => void;
  ancora: HTMLElement | null;
  ticker: string;
  celular: boolean;
  /** listas do usuário (ordem de criação), com contagem e avisos */
  listas: Array<
    Pick<ResumoLista, 'id' | 'nome'> & Partial<Pick<ResumoLista, 'contagem' | 'alertas'>>
  >;
  /** listas que contêm o ativo agora (índice otimista) */
  marcadas: readonly string[];
  limites: LimitesSalvos;
  /** soma dos itens de todas as listas (conta cheia em limites.itensPorUsuario) */
  totalItens: number;
  /** recursos.alertas: " · com alertas" e o rodapé */
  alertasLigados: boolean;
  onAlternar: (listaId: string, marcar: boolean) => void;
  onNovaLista: () => void;
}

function totalDaLista(l: Partial<Pick<ResumoLista, 'contagem'>>): number | null {
  return l.contagem ? l.contagem.acao + l.contagem.fii : null;
}

export default function SheetSalvarEmListas({
  aberto,
  onFechar,
  ancora,
  ticker,
  celular,
  listas,
  marcadas,
  limites,
  totalItens,
  alertasLigados,
  onAlternar,
  onNovaLista,
}: SheetSalvarEmListasProps) {
  const tituloId = useId();
  const titulo = formatarTexto(T.titulo, { ticker });
  const contaCheia = totalItens >= limites.itensPorUsuario;
  const noLimiteListas = listas.length >= limites.listas;

  const corpo = (
    <div className="flex flex-col gap-1" data-salvar-em={ticker}>
      {celular ? (
        <p className="px-1 pb-1 text-[13px] text-gray-500 dark:text-gray-400">{T.instrucao}</p>
      ) : (
        <div className="px-2 pt-1 pb-1">
          <h3 id={tituloId} className="text-[15px] font-semibold text-gray-800 dark:text-white/90">
            {titulo}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{T.instrucao}</p>
        </div>
      )}
      <div role="group" aria-label={titulo} className="flex flex-col">
        {listas.map((l) => {
          const marcada = marcadas.includes(l.id);
          const n = totalDaLista(l);
          const cheia = !marcada && n !== null && n >= limites.itensPorLista;
          const desabilitada = !marcada && (cheia || contaCheia);
          const id = `salvar-em-${ticker}-${l.id}`;
          let detalhe = n === null ? '' : textoContagemAtivos(n);
          if (cheia && !contaCheia)
            detalhe += formatarTexto(T.listaCheia, { max: limites.itensPorLista });
          if (
            alertasLigados &&
            l.alertas &&
            (l.alertas.resultado || l.alertas.provento || l.alertas.criterios)
          )
            detalhe += T.comAlertas;
          return (
            <label
              key={l.id}
              htmlFor={id}
              data-lista-opcao={l.id}
              className={`flex min-h-[52px] items-center gap-3 rounded-lg px-2 py-1.5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[#0079F2] dark:has-[:focus-visible]:ring-[#6E9DC4] ${
                desabilitada
                  ? 'cursor-not-allowed opacity-55'
                  : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.04]'
              }`}
            >
              <input
                id={id}
                type="checkbox"
                checked={marcada}
                disabled={desabilitada}
                onChange={(e) => onAlternar(l.id, e.target.checked)}
                className="h-5 w-5 shrink-0 accent-[#396CAA] outline-none dark:[color-scheme:dark]"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                  {l.nome}
                </span>
                {detalhe ? (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{detalhe}</span>
                ) : null}
              </span>
            </label>
          );
        })}
        {noLimiteListas ? (
          <p className="px-2 py-2 text-[12.5px] text-gray-500 dark:text-gray-400">
            {formatarTexto(T.limiteListas, { max: limites.listas })}
          </p>
        ) : (
          <button
            type="button"
            onClick={onNovaLista}
            data-nova-lista-com={ticker}
            className={`flex min-h-[52px] items-center gap-3 rounded-lg px-2 text-left text-sm font-medium text-[#396CAA] hover:bg-gray-50 dark:text-[#6E9DC4] dark:hover:bg-white/[0.04] ${FOCO_SALVOS}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            {formatarTexto(T.novaListaCom, { ticker })}
          </button>
        )}
      </div>
      {contaCheia ? (
        <p
          role="note"
          className="mx-2 mt-1 rounded-lg border-l-[3px] border-[#396CAA] bg-[#EDF2F8] px-3 py-2 text-[12.5px] text-gray-700 dark:border-[#6E9DC4] dark:bg-white/5 dark:text-gray-300"
        >
          {formatarTexto(T.limiteUsuario, { max: limites.itensPorUsuario })}
        </p>
      ) : null}
    </div>
  );

  const rodape = (
    <>
      <span className="min-w-0 flex-1 text-xs text-gray-500 dark:text-gray-400">
        {alertasLigados ? T.rodapeAlertas : null}
      </span>
      <button
        type="button"
        onClick={onFechar}
        className={BOTAO_CAMADA_PRI}
        data-salvar-em-pronto=""
      >
        {T.pronto}
      </button>
    </>
  );

  return (
    <CamadaEscolha
      aberto={aberto}
      onFechar={onFechar}
      ancora={ancora}
      rotulo={titulo}
      titulo={titulo}
      celular={celular}
      rodape={celular ? <div className="flex w-full items-center gap-2">{rodape}</div> : rodape}
      dataCamada="salvar-em"
    >
      {corpo}
    </CamadaEscolha>
  );
}
