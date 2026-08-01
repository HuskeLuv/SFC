'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useCsrf } from '@/hooks/useCsrf';
import { queryKeys } from '@/lib/queryKeys';
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
 */

interface ImportPlanilhaModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
}

type Passo = 'upload' | 'preview' | 'resultado';

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
  const motivosIgnorados = new Map<string, number>();
  preview?.plan.ignorados.forEach((i) =>
    motivosIgnorados.set(i.motivo, (motivosIgnorados.get(i.motivo) ?? 0) + 1),
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        className="mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Importar planilha FLC
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {passo === 'upload' && 'Envie a planilha "FLC + Carteira Investimentos" (.xlsx)'}
            {passo === 'preview' && `Prévia — nada foi gravado ainda (${preview?.arquivo})`}
            {passo === 'resultado' && `Resultado da importação (${preview?.arquivo})`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
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
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-600 dark:text-gray-300"
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
                  className="w-32 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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
              <div className="grid grid-cols-5 gap-2">
                <Chip label="células a gravar" value={resumo.celulas} />
                <Chip label="itens novos" value={resumo.itensNovos} />
                <Chip
                  label="conflitos"
                  value={resumo.conflitos}
                  tone={resumo.conflitos > 0 ? 'warn' : 'muted'}
                />
                <Chip label="já iguais" value={resumo.jaIguais} tone="muted" />
                <Chip label="ignorados" value={resumo.ignorados} tone="muted" />
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
                  <div className="mb-3 max-h-32 overflow-y-auto text-xs text-gray-600 dark:text-gray-300">
                    {conflitos.map((c, i) => (
                      <p key={i}>
                        {c.grupo} › {c.item} ({MESES_ABREV[c.mes]}): planilha {brl(c.valorPlanilha)}{' '}
                        × app {brl(c.valorApp)}
                      </p>
                    ))}
                  </div>
                  <div className="flex gap-4 text-sm text-gray-700 dark:text-gray-300">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={politica === 'sobrescrever'}
                        onChange={() => setPolitica('sobrescrever')}
                      />
                      Usar valores da planilha
                    </label>
                    <label className="flex items-center gap-1.5">
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
                <summary className="cursor-pointer font-medium text-gray-900 dark:text-white">
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

              {motivosIgnorados.size > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-gray-900 dark:text-white">
                    Linhas ignoradas ({preview.plan.ignorados.length})
                  </summary>
                  <div className="mt-2 max-h-40 overflow-y-auto text-xs text-gray-600 dark:text-gray-300">
                    {[...motivosIgnorados.entries()].map(([motivo, n]) => (
                      <p key={motivo}>
                        {n}× {motivo}
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
              <div className="grid grid-cols-4 gap-2">
                <Chip label="células gravadas" value={resultado.relatorio.celulasGravadas} />
                <Chip label="itens criados" value={resultado.relatorio.itensCriados} />
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

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          {passo === 'upload' && (
            <>
              <button
                onClick={onClose}
                disabled={loading}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                onClick={gerarPrevia}
                disabled={!file || loading}
                className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Voltar
              </button>
              <button
                onClick={importar}
                disabled={
                  loading ||
                  (resumo?.celulas === 0 && resumo?.itensNovos === 0 && conflitos.length === 0)
                }
                className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Importando...' : `Importar no ano ${ano}`}
              </button>
            </>
          )}
          {passo === 'resultado' && (
            <button
              onClick={onClose}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
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
