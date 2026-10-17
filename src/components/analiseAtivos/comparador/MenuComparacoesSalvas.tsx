'use client';

/**
 * "Comparações salvas (n) ▾" na barra do Comparador (bloco 1, fatia B; salvos && comparador). Só
 * aparece com n > 0 (todas as classes; o item diz a classe). Abre a ListaComparacoesSalvas
 * (variante popover, fatia 0) num popover no computador ou num BottomSheet no celular; abrir uma
 * comparação navega com os dados de hoje — no celular, depois de desfazer a entrada do sheet no
 * histórico. Controlado (`aberto`/`onAlternar`): o "Comparação salva ✓" e o "Ver salvas" do aviso
 * também abrem. Consultor: o botão aparece desabilitado com o title das comparações pessoais.
 */
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CamadaEscolha } from '@/components/analiseAtivos/ativo/acoes/SheetSalvarEmListas';
import ListaComparacoesSalvas from '@/components/analiseAtivos/salvos/compartilhados/ListaComparacoesSalvas';
import { useComparacoesSalvas } from '@/hooks/useAnaliseAtivosSalvos';
import { useAuth } from '@/hooks/useAuth';
import { useMobileHistoryLayer } from '@/hooks/useMobileHistoryLayer';
import { formatarTexto } from '@/services/analiseAtivos/textos';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';

const T = TEXTOS_SALVOS.comparacoes;
const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';
const BOTAO = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium whitespace-nowrap text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-55 dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90 dark:hover:bg-white/[0.06] ${FOCO}`;

export interface MenuComparacoesSalvasProps {
  aberto: boolean;
  onAlternar: (aberto: boolean) => void;
  celular: boolean;
  larguraToda?: boolean;
}

export default function MenuComparacoesSalvas({
  aberto,
  onAlternar,
  celular,
  larguraToda = false,
}: MenuComparacoesSalvasProps) {
  const router = useRouter();
  const consulta = useComparacoesSalvas();
  const { actingClient } = useAuth();
  const botaoRef = useRef<HTMLButtonElement>(null);
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const fechar = useCallback(() => onAlternar(false), [onAlternar]);
  const { fecharEntao } = useMobileHistoryLayer(aberto, fechar, celular);

  const bloqueado = !!actingClient || consulta.data?.podeSalvar === false;
  const n = consulta.data?.comparacoes.length ?? 0;
  if (!bloqueado && n === 0) return null;

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        className={`${BOTAO} ${larguraToda ? 'w-full' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={bloqueado ? undefined : aberto}
        disabled={bloqueado}
        title={bloqueado ? TEXTOS_SALVOS.consultor.titleComparacoes : undefined}
        onClick={() => {
          setAncora(botaoRef.current);
          onAlternar(!aberto);
        }}
        data-menu-comparacoes-salvas=""
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-4 w-4 flex-none"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
        {n > 0 ? formatarTexto(T.botaoSalvasContagem, { n }) : T.botaoSalvas}
        <span aria-hidden="true">▾</span>
      </button>
      {!bloqueado ? (
        <CamadaEscolha
          aberto={aberto}
          onFechar={fechar}
          ancora={ancora ?? botaoRef.current}
          rotulo={T.lista.titulo}
          titulo={T.lista.titulo}
          celular={celular}
          largura={380}
          dataCamada="comparacoes-salvas"
        >
          <ListaComparacoesSalvas
            variante="popover"
            onFechar={fechar}
            onAbrir={(c) => fecharEntao(() => router.push(c.href))}
          />
        </CamadaEscolha>
      ) : null}
    </>
  );
}
