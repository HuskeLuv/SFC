'use client';

/**
 * Menu ⋯ de um bloco da página do ativo (bloco C, fatia 0 — componente FINAL; a fatia B o encaixa
 * no slot `acao` de CartaoAnalise e nos cabeçalhos de BlocoKpis, BlocoIndiceSemaforo,
 * BlocoDividendos e GraficoLucroCotacao). Props: MenuBlocoAtivoProps
 * (src/types/analiseAtivosCuradoria.ts).
 *
 * - Botão ⋯ de 44×44 em TODAS as larguras (margem negativa para o cabeçalho não crescer), com
 *   aria-label "Opções do bloco <X>", aria-haspopup="menu" e aria-expanded.
 * - Computador: menu de 248px, itens de 44px (role="menuitem"); setas/Home/End percorrem, Esc fecha
 *   e devolve o foco ao botão, clique fora e Tab fecham.
 * - Celular (< lg): BottomSheet com itens de 52px; "voltar" do sistema fecha (useMobileHistoryLayer).
 * - Itens: "Reportar dado incorreto" (só com reporteHabilitado) e "Fonte e atualização" (só com
 *   frescor; mostra fonte, referência, data e situação no próprio menu, com "Voltar").
 * - Sem nenhum item, NÃO renderiza nada (com flag desligada e params v1 a página fica idêntica).
 * - "Reportar" fecha o menu e abre o formulário de BotaoReportarDado (variante 'controlado',
 *   montado fora do menu; fatia D).
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import BottomSheet from '@/components/ui/sheet/BottomSheet';
import BotaoReportarDado from '@/components/analiseAtivos/reporte/BotaoReportarDado';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { FrescorBloco } from '@/types/analiseAtivosApi';
import type { MenuBlocoAtivoProps } from '@/types/analiseAtivosCuradoria';

export type { MenuBlocoAtivoProps };

type Vista = 'menu' | 'fonte';

const SELETOR_ITEM = '[data-item-menu]';

const FOCO = 'focus-visible:ring-2 focus-visible:ring-[#0079F2] focus-visible:outline-none';

function formatarData(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function IconeMais() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
      <circle cx="4" cy="10" r="1.6" fill="currentColor" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" />
      <circle cx="16" cy="10" r="1.6" fill="currentColor" />
    </svg>
  );
}

function IconeSituacao({ status }: { status: FrescorBloco['status'] }) {
  if (status === 'atrasado') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 shrink-0">
        <path
          d="M8 2.5l6 10.5H2L8 2.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M8 6.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="11.4" r="0.8" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 shrink-0">
      <circle
        cx="8"
        cy="8"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeDasharray={status === 'sem_dado' ? '2 2' : undefined}
      />
      {status === 'em_dia' ? (
        <path
          d="M5.5 8.2l1.7 1.7 3.3-3.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

function PainelFonte({ frescor }: { frescor: FrescorBloco }) {
  const t = TEXTOS_TELA.conferencia.frescor;
  const data = formatarData(frescor.atualizadoEm);
  const situacao =
    frescor.status === 'em_dia' ? t.emDia : frescor.status === 'atrasado' ? t.atrasado : t.semDado;
  return (
    <dl className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
      <div className="flex flex-col">
        <dt className="text-xs text-gray-500 dark:text-gray-400">{t.fonte}</dt>
        <dd className="break-words">{frescor.fonte}</dd>
      </div>
      {frescor.referencia ? (
        <div className="flex flex-col">
          <dt className="text-xs text-gray-500 dark:text-gray-400">{t.referencia}</dt>
          <dd>{frescor.referencia}</dd>
        </div>
      ) : null}
      <div className="flex flex-col" data-frescor={frescor.status}>
        <dt className="sr-only">{TEXTOS_TELA.conferencia.porQue.situacao}</dt>
        <dd className="flex items-start gap-1.5">
          <IconeSituacao status={frescor.status} />
          <span className="flex flex-col">
            <span>{situacao}</span>
            {data ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatarTexto(t.atualizadoEm, { data })}
              </span>
            ) : null}
            {frescor.status === 'atrasado' && frescor.documentoEsperado ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatarTexto(t.documentoEsperado, { valor: frescor.documentoEsperado })}
              </span>
            ) : null}
          </span>
        </dd>
      </div>
    </dl>
  );
}

export default function MenuBlocoAtivo({
  ticker,
  classe,
  bloco,
  contexto,
  reporteHabilitado,
  frescor,
  className,
}: MenuBlocoAtivoProps) {
  const [aberto, setAberto] = useState(false);
  const [vista, setVista] = useState<Vista>('menu');
  const [formAberto, setFormAberto] = useState(false);
  const celular = useIsBelowLg();
  const fechar = useCallback(() => {
    setAberto(false);
    setVista('menu');
  }, []);
  const { fecharEntao } = useMobileHistoryLayer(aberto, fechar, celular);
  const raizRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const t = TEXTOS_TELA.relatos.menu;
  const rotuloBloco = contexto.rotuloBloco || TEXTOS_TELA.relatos.blocos[bloco];
  const temReportar = reporteHabilitado;
  const temFonte = frescor !== null;

  const itensFoco = (): HTMLElement[] =>
    Array.from(painelRef.current?.querySelectorAll<HTMLElement>(SELETOR_ITEM) ?? []);

  const fecharDevolvendoFoco = useCallback(() => {
    fechar();
    botaoRef.current?.focus();
  }, [fechar]);

  // Computador: foco no 1º item ao abrir/trocar de vista; Esc, clique fora e Tab fecham.
  useEffect(() => {
    if (!aberto || celular) return;
    painelRef.current?.querySelector<HTMLElement>(SELETOR_ITEM)?.focus();
    const onFora = (e: MouseEvent) => {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) fechar();
    };
    document.addEventListener('mousedown', onFora);
    return () => document.removeEventListener('mousedown', onFora);
  }, [aberto, celular, vista, fechar]);

  if (!temReportar && !temFonte) return null;

  const abrirReporte = () => {
    // o formulário só abre depois que o menu saiu do histórico (celular) — senão o "voltar" do
    // fechamento desmontaria a camada nova do formulário
    fecharEntao(() => setFormAberto(true));
  };

  const onTecladoMenu = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fecharDevolvendoFoco();
      return;
    }
    if (e.key === 'Tab') {
      fechar();
      return;
    }
    if (vista !== 'menu') return;
    const itens = itensFoco();
    if (itens.length === 0) return;
    const atual = itens.indexOf(document.activeElement as HTMLElement);
    let proximo = -1;
    if (e.key === 'ArrowDown') proximo = (atual + 1) % itens.length;
    else if (e.key === 'ArrowUp') proximo = (atual - 1 + itens.length) % itens.length;
    else if (e.key === 'Home') proximo = 0;
    else if (e.key === 'End') proximo = itens.length - 1;
    if (proximo >= 0) {
      e.preventDefault();
      itens[proximo].focus();
    }
  };

  const classeItem = (alturaPx: 44 | 52) =>
    `flex w-full items-center rounded-lg px-3 text-left text-sm text-gray-800 hover:bg-gray-100 dark:text-white/90 dark:hover:bg-white/5 ${FOCO} ${
      alturaPx === 44 ? 'min-h-[44px]' : 'min-h-[52px]'
    }`;

  const conteudo = (alturaPx: 44 | 52, papelMenu: boolean) =>
    vista === 'fonte' && frescor ? (
      <div className="flex flex-col gap-3 p-1">
        <PainelFonte frescor={frescor} />
        <button
          type="button"
          data-item-menu
          onClick={() => setVista('menu')}
          className={`${classeItem(alturaPx)} justify-center border border-gray-200 font-medium dark:border-gray-700`}
        >
          {t.voltar}
        </button>
      </div>
    ) : (
      <>
        {temReportar ? (
          <button
            type="button"
            role={papelMenu ? 'menuitem' : undefined}
            data-item-menu
            data-acao="reportar"
            onClick={abrirReporte}
            className={classeItem(alturaPx)}
          >
            {t.reportar}
          </button>
        ) : null}
        {temFonte ? (
          <button
            type="button"
            role={papelMenu ? 'menuitem' : undefined}
            data-item-menu
            data-acao="fonte"
            onClick={() => setVista('fonte')}
            className={classeItem(alturaPx)}
          >
            {t.fonte}
          </button>
        ) : null}
      </>
    );

  const tituloFonte = TEXTOS_TELA.conferencia.frescor.titulo;

  return (
    <div ref={raizRef} className={`relative -my-2 -mr-2 inline-flex ${className ?? ''}`}>
      <button
        ref={botaoRef}
        type="button"
        data-menu-bloco={bloco}
        aria-label={formatarTexto(t.botaoAria, { bloco: rotuloBloco })}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto && !celular ? idMenu : undefined}
        onClick={() => (aberto ? fechar() : setAberto(true))}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200 ${FOCO}`}
      >
        <IconeMais />
      </button>
      {celular ? (
        <BottomSheet
          isOpen={aberto}
          onClose={fechar}
          title={vista === 'fonte' ? tituloFonte : rotuloBloco}
        >
          <div ref={painelRef} className="flex flex-col gap-1 pt-1 pb-4">
            {conteudo(52, false)}
          </div>
        </BottomSheet>
      ) : aberto ? (
        <div
          ref={painelRef}
          id={idMenu}
          role={vista === 'menu' ? 'menu' : 'dialog'}
          aria-label={vista === 'menu' ? rotuloBloco : tituloFonte}
          onKeyDown={onTecladoMenu}
          className="absolute top-full right-0 z-40 mt-1 flex w-[248px] flex-col gap-0.5 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-800 dark:bg-gray-900"
        >
          {vista === 'fonte' ? (
            <span className="px-2 pt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
              {tituloFonte}
            </span>
          ) : null}
          {conteudo(44, true)}
        </div>
      ) : null}
      {temReportar ? (
        <BotaoReportarDado
          ticker={ticker}
          classe={classe}
          bloco={bloco}
          contexto={contexto}
          variante="controlado"
          aberto={formAberto}
          onFechar={() => {
            setFormAberto(false);
            botaoRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
