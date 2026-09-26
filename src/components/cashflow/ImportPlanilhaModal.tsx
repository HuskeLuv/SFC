'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
import { shouldHandleLayerEvent, useTopLayer } from '@/components/ui/sheet/layerStack';
import type { FlcImportPlan } from '@/services/cashflow/import/mapFlcToCashflow';
import type {
  FlcImportRelatorio,
  FlcPoliticaConflito,
} from '@/services/cashflow/import/executeFlcImportPlan';

/**
 * Wizard de importação da planilha FLC (3 passos: upload → prévia → resultado).
 * A prévia vem de /api/cashflow/import/preview (não grava nada); o commit
 * reenvia o MESMO arquivo para /api/cashflow/import/commit, que recalcula o
 * plano no servidor e grava. Pós-commit, o cache do fluxo de caixa é atualizado
 * com a árvore devolvida (mesmo padrão do batch-update).
 *
 * Celular (PWA fase 2, protótipo cenário i): abaixo de lg o mesmo modal vira TELA CHEIA com
 * "Passo N de 3", contadores em 3 colunas e botões de 44px — só tokens `max-lg:`/`lg:hidden`, as
 * mesmas chamadas. Em qualquer largura: `role=dialog` + `aria-modal` e Esc fecha (só quando é a
 * camada do topo e nada está gravando).
 */

interface ImportPlanilhaModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
}

type Passo = 'upload' | 'preview' | 'resultado';

const PASSO_NUMERO: Record<Passo, number> = { upload: 1, preview: 2, resultado: 3 };
const PASSO_NOME: Record<Passo, string> = {
  upload: 'Arquivo',
  preview: 'Prévia',
  resultado: 'Resultado',
};

/** Botões do rodapé: 44px e largura dividida no celular. */
const FOOT_BTN_MOBILE = 'max-lg:min-h-11 max-lg:flex-1';

interface PreviewData {
  ano: number;
  arquivo: string;
  plan: FlcImportPlan;
}

interface CommitData {
  success: boolean;
  relatorio: FlcImportRelatorio;
}

const MESES_ABREV = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

const Chip: React.FC<{ label: string; value: number; tone?: 'ok' | 'warn' | 'muted' }> = ({
  label,
  value,
  tone = 'ok',
}) => {
  const tones = {
    ok: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400',
    warn: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    muted: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  };
  return (
    <div className={`rounded-md px-3 py-2 text-center ${tones[tone]}`}>
      <div className="text-lg font-semibold leading-tight">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
};

export const ImportPlanilhaModal: React.FC<ImportPlanilhaModalProps> = ({
  isOpen,
  onClose,
  year,
}) => {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();

  const [passo, setPasso] = useState<Passo>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [ano, setAno] = useState<number>(year);
  const [politica, setPolitica] = useState<FlcPoliticaConflito>('sobrescrever');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [resultado, setResultado] = useState<CommitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const titleId = useId();
  // Esc fecha só quando este modal é a camada do topo (pilha de overlays do celular) e não está
  // gravando — o mesmo critério do toque no fundo.
  const { layerId } = useTopLayer(isOpen);
  const onCloseRef = useRef(onClose);
  const loadingRef = useRef(loading);
  useEffect(() => {
    onCloseRef.current = onClose;
    loadingRef.current = loading;
  }, [onClose, loading]);
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || loadingRef.current) return;
      if (!shouldHandleLayerEvent(layerId, event)) return;
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, layerId]);

  useEffect(() => {
    if (isOpen) {
      setPasso('upload');
      setFile(null);
      setAno(year);
      setPolitica('sobrescrever');
      setPreview(null);
      setResultado(null);
      setErro(null);
    }
  }, [isOpen, year]);

  if (!isOpen || typeof window === 'undefined') return null;

  const montarForm = (): FormData => {
    const form = new FormData();
    if (file) form.append('file', file);
    form.append('ano', String(ano));
    return form;
  };

  const gerarPrevia = async () => {
    if (!file) return;
    setLoading(true);
    setErro(null);
    try {
      const response = await csrfFetch('/api/cashflow/import/preview', {
        method: 'POST',
        body: montarForm(),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setErro(body?.error ?? 'Não foi possível ler a planilha');
        return;
      }
      setPreview(body);
      setPasso('preview');
    } catch {
      setErro('Falha de rede ao enviar a planilha');
    } finally {
      setLoading(false);
    }
  };

  const importar = async () => {
    if (!file) return;
    setLoading(true);
    setErro(null);
    try {
      const form = montarForm();
      form.append('politicaConflito', politica);
      const response = await csrfFetch('/api/cashflow/import/commit', {
        method: 'POST',
        body: form,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setErro(body?.error ?? 'Não foi possível importar a planilha');
        return;
      }
      if (body?.groups) {
        queryClient.setQueryData(queryKeys.cashflow.year(ano), body.groups);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.planejamento.all });
      void queryClient.invalidateQueries({ queryKey: ['planejamento-sonhos'] });
      setResultado(body);
      setPasso('resultado');
    } catch {
      setErro('Falha de rede ao importar a planilha');
    } finally {
      setLoading(false);
    }
  };

  const resumo = preview?.plan.resumo;
  const conflitos = preview
    ? preview.plan.grupos.flatMap((g) =>
        g.itens.flatMap((i) =>
          i.conflitos.map((c) => ({ grupo: g.destino.nome, item: i.label, ...c })),
        ),
      )
    : [];
  const comentarios = preview
    ? preview.plan.grupos.flatMap((g) =>
        g.itens.flatMap((i) =>
          i.comentarios.map((c) => ({ grupo: g.destino.nome, item: i.label, ...c })),
        ),
      )
    : [];

  return createPortal(
    <div
      data-mf-overlay
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 max-lg:items-stretch max-lg:p-0"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-mf-import-planilha=""
        className="mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800 max-lg:m-0 max-lg:h-[100dvh] max-lg:max-h-none max-lg:max-w-none max-lg:rounded-none max-lg:pt-[env(safe-area-inset-top)] max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700 max-lg:px-4 max-lg:py-3">
          <div className="flex items-center gap-2">
            <h2
              id={titleId}
              className="text-lg font-semibold text-gray-900 dark:text-white max-lg:min-w-0 max-lg:flex-1"
            >
              Importar planilha FLC
            </h2>
            {/* Celular: fechar no topo (o rodapé também tem Cancelar/Fechar). */}
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              aria-label="Fechar sem importar"
              className="ml-auto hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-600 active:bg-gray-100 disabled:opacity-50 max-lg:inline-flex dark:text-gray-300 dark:active:bg-white/5"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          {/* Celular: progresso dos 3 passos (upload → prévia → resultado). */}
          <div className="mt-2 hidden max-lg:block">
            <div className="flex gap-1.5" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <i
                  key={n}
                  className={`h-1 flex-1 rounded-sm ${
                    n <= PASSO_NUMERO[passo] ? 'bg-[#0079F2]' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              ))}
            </div>
            <p className="mt-1.5 text-[13px] text-gray-500 dark:text-gray-400">
              Passo {PASSO_NUMERO[passo]} de 3 ·{' '}
              <b className="font-semibold text-gray-800 dark:text-white/90">{PASSO_NOME[passo]}</b>
            </p>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {passo === 'upload' && 'Envie a planilha "FLC + Carteira Investimentos" (.xlsx)'}
            {passo === 'preview' && `Prévia — nada foi gravado ainda (${preview?.arquivo})`}
            {passo === 'resultado' && `Resultado da importação (${preview?.arquivo})`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 max-lg:px-4">
          {erro && (
            <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
              {erro}
            </div>
          )}

          {passo === 'upload' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Arquivo (.xlsx)
                </label>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600 dark:text-gray-300 max-lg:file:min-h-11"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ano de destino
                </label>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={ano}
                  onChange={(e) => setAno(Number(e.target.value))}
                  className="w-32 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white max-lg:min-h-11"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  A planilha não tem ano — os 12 meses serão gravados neste ano. Para vários anos,
                  repita a importação com um arquivo por ano.
                </p>
              </div>
            </div>
          )}

          {passo === 'preview' && resumo && (
            <div className="space-y-4">
              <div className="grid grid-cols-6 gap-2 max-lg:grid-cols-3 max-[359px]:grid-cols-2">
                <Chip label="células a gravar" value={resumo.celulas} />
                <Chip label="itens novos" value={resumo.itensNovos} />
                <Chip
                  label="conflitos"
                  value={resumo.conflitos}
                  tone={resumo.conflitos > 0 ? 'warn' : 'muted'}
                />
                <Chip label="já iguais" value={resumo.jaIguais} tone="muted" />
                <Chip
                  label="comentários"
                  value={resumo.comentarios}
                  tone={resumo.comentarios > 0 ? 'ok' : 'muted'}
                />
                <Chip label="cores" value={resumo.cores} tone={resumo.cores > 0 ? 'ok' : 'muted'} />
              </div>

              {preview.plan.avisos.length > 0 && (
                <div className="rounded-md bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
                  {preview.plan.avisos.map((a, i) => (
                    <p key={i}>• {a}</p>
                  ))}
                </div>
              )}

              {conflitos.length > 0 && (
                <div className="rounded-md border border-amber-200 p-3 dark:border-amber-500/30">
                  <p className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                    Conflitos — a célula já tem valor diferente no app
                  </p>
                  <div
                    data-mf-scroll-x=""
                    className="mb-3 max-h-32 overflow-y-auto text-xs text-gray-600 dark:text-gray-300 max-lg:overflow-x-auto max-lg:break-words"
                  >
                    {conflitos.map((c, i) => (
                      <p key={i}>
                        {c.grupo} › {c.item} ({MESES_ABREV[c.mes]}): planilha {brl(c.valorPlanilha)}{' '}
                        × app {brl(c.valorApp)}
                      </p>
                    ))}
                  </div>
                  <div className="flex gap-4 text-sm text-gray-700 dark:text-gray-300 max-lg:flex-col max-lg:gap-0">
                    <label className="flex items-center gap-1.5 max-lg:min-h-11">
                      <input
                        type="radio"
                        checked={politica === 'sobrescrever'}
                        onChange={() => setPolitica('sobrescrever')}
                      />
                      Usar valores da planilha
                    </label>
                    <label className="flex items-center gap-1.5 max-lg:min-h-11">
                      <input
                        type="radio"
                        checked={politica === 'manter'}
                        onChange={() => setPolitica('manter')}
                      />
                      Manter valores do app
                    </label>
                  </div>
                </div>
              )}

              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-gray-900 dark:text-white max-lg:flex max-lg:min-h-11 max-lg:items-center">
                  O que será importado ({preview.plan.grupos.length} grupos)
                </summary>
                <div className="mt-2 max-h-40 overflow-y-auto text-xs text-gray-600 dark:text-gray-300">
                  {preview.plan.grupos.map((g) => (
                    <p key={`${g.chave}-${g.nomePlanilha}`}>
                      <span className="font-medium">{g.destino.nome}</span>: {g.itens.length} itens
                      ({g.itens.filter((i) => i.destino.tipo === 'criar').length} novos),{' '}
                      {g.itens.reduce((n, i) => n + i.escritas.length, 0)} células
                    </p>
                  ))}
                </div>
              </details>

              {comentarios.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-gray-900 dark:text-white max-lg:flex max-lg:min-h-11 max-lg:items-center">
                    Comentários das células ({comentarios.length}) — aparecem ao passar o mouse
                  </summary>
                  <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-gray-600 dark:text-gray-300">
                    {comentarios.map((c, i) => (
                      <p key={i}>
                        <span className="font-medium">
                          {c.grupo} › {c.item} ({MESES_ABREV[c.mes]}):
                        </span>{' '}
                        &ldquo;{c.texto}&rdquo;
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {passo === 'resultado' && resultado && (
            <div className="space-y-4">
              <div
                className={`rounded-md px-4 py-3 text-sm ${
                  resultado.success
                    ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                    : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400'
                }`}
              >
                {resultado.success
                  ? 'Importação concluída com sucesso.'
                  : 'Importação concluída com erros — veja o detalhe abaixo.'}
              </div>
              <div className="grid grid-cols-6 gap-2 max-lg:grid-cols-3 max-[359px]:grid-cols-2">
                <Chip label="células gravadas" value={resultado.relatorio.celulasGravadas} />
                <Chip label="itens criados" value={resultado.relatorio.itensCriados} />
                <Chip label="comentários" value={resultado.relatorio.comentariosGravados} />
                <Chip label="cores" value={resultado.relatorio.coresGravadas} />
                <Chip
                  label="porquês preenchidos"
                  value={resultado.relatorio.significadosGravados}
                />
                <Chip
                  label="conflitos sobrescritos"
                  value={resultado.relatorio.conflitosSobrescritos}
                  tone="muted"
                />
                <Chip
                  label="conflitos mantidos"
                  value={resultado.relatorio.conflitosMantidos}
                  tone="muted"
                />
              </div>
              {resultado.relatorio.erros.length > 0 && (
                <div className="rounded-md bg-red-50 px-4 py-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
                  {resultado.relatorio.erros.map((e, i) => (
                    <p key={i}>
                      {e.label}: {e.erro}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700 max-lg:px-4 max-lg:py-3">
          {passo === 'upload' && (
            <>
              <button
                onClick={onClose}
                disabled={loading}
                className={`${FOOT_BTN_MOBILE} rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600`}
              >
                Cancelar
              </button>
              <button
                onClick={gerarPrevia}
                disabled={!file || loading}
                className={`${FOOT_BTN_MOBILE} rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {loading ? 'Lendo planilha...' : 'Gerar prévia'}
              </button>
            </>
          )}
          {passo === 'preview' && (
            <>
              <button
                onClick={() => setPasso('upload')}
                disabled={loading}
                className={`${FOOT_BTN_MOBILE} rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600`}
              >
                Voltar
              </button>
              <button
                onClick={importar}
                disabled={
                  loading ||
                  (resumo?.celulas === 0 &&
                    resumo?.itensNovos === 0 &&
                    resumo?.comentarios === 0 &&
                    conflitos.length === 0)
                }
                className={`${FOOT_BTN_MOBILE} rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {loading ? 'Importando...' : `Importar no ano ${ano}`}
              </button>
            </>
          )}
          {passo === 'resultado' && (
            <button
              onClick={onClose}
              className={`${FOOT_BTN_MOBILE} rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600`}
            >
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
