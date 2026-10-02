'use client';

/**
 * Minha tese — PRIVADA (fatia D, decisões 2 e 11). Um texto por usuário e ativo, até 10.000
 * caracteres, salvamento automático 1,5 s depois da última tecla e ao sair do campo, sem histórico.
 *
 * Estados: carregando · vazia (perguntas-guia + "Escrever minha tese") · editando (contador,
 * StatusSalvamento em aria-live: pendente/salvando/salvo) · salva (texto + data + Editar) · erro
 * (texto preservado + "Tentar de novo"). Aviso do navegador ao sair com alteração não salva.
 * Consultor agindo pelo cliente: card "A tese é pessoal de cada usuário" — nada é lido nem gravado
 * (a API também responde 403).
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSalvarTese, useTese } from '@/hooks/useAnaliseAtivos';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import { TESE_MAX_CARACTERES } from '@/types/analiseAtivosApi';
import StatusSalvamento, { horaCurta, type EstadoSalvamento } from './StatusSalvamento';
import {
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
} from '@/components/analiseAtivos/ativo/usuario/AcoesCarteiraAtivo';
import type { BlocoTeseProps } from '@/types/analiseAtivosApi';

export type { BlocoTeseProps };

export const DEBOUNCE_TESE_MS = 1500;

const CARD =
  'flex min-w-0 flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]';
const LINK = `inline-flex min-h-11 items-center text-sm font-medium ${COR_LINK.classes} hover:underline`;
const t = TEXTOS_TELA.tese;

function CadeadoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function Cabecalho({ idTitulo, selo }: { idTitulo: string; selo: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={idTitulo} className="text-base font-semibold text-gray-800 dark:text-white/90">
        {TEXTOS_TELA.blocos.tese}
      </h2>
      <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 dark:text-gray-400">
        <CadeadoIcon />
        {selo}
      </span>
    </div>
  );
}

function dataHora(iso: string): { data: string; hora: string } {
  const d = new Date(iso);
  return {
    data: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: horaCurta(iso),
  };
}

export default function BlocoTese({ ticker }: BlocoTeseProps) {
  const { actingClient } = useAuth();
  const idTitulo = useId();
  if (actingClient) {
    return (
      <section aria-labelledby={idTitulo} className={CARD} data-tese="pessoal">
        <Cabecalho idTitulo={idTitulo} selo={t.pessoal} />
        <div className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
          <span className="mt-0.5 text-gray-500 dark:text-gray-400">
            <CadeadoIcon />
          </span>
          <p>
            <strong className="font-semibold text-gray-800 dark:text-white/90">{t.pessoal}.</strong>{' '}
            {t.pessoalConsultor}
          </p>
        </div>
      </section>
    );
  }
  return <TeseDoUsuario ticker={ticker.toUpperCase()} idTitulo={idTitulo} />;
}

function TeseDoUsuario({ ticker, idTitulo }: { ticker: string; idTitulo: string }) {
  const q = useTese(ticker);
  const salvarM = useSalvarTese(ticker);
  const idCampo = useId();
  const idContador = useId();
  const idStatus = useId();

  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<EstadoSalvamento>('ocioso');
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [confirmandoApagar, setConfirmandoApagar] = useState(false);

  const textoRef = useRef('');
  const ultimoSalvoRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emVooRef = useRef(false);
  const deNovoRef = useRef(false);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const mutateRef = useRef(salvarM.mutateAsync);
  mutateRef.current = salvarM.mutateAsync;

  // Servidor → estado local (fora da edição, para não sobrescrever o que se digita).
  const corpoServidor = q.data?.corpo;
  const atualizadoServidor = q.data?.atualizadoEm ?? null;
  useEffect(() => {
    if (editando || corpoServidor === undefined) return;
    ultimoSalvoRef.current = corpoServidor;
    textoRef.current = corpoServidor;
    setTexto(corpoServidor);
    setSalvoEm(atualizadoServidor);
  }, [corpoServidor, atualizadoServidor, editando]);

  const limparTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /** Grava o texto atual se mudou. Devolve false se der erro. */
  const salvarAgora = useCallback(async (): Promise<boolean> => {
    limparTimer();
    const atual = textoRef.current;
    if (atual.trim() === ultimoSalvoRef.current.trim()) {
      setEstado((e) => (e === 'pendente' ? (ultimoSalvoRef.current ? 'salvo' : 'ocioso') : e));
      return true;
    }
    if (emVooRef.current) {
      deNovoRef.current = true;
      return true;
    }
    emVooRef.current = true;
    setEstado('salvando');
    let ok = true;
    try {
      const r = await mutateRef.current({ corpo: atual });
      ultimoSalvoRef.current = atual.trim();
      setSalvoEm(r.atualizadoEm);
      setEstado(textoRef.current.trim() === atual.trim() ? 'salvo' : 'pendente');
    } catch {
      ok = false;
      setEstado('erro');
    } finally {
      emVooRef.current = false;
    }
    if (ok && deNovoRef.current) {
      deNovoRef.current = false;
      return salvarAgora();
    }
    deNovoRef.current = false;
    return ok;
  }, []);

  const agendar = useCallback(() => {
    limparTimer();
    timerRef.current = setTimeout(() => void salvarAgora(), DEBOUNCE_TESE_MS);
  }, [salvarAgora]);

  // Aviso do navegador com alteração pendente.
  const temPendencia = estado === 'pendente' || estado === 'salvando' || estado === 'erro';
  useEffect(() => {
    if (!temPendencia) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [temPendencia]);

  // Saiu da página (navegação no app) com digitação pendente: grava o que estava no campo.
  useEffect(
    () => () => {
      if (timerRef.current && textoRef.current.trim() !== ultimoSalvoRef.current.trim()) {
        clearTimeout(timerRef.current);
        void mutateRef.current({ corpo: textoRef.current }).catch(() => undefined);
      }
    },
    [],
  );

  useEffect(() => {
    if (editando) campoRef.current?.focus();
  }, [editando]);

  const aoDigitar = (valor: string) => {
    const v = valor.slice(0, TESE_MAX_CARACTERES);
    textoRef.current = v;
    setTexto(v);
    setEstado('pendente');
    agendar();
  };

  const concluir = async () => {
    const ok = await salvarAgora();
    if (ok) {
      setEditando(false);
      setEstado(ultimoSalvoRef.current ? 'salvo' : 'ocioso');
    }
  };

  const apagar = async () => {
    limparTimer();
    textoRef.current = '';
    setTexto('');
    setConfirmandoApagar(false);
    const ok = await salvarAgora();
    if (ok) setEditando(false);
  };

  const cabecalho = <Cabecalho idTitulo={idTitulo} selo={t.privada} />;

  if (q.isPending) {
    return (
      <section aria-labelledby={idTitulo} aria-busy="true" className={CARD} data-tese="carregando">
        {cabecalho}
        <span className="sr-only">{t.carregando}</span>
        <div className="h-20 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5" />
      </section>
    );
  }

  if (q.isError) {
    return (
      <section aria-labelledby={idTitulo} className={CARD} data-tese="erro-carregar">
        {cabecalho}
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-700 dark:text-gray-300">{t.erroCarregar}</span>
          <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void q.refetch()}>
            {t.tentarNovamente}
          </button>
        </div>
      </section>
    );
  }

  if (editando) {
    const n = texto.length;
    const noLimite = n >= TESE_MAX_CARACTERES;
    return (
      <section aria-labelledby={idTitulo} className={CARD} data-tese="editando">
        {cabecalho}
        <label htmlFor={idCampo} className="sr-only">
          {formatarTexto(t.rotuloCampo, { ticker })}
        </label>
        <textarea
          id={idCampo}
          ref={campoRef}
          value={texto}
          maxLength={TESE_MAX_CARACTERES}
          onChange={(e) => aoDigitar(e.target.value)}
          onBlur={() => void salvarAgora()}
          aria-describedby={`${idContador} ${idStatus}`}
          placeholder={t.placeholder}
          rows={6}
          className="min-h-[140px] w-full resize-y rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-[15px] leading-relaxed text-gray-800 placeholder:text-gray-400 focus:border-[#396CAA] focus:ring-2 focus:ring-[#396CAA]/20 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-[#6E9DC4]"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <span
              id={idContador}
              className={`text-[13px] tabular-nums ${noLimite ? 'font-semibold text-gray-800 dark:text-white/90' : 'text-gray-500 dark:text-gray-400'}`}
            >
              {formatarTexto(t.contador, {
                n: n.toLocaleString('pt-BR'),
                max: TESE_MAX_CARACTERES.toLocaleString('pt-BR'),
              })}
              {noLimite
                ? ` · ${formatarTexto(t.limite, { max: TESE_MAX_CARACTERES.toLocaleString('pt-BR') })}`
                : ''}
            </span>
            <StatusSalvamento
              id={idStatus}
              estado={estado}
              salvoEm={salvoEm}
              onTentarNovamente={() => void salvarAgora()}
            />
          </div>
          <button
            type="button"
            className={BOTAO_PRIMARIO}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void concluir()}
          >
            {t.concluir}
          </button>
        </div>
      </section>
    );
  }

  // Salva (com texto)
  if (texto.trim().length > 0) {
    const quando = salvoEm ? dataHora(salvoEm) : null;
    return (
      <section aria-labelledby={idTitulo} className={CARD} data-tese="salva">
        {cabecalho}
        <div className="border-l-[3px] border-gray-200 pl-3 text-[15px] leading-relaxed whitespace-pre-wrap text-gray-800 dark:border-gray-700 dark:text-white/90">
          {texto}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-gray-500 dark:text-gray-400">
          <span aria-live="polite">{quando ? formatarTexto(t.salvoEm, quando) : ''}</span>
          {confirmandoApagar ? (
            <div role="group" className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-gray-700 dark:text-gray-300">
                {formatarTexto(t.apagarConfirmar, { ticker })}
              </span>
              <button
                type="button"
                className="inline-flex min-h-11 items-center font-semibold text-[#D92D20] hover:underline dark:text-[#F97066]"
                onClick={() => void apagar()}
              >
                {t.apagar}
              </button>
              <button type="button" className={LINK} onClick={() => setConfirmandoApagar(false)}>
                {TEXTOS_TELA.naCarteira.cancelar}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4">
              <button
                type="button"
                className={LINK}
                onClick={() => {
                  setEstado(salvoEm ? 'salvo' : 'ocioso');
                  setEditando(true);
                }}
              >
                {t.editar}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center text-sm font-medium text-gray-500 hover:underline dark:text-gray-400"
                onClick={() => setConfirmandoApagar(true)}
              >
                {t.apagar}
              </button>
            </div>
          )}
        </div>
        {estado === 'erro' ? (
          <StatusSalvamento estado="erro" onTentarNovamente={() => void salvarAgora()} />
        ) : null}
      </section>
    );
  }

  // Vazia
  return (
    <section aria-labelledby={idTitulo} className={CARD} data-tese="vazia">
      {cabecalho}
      <p className="text-sm text-gray-600 dark:text-gray-300">{t.perguntas}</p>
      <div>
        <button
          type="button"
          className={BOTAO_SECUNDARIO}
          onClick={() => {
            setEstado('ocioso');
            setEditando(true);
          }}
        >
          {t.escrever}
        </button>
      </div>
      {estado === 'erro' ? (
        <StatusSalvamento estado="erro" onTentarNovamente={() => void salvarAgora()} />
      ) : null}
    </section>
  );
}
