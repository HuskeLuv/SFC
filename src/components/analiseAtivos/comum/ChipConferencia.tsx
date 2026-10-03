'use client';

/**
 * Chip "em conferência" (bloco C, fatia B): lupa com contorno tracejado + texto, sempre com forma
 * própria (nunca só cor). Na página do ativo é o BOTÃO do "Por quê?": popover de 380px no
 * computador (role="dialog" não modal; Esc e clique fora fecham e devolvem o foco ao chip), sheet
 * no celular (BottomSheet + useMobileHistoryLayer: "voltar" fecha). O desenho fica compacto e a
 * área de toque tem 44px (pseudo-elemento), sem engordar a linha.
 *
 * "Reportar" no fim do "Por quê?": fecha antes o popover/sheet (no celular, depois que a camada
 * de histórico do sheet saiu — fecharEntao) e só então abre o formulário, montado aqui fora do
 * invólucro (BotaoReportarDado 'controlado'). Assim navegar do formulário para Meus relatos não
 * deixa a entrada do sheet órfã no histórico (o 1º "voltar" não ficaria parado na página).
 *
 * Sem contexto da página (Quadro, cartões, que já são links) ou com `estatico`: só o texto, sem
 * botão. `HACHURA` = fundo da célula com valor em conferência ('—' + chip) nas tabelas.
 */
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import PorQueConferencia, {
  relatoDoCampo,
  useConferenciaPagina,
} from '@/components/analiseAtivos/comum/PorQueConferencia';
import BotaoReportarDado from '@/components/analiseAtivos/reporte/BotaoReportarDado';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import type { BlocoReporte } from '@/services/analiseAtivos/curadoria/contrato';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import type { ConferenciaTela, Estado, FormatoAnalise } from '@/types/analiseAtivosApi';

/** Número calculado e não publicado (só no "Por quê?" da página), formatado; null sem ele. */
export function naoPublicado(e: Estado<number>, formato: FormatoAnalise): string | null {
  return e.estado === 'ausente' && typeof e.valorNaoPublicado === 'number'
    ? formatarAnalise(e.valorNaoPublicado, formato)
    : null;
}

/** Célula com valor em conferência: hachura clara (texto em app-ink por cima, ≥ 4,5:1). */
export const HACHURA =
  'bg-[repeating-linear-gradient(135deg,transparent_0_6px,#F2F4F7_6px_8px)] dark:bg-[repeating-linear-gradient(135deg,transparent_0_6px,#2E3440_6px_8px)]';

/** Borda tracejada de cartão/KPI em conferência. */
export const BORDA_CONFERENCIA = 'border border-dashed border-[#667085] dark:border-[#98A2B3]';

const CHIP =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-[#667085] bg-[#F2F4F7] px-2 text-[11.5px] leading-5 font-medium text-gray-700 dark:border-[#98A2B3] dark:bg-white/5 dark:text-gray-300';

const FOCO =
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

const LARGURA_POPOVER = 380;

export function IconeLupaTracejada({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`}>
      <circle
        cx="10.5"
        cy="10.5"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="3.2 2.4"
      />
      <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export interface ChipConferenciaProps {
  /** conferência da página que marca o campo; null = chip só de texto */
  conferencia?: ConferenciaTela | null;
  /** campo de tela (CampoTela) */
  campo: string;
  /** rótulo legível do campo ('P/VP') */
  rotuloCampo: string;
  /** valor calculado não publicado, já formatado (exibição 'ocultar') */
  valorNaoPublicado?: string | null;
  /** bloco do chip (contexto do relato); padrão 'kpis' */
  bloco?: BlocoReporte;
  /** só texto, sem botão (dentro de um link, Quadro) */
  estatico?: boolean;
  className?: string;
}

export default function ChipConferencia({
  conferencia,
  campo,
  rotuloCampo,
  valorNaoPublicado,
  bloco = 'kpis',
  estatico = false,
  className = '',
}: ChipConferenciaProps) {
  const ctx = useConferenciaPagina();
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const celular = useIsBelowLg();
  const [formAberto, setFormAberto] = useState(false);
  const fechar = useCallback(() => setAberto(false), []);
  const { fecharEntao } = useMobileHistoryLayer(aberto, fechar, celular);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const idPainel = useId();
  const idTitulo = useId();
  const t = TEXTOS_TELA.conferencia;
  const interativo = !estatico && !!conferencia && !!ctx;

  const posicionar = useCallback(() => {
    const b = botaoRef.current?.getBoundingClientRect();
    if (!b) return;
    const largura = Math.min(LARGURA_POPOVER, window.innerWidth - 32);
    const left = Math.max(16, Math.min(b.left, window.innerWidth - largura - 16));
    const abaixo = window.innerHeight - b.bottom;
    const estilo: CSSProperties = { position: 'fixed', left, width: largura };
    if (abaixo < 260 && b.top > abaixo) estilo.bottom = window.innerHeight - b.top + 6;
    else estilo.top = b.bottom + 6;
    setPos(estilo);
  }, []);

  // Computador: posiciona junto ao chip, foco no painel; Esc/clique fora fecham; rolar reposiciona.
  useEffect(() => {
    if (!aberto || celular) return;
    posicionar();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAberto(false);
        botaoRef.current?.focus();
      }
    };
    const onFora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (painelRef.current?.contains(alvo) || botaoRef.current?.contains(alvo)) return;
      setAberto(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onFora);
    window.addEventListener('scroll', posicionar, true);
    window.addEventListener('resize', posicionar);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onFora);
      window.removeEventListener('scroll', posicionar, true);
      window.removeEventListener('resize', posicionar);
    };
  }, [aberto, celular, posicionar]);

  useEffect(() => {
    if (aberto && !celular && pos) painelRef.current?.focus();
  }, [aberto, celular, pos]);

  const conteudoChip = (
    <>
      <IconeLupaTracejada />
      {t.chip}
    </>
  );

  if (!interativo || !conferencia) {
    return (
      <span data-chip-conferencia="" className={`${CHIP} ${className}`}>
        {conteudoChip}
      </span>
    );
  }

  const fecharDevolvendoFoco = () => {
    setAberto(false);
    botaoRef.current?.focus();
  };

  const porQue = (comTitulo: boolean) => (
    <PorQueConferencia
      conferencia={conferencia}
      campo={campo}
      rotuloCampo={rotuloCampo}
      valorNaoPublicado={valorNaoPublicado}
      bloco={bloco}
      idTitulo={idTitulo}
      comTitulo={comTitulo}
      onReportar={() => fecharEntao(() => setFormAberto(true))}
    />
  );

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        data-chip-conferencia={conferencia.grupo}
        aria-label={formatarTexto(t.chipAria, { campo: rotuloCampo })}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto && !celular ? idPainel : undefined}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setAberto((v) => !v);
        }}
        className={`${CHIP} relative cursor-pointer after:absolute after:inset-x-[-4px] after:-inset-y-3 after:content-[''] hover:border-solid hover:text-[#1D2939] dark:hover:text-white ${FOCO} ${className}`}
      >
        {conteudoChip}
      </button>
      {celular ? (
        <BottomSheet
          isOpen={aberto}
          onClose={fechar}
          title={formatarTexto(t.porQue.tituloCampo, { campo: rotuloCampo })}
          footer={
            <button
              type="button"
              onClick={fechar}
              className={`flex min-h-12 w-full items-center justify-center rounded-xl border border-gray-300 text-base font-medium text-gray-800 dark:border-gray-700 dark:text-white/90 ${FOCO}`}
            >
              {t.porQue.fechar}
            </button>
          }
        >
          <div className="pt-1 pb-2">{porQue(false)}</div>
        </BottomSheet>
      ) : aberto && typeof document !== 'undefined' ? (
        createPortal(
          <div
            ref={painelRef}
            id={idPainel}
            role="dialog"
            aria-modal="false"
            aria-labelledby={idTitulo}
            tabIndex={-1}
            data-popover-conferencia=""
            onClick={(e) => e.stopPropagation()}
            style={pos ?? { position: 'fixed', visibility: 'hidden' }}
            className="z-[60] flex flex-col gap-2 rounded-[14px] border border-gray-200 bg-white px-4 py-3.5 shadow-lg outline-none dark:border-gray-800 dark:bg-[#1F1F22]"
          >
            <button
              type="button"
              onClick={fecharDevolvendoFoco}
              aria-label={t.porQue.fechar}
              className={`absolute top-1.5 right-1.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 ${FOCO}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {porQue(true)}
          </div>,
          document.body,
        )
      ) : null}
      {ctx.reporteHabilitado ? (
        <BotaoReportarDado
          ticker={ctx.ticker}
          classe={ctx.classe}
          bloco={bloco}
          {...relatoDoCampo(ctx, conferencia, campo, rotuloCampo, bloco)}
          variante="controlado"
          aberto={formAberto}
          onFechar={() => {
            setFormAberto(false);
            botaoRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}
