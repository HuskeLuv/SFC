'use client';

/**
 * "Exportar CSV" do Raio-X (Bloco D, fatia A). O arquivo é gerado no servidor
 * (GET …/raio-x?formato=csv, decisão 13) e baixado por baixarCsvRaioX (no PWA do iOS usa o
 * compartilhamento de arquivo).
 *
 * - Gerando: "Gerando CSV…" com spinner, desabilitado e aria-busy.
 * - Sucesso: aviso (role=status) com o nome do arquivo por 5 s.
 * - Erro: aviso (role=alert) com "Tentar de novo".
 * - Alvo de 44px em todos os tamanhos (decisão 13). Cores da paleta + cinzas do app.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { baixarCsvRaioX } from '@/hooks/useAnaliseAtivosBlocoD';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { formatarTexto } from '@/services/analiseAtivos/textosTela';

const T = TEXTOS_RAIO_X.csv;
export const AVISO_CSV_MS = 5000;

const FOCO =
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

type Aviso = { tipo: 'ok'; nome: string } | { tipo: 'erro' } | null;

function IconeBaixar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0">
      <path
        d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface BotaoExportarCsvProps {
  ticker: string;
  className?: string;
  /** injeção para teste */
  baixar?: (ticker: string) => Promise<{ nome: string }>;
}

export default function BotaoExportarCsv({
  ticker,
  className = '',
  baixar = baixarCsvRaioX,
}: BotaoExportarCsvProps) {
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const exportar = useCallback(async () => {
    if (gerando) return;
    setGerando(true);
    setAviso(null);
    if (timer.current) clearTimeout(timer.current);
    try {
      const { nome } = await baixar(ticker);
      if (!montado.current) return;
      setAviso({ tipo: 'ok', nome });
      timer.current = setTimeout(() => setAviso(null), AVISO_CSV_MS);
    } catch {
      if (montado.current) setAviso({ tipo: 'erro' });
    } finally {
      if (montado.current) setGerando(false);
    }
  }, [baixar, gerando, ticker]);

  const avisoEl =
    aviso && typeof document !== 'undefined'
      ? createPortal(
          <div
            role={aviso.tipo === 'erro' ? 'alert' : 'status'}
            data-aviso-csv={aviso.tipo}
            className="fixed inset-x-4 bottom-24 z-[100000] mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-[#1D2939] px-4 py-2.5 text-sm text-white shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-max sm:-translate-x-1/2 lg:bottom-6 dark:bg-[#2E3440]"
          >
            <span className="min-w-0 break-words">
              {aviso.tipo === 'ok' ? formatarTexto(T.baixado, { valor: aviso.nome }) : T.erro}
            </span>
            {aviso.tipo === 'erro' ? (
              <button
                type="button"
                onClick={() => void exportar()}
                className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 font-semibold text-[#6E9DC4] underline-offset-2 hover:underline ${FOCO}`}
              >
                {T.tentarNovamente}
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => void exportar()}
        disabled={gerando}
        aria-busy={gerando || undefined}
        data-exportar-csv=""
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-progress disabled:opacity-70 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/[0.04] ${FOCO} ${className}`}
      >
        {gerando ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-[#0079F2] motion-reduce:animate-none dark:border-gray-600 dark:border-t-[#6E9DC4]"
          />
        ) : (
          <IconeBaixar />
        )}
        {gerando ? T.gerando : T.botao}
      </button>
      {avisoEl}
    </>
  );
}
