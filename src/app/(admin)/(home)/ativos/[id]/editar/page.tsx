'use client';

import { logger } from '@/lib/logger';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import Button from '@/components/ui/button/Button';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { Modal } from '@/components/ui/modal';
import { Dropdown } from '@/components/ui/dropdown/Dropdown';
import { useCsrf } from '@/hooks/useCsrf';
import { DropdownItem } from '@/components/ui/dropdown/DropdownItem';
import EditableField from '@/components/carteira/shared/EditableField';
import InstitutionPicker from '@/components/carteira/wizard/shared/InstitutionPicker';
import { invalidatePortfolioDerivedQueries } from '@/lib/invalidatePortfolio';
import { useObjetivos } from '@/hooks/usePlanejamentoSonhos';
import { formatWallClockDate, toDateInputValue } from '@/utils/formatDate';
import { formatAssetDisplayTitle } from '@/utils/assetDisplayName';
import { ArrowRightIcon, ChevronDownIcon, ChevronLeftIcon, PlusIcon, TrashBinIcon } from '@/icons';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { MobileEditSheet } from '@/components/ui/sheet/MobileEditSheet';
import { ResponsiveCardList } from '@/components/ui/table/ResponsiveTable';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';

/** Celular (PWA fase 1): campos de 48px e 16px nos formulários desta página. */
const MOBILE_INPUT_CLASS =
  'h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-base text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white';
const MOBILE_LABEL_CLASS = 'mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400';

const MO_PAGE_SIZE = 6;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

// Datas de transação são armazenadas como UTC midnight (00:00:00Z do dia escolhido).
// Sem timeZone:'UTC', viewer em BRT vê o dia anterior — usar formatWallClockDate.
const formatDate = formatWallClockDate;

const parseDecimalInput = (raw: string): number => {
  const t = raw.trim();
  if (!t) return NaN;
  if (t.includes(',')) {
    return parseFloat(t.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(t);
};

interface EditableDateCellProps {
  value: string;
  /** No celular (sheet), retorno `false` ou exceção = falha e o sheet fica aberto. */
  onSubmit: (value: string) => void | boolean | Promise<void | boolean>;
  inputClassName?: string;
  /** Rótulo do campo no sheet do celular. */
  mobileLabel?: string;
}

const EditableDateCell: React.FC<EditableDateCellProps> = ({
  value,
  onSubmit,
  inputClassName = 'w-full max-w-[9rem] rounded border border-gray-300 px-1 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white',
  mobileLabel = 'Data',
}) => {
  const isBelowLg = useIsBelowLg();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(toDateInputValue(value));

  useEffect(() => {
    setInputValue(toDateInputValue(value));
  }, [value]);

  const handleSubmit = () => {
    onSubmit(inputValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') {
      setInputValue(toDateInputValue(value));
      setIsEditing(false);
    }
  };

  // Celular: sheet com o calendário nativo, chamando o MESMO onSubmit ('yyyy-mm-dd').
  if (isBelowLg) {
    return (
      <>
        <button
          type="button"
          data-mf-edit="data"
          onClick={() => setSheetOpen(true)}
          aria-label={`Editar ${mobileLabel.toLowerCase()}: ${formatDate(value)}`}
          className={`${TABLE_MOBILE_STYLES.editButton} -mx-2 tabular-nums text-gray-900 dark:text-white`}
        >
          {formatDate(value)}
        </button>
        <MobileEditSheet
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={`Editar ${mobileLabel.toLowerCase()}`}
          label={mobileLabel}
          kind="date"
          initialValue={toDateInputValue(value)}
          onSubmit={(v) => onSubmit(String(v))}
        />
      </>
    );
  }

  return isEditing ? (
    <input
      type="date"
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onBlur={handleSubmit}
      onKeyDown={handleKeyDown}
      className={inputClassName}
      autoFocus
    />
  ) : (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className="text-left text-sm text-gray-800 dark:text-gray-200 hover:underline"
    >
      {formatDate(value)}
    </button>
  );
};

interface OperacaoRow {
  id: string;
  tipoOperacao: string;
  tipoRaw: string;
  quantity: number;
  price: number;
  total: number;
  date: string;
  fees: number | null;
  notes: string | null;
}

interface ProventoRow {
  id: string;
  tipo: string;
  dataCom: string;
  dataPagamento: string;
  precificarPor: string;
  valorTotal: number;
  quantidadeBase: number;
  impostoRenda: number | null;
}

interface ProventoDraft {
  tipo: string;
  dataCom: string;
  dataPagamento: string;
  precificarPor: string;
  valorTotal: string;
  quantidadeBase: string;
  impostoRenda: string;
}

interface EditarPayload {
  portfolioId: string;
  ticker: string;
  nome: string;
  instituicaoNome: string | null;
  instituicaoId: string | null;
  vinculoPlanejamento: { tipo: 'sonho' | 'aposentadoria'; objetivoId: string | null } | null;
  movimentacaoInicial: {
    id: string;
    date: string;
    quantity: number;
    price: number;
    total: number;
    fees: number | null;
  } | null;
  operacoes: OperacaoRow[];
  proventos: ProventoRow[];
}

/**
 * Vínculo do ativo com planejamento (sonho | aposentadoria): select simples
 * com as opções vivas do usuário; persiste via PATCH /api/ativos/[id]
 * (vinculoTipo/vinculoObjetivoId). Alterar o vínculo re-deriva o realizado
 * das linhas-espelho no fluxo de caixa.
 */
const VinculoPlanejamentoSelect: React.FC<{
  current: { tipo: 'sonho' | 'aposentadoria'; objetivoId: string | null } | null;
  onChange: (
    vinculoTipo: 'sonho' | 'aposentadoria' | null,
    vinculoObjetivoId: string | null,
  ) => void | Promise<void>;
}> = ({ current, onChange }) => {
  const { objetivos } = useObjetivos();
  const [saving, setSaving] = useState(false);
  const sonhos = objetivos.filter((o) => o.status !== 'Concluído' || o.id === current?.objetivoId);

  const value =
    current?.tipo === 'aposentadoria'
      ? 'aposentadoria'
      : current?.tipo === 'sonho' && current.objetivoId
        ? `sonho:${current.objetivoId}`
        : '';

  const handleChange = async (next: string) => {
    setSaving(true);
    try {
      if (next === 'aposentadoria') {
        await onChange('aposentadoria', null);
      } else if (next.startsWith('sonho:')) {
        await onChange('sonho', next.slice('sonho:'.length));
      } else {
        await onChange(null, null);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => void handleChange(e.target.value)}
      aria-label="Vínculo com planejamento"
      className="w-full max-w-md rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-brand-400 focus:outline-none disabled:opacity-60 max-lg:h-12 max-lg:rounded-xl max-lg:text-base dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
    >
      <option value="">Sem vínculo</option>
      <option value="aposentadoria">Aposentadoria</option>
      {sonhos.map((sonho) => (
        <option key={sonho.id} value={`sonho:${sonho.id}`}>
          Sonho: {sonho.name}
        </option>
      ))}
    </select>
  );
};

const defaultProventoDraft = (): ProventoDraft => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    tipo: 'Dividendos',
    dataCom: today,
    dataPagamento: today,
    precificarPor: 'valor',
    valorTotal: '0',
    quantidadeBase: '0',
    impostoRenda: '',
  };
};

/**
 * Bug #11 (relatório Maio/2026): select editável de instituição. Botão
 * estilizado por padrão; ao clicar em "Editar", expande para o
 * `InstitutionPicker` compartilhado (busca server-side debounced, mesmo
 * padrão do wizard de adicionar investimento — fix aplicado em 2026-05-19,
 * commit `788984b`). Antes carregava o catálogo inteiro com limit=500 num
 * `<select>` nativo: usável mas frágil (não escalava acima do limit, sem
 * filtro client-side de qualidade).
 */
const InstitutionSelect: React.FC<{
  currentId: string | null;
  currentNome: string | null;
  onChange: (id: string) => void | Promise<void>;
}> = ({ currentId, currentNome, onChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Estado local pra controlar o input enquanto o usuário digita.
  // Quando ele seleciona uma opção, dispara o save via onChange e fecha.
  const [draftId, setDraftId] = useState<string>(currentId ?? '');
  const [draftNome, setDraftNome] = useState<string>(currentNome ?? '');

  const handleEdit = () => {
    setDraftId(currentId ?? '');
    setDraftNome(currentNome ?? '');
    setIsEditing(true);
  };

  const handlePickerChange = async (next: { id: string; nome: string }) => {
    setDraftId(next.id);
    setDraftNome(next.nome);
    // Persiste apenas quando o usuário SELECIONA (id muda e fica não-vazio);
    // digitação no input apenas atualiza o draft.
    if (!next.id || next.id === currentId) return;
    setSaving(true);
    try {
      await onChange(next.id);
    } finally {
      setSaving(false);
      setIsEditing(false);
    }
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={handleEdit}
        className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm font-normal text-gray-800 transition-colors hover:bg-gray-100 max-lg:min-h-11 max-lg:text-base dark:text-gray-200 dark:hover:bg-gray-800"
        title="Alterar instituição"
      >
        <span>{currentNome ?? '—'}</span>
        <span className="text-xs text-brand-500">Editar</span>
      </button>
    );
  }

  return (
    <div className="w-full max-w-md">
      <InstitutionPicker
        endpoint="/api/institutions"
        responseShape="institutions"
        selectedId={draftId}
        selectedName={draftNome}
        onChange={handlePickerChange}
        label=""
        placeholder="Digite o nome da instituição (ex: Itaú, XP)"
      />
      <button
        type="button"
        onClick={() => setIsEditing(false)}
        disabled={saving}
        className="mt-1 text-xs text-gray-500 hover:text-gray-700 max-lg:min-h-11 max-lg:px-2 max-lg:text-sm dark:text-gray-400"
      >
        Cancelar
      </button>
    </div>
  );
};

const AtivoEditarContent = () => {
  const params = useParams();
  const router = useRouter();
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const id = params?.id as string;
  const [data, setData] = useState<EditarPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transacaoIdToDelete, setTransacaoIdToDelete] = useState<string | null>(null);
  const [confirmDeletePortfolio, setConfirmDeletePortfolio] = useState(false);
  const [apagarMenuOpen, setApagarMenuOpen] = useState(false);
  const [operacoesPage, setOperacoesPage] = useState(0);
  const [proventoEditingId, setProventoEditingId] = useState<string | 'new' | null>(null);
  const [proventoDraft, setProventoDraft] = useState<ProventoDraft | null>(null);
  const [proventoSaving, setProventoSaving] = useState(false);
  const [proventoDeleteId, setProventoDeleteId] = useState<string | null>(null);
  // PWA fase 1: abaixo de lg, movimentações e proventos em cartões e edição por sheet.
  const isBelowLg = useIsBelowLg();

  /**
   * `silent`: recarrega sem trocar a página pelo spinner nem limpar o erro — o celular edita por
   * sheet (MobileEditSheet), que precisa continuar montado para mostrar o erro ou o aviso "salvo".
   */
  const loadData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!id) return;
      const silent = opts?.silent ?? false;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetch(`/api/ativos/${id}/editar`, { credentials: 'include' });
        if (!res.ok) {
          if (res.status === 404) throw new Error('Ativo não encontrado');
          throw new Error('Erro ao carregar dados');
        }
        const json = (await res.json()) as EditarPayload;
        setData(json);
        setOperacoesPage(0);
      } catch (err) {
        if (silent) logger.error('Erro ao recarregar edição do ativo:', err);
        else setError(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleUpdateTransacao = useCallback(
    async (transacaoId: string, field: string, value: number | string) => {
      try {
        const body: Record<string, unknown> = { [field]: value };
        const res = await csrfFetch(`/api/historico/transacao/${transacaoId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          invalidatePortfolioDerivedQueries(queryClient);
          // Celular: recarga silenciosa (o sheet fecha e mostra "salvo" em vez de sumir no spinner).
          await loadData({ silent: isBelowLg });
          return true;
        } else {
          const errBody = await res.json().catch(() => ({}));
          logger.error(`Erro ao salvar ${field}:`, res.status, errBody);
          // Celular: o sheet fica aberto com o erro (retorno false); setError trocaria a página.
          if (isBelowLg) return false;
          setError(`Erro ao salvar: ${(errBody as { error?: string }).error || res.statusText}`);
          await loadData();
          return false;
        }
      } catch (err) {
        logger.error('Erro ao atualizar transação:', err);
        if (!isBelowLg) setError('Erro de rede ao salvar alteração');
        return false;
      }
    },
    [loadData, csrfFetch, queryClient, isBelowLg],
  );

  /**
   * Bug #11: atualizar a instituição financeira do ativo. O PATCH em
   * /api/ativos/[id] reescreve `instituicaoId` no JSON de `notes` de
   * todas as transações do portfólio, preservando o histórico.
   */
  const handleUpdateInstituicao = useCallback(
    async (novoInstituicaoId: string) => {
      if (!id) return;
      try {
        const res = await csrfFetch(`/api/ativos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instituicaoId: novoInstituicaoId }),
        });
        if (res.ok) {
          invalidatePortfolioDerivedQueries(queryClient);
          await loadData();
        } else {
          const errBody = await res.json().catch(() => ({}));
          logger.error('Erro ao salvar instituição:', res.status, errBody);
          setError(
            `Erro ao salvar instituição: ${(errBody as { error?: string }).error || res.statusText}`,
          );
        }
      } catch (err) {
        logger.error('Erro de rede ao atualizar instituição:', err);
        setError('Erro de rede ao salvar instituição');
      }
    },
    [id, loadData, csrfFetch, queryClient],
  );

  /** Vínculo com planejamento (sonho/aposentadoria) — PATCH no mesmo endpoint. */
  const handleUpdateVinculo = useCallback(
    async (vinculoTipo: 'sonho' | 'aposentadoria' | null, vinculoObjetivoId: string | null) => {
      if (!id) return;
      try {
        const res = await csrfFetch(`/api/ativos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vinculoTipo, vinculoObjetivoId }),
        });
        if (res.ok) {
          invalidatePortfolioDerivedQueries(queryClient);
          queryClient.invalidateQueries({ queryKey: ['cashflow'] });
          queryClient.invalidateQueries({ queryKey: ['planejamento-sonhos'] });
          await loadData();
        } else {
          const errBody = await res.json().catch(() => ({}));
          logger.error('Erro ao salvar vínculo:', res.status, errBody);
          setError(
            `Erro ao salvar vínculo: ${(errBody as { error?: string }).error || res.statusText}`,
          );
        }
      } catch (err) {
        logger.error('Erro de rede ao atualizar vínculo:', err);
        setError('Erro de rede ao salvar vínculo');
      }
    },
    [id, loadData, csrfFetch, queryClient],
  );

  const handleConfirmDeleteTx = useCallback(async () => {
    if (!transacaoIdToDelete) return;
    try {
      const res = await csrfFetch(`/api/historico/transacao/${transacaoIdToDelete}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        invalidatePortfolioDerivedQueries(queryClient);
        await loadData();
      }
    } catch (err) {
      logger.error('Erro ao excluir transação:', err);
    } finally {
      setTransacaoIdToDelete(null);
    }
  }, [transacaoIdToDelete, loadData, csrfFetch, queryClient]);

  const handleDeletePortfolio = useCallback(async () => {
    if (!id) return;
    try {
      const res = await csrfFetch(`/api/ativos/${id}/portfolio`, {
        method: 'DELETE',
      });
      if (res.ok) {
        invalidatePortfolioDerivedQueries(queryClient);
        router.push('/carteira');
        return;
      }
    } catch (err) {
      logger.error('Erro ao excluir investimento:', err);
    } finally {
      setConfirmDeletePortfolio(false);
    }
  }, [id, router, csrfFetch, queryClient]);

  const handleStartEditProvento = useCallback((p: ProventoRow) => {
    setProventoEditingId(p.id);
    setProventoDraft({
      tipo: p.tipo,
      dataCom: toDateInputValue(p.dataCom),
      dataPagamento: toDateInputValue(p.dataPagamento),
      precificarPor: p.precificarPor,
      valorTotal: String(p.valorTotal),
      quantidadeBase: String(p.quantidadeBase),
      impostoRenda: p.impostoRenda != null ? String(p.impostoRenda) : '',
    });
  }, []);

  const handleStartNewProvento = useCallback(() => {
    setProventoEditingId('new');
    setProventoDraft(defaultProventoDraft());
  }, []);

  const handleCancelProvento = useCallback(() => {
    setProventoEditingId(null);
    setProventoDraft(null);
  }, []);

  const handleSaveProvento = useCallback(async () => {
    if (!proventoDraft || !id || proventoEditingId === null) return;
    const valorTotal = parseDecimalInput(proventoDraft.valorTotal);
    const quantidadeBase = parseDecimalInput(proventoDraft.quantidadeBase);
    if (Number.isNaN(valorTotal) || valorTotal < 0) {
      return;
    }
    if (Number.isNaN(quantidadeBase) || quantidadeBase < 0) {
      return;
    }
    let impostoRenda: number | null = null;
    if (proventoDraft.impostoRenda.trim() !== '') {
      const ir = parseDecimalInput(proventoDraft.impostoRenda);
      if (Number.isNaN(ir) || ir < 0) return;
      impostoRenda = ir;
    }

    const body = {
      tipo: proventoDraft.tipo.trim() || 'Provento',
      dataCom: proventoDraft.dataCom,
      dataPagamento: proventoDraft.dataPagamento,
      precificarPor: proventoDraft.precificarPor,
      valorTotal,
      quantidadeBase,
      impostoRenda,
    };

    setProventoSaving(true);
    try {
      if (proventoEditingId === 'new') {
        const res = await csrfFetch(`/api/ativos/${id}/proventos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          invalidatePortfolioDerivedQueries(queryClient);
          handleCancelProvento();
          await loadData();
        }
      } else {
        const res = await csrfFetch(`/api/ativos/${id}/proventos/${proventoEditingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          invalidatePortfolioDerivedQueries(queryClient);
          handleCancelProvento();
          await loadData();
        }
      }
    } catch (e) {
      logger.error('Erro ao salvar provento:', e);
    } finally {
      setProventoSaving(false);
    }
  }, [
    proventoDraft,
    proventoEditingId,
    id,
    loadData,
    handleCancelProvento,
    csrfFetch,
    queryClient,
  ]);

  const handleConfirmDeleteProvento = useCallback(async () => {
    if (!proventoDeleteId || !id) return;
    try {
      const res = await csrfFetch(`/api/ativos/${id}/proventos/${proventoDeleteId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        invalidatePortfolioDerivedQueries(queryClient);
        handleCancelProvento();
        await loadData();
      }
    } catch (e) {
      logger.error('Erro ao excluir provento:', e);
    } finally {
      setProventoDeleteId(null);
    }
  }, [proventoDeleteId, id, loadData, handleCancelProvento, csrfFetch, queryClient]);

  const operacoesPaginadas = useMemo(() => {
    if (!data?.operacoes) return [];
    const start = operacoesPage * MO_PAGE_SIZE;
    return data.operacoes.slice(start, start + MO_PAGE_SIZE);
  }, [data?.operacoes, operacoesPage]);

  const totalOperacoesPages = data
    ? Math.max(1, Math.ceil(data.operacoes.length / MO_PAGE_SIZE))
    : 1;

  const renderProventoRow = (p: ProventoRow | null, key: string) => {
    const isNew = p === null;
    const editing = isNew ? proventoEditingId === 'new' : proventoEditingId === p?.id;
    const draft = editing ? proventoDraft : null;

    if (!editing || !draft) {
      if (!p) return null;
      return (
        <tr key={key} className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
          <td className={TABLE_STYLES.td}>{p.tipo}</td>
          <td className={`${TABLE_STYLES.td} text-right`}>{formatDate(p.dataCom)}</td>
          <td className={`${TABLE_STYLES.td} text-right`}>{formatDate(p.dataPagamento)}</td>
          <td className={`${TABLE_STYLES.td} text-center capitalize`}>
            {p.precificarPor === 'quantidade' ? 'Quantidade' : 'Valor'}
          </td>
          <td className={`${TABLE_STYLES.td} text-right`}>{formatCurrency(p.valorTotal)}</td>
          <td className={`${TABLE_STYLES.td} text-right`}>
            {p.quantidadeBase.toLocaleString('pt-BR')}
          </td>
          <td className={`${TABLE_STYLES.td} text-right`}>
            {p.impostoRenda != null ? formatCurrency(p.impostoRenda) : '—'}
          </td>
          <td className={`${TABLE_STYLES.td} text-right`}>
            <button
              type="button"
              onClick={() => handleStartEditProvento(p)}
              className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              aria-label={`Editar provento ${p.tipo}`}
            >
              Editar
            </button>
          </td>
        </tr>
      );
    }

    return (
      <tr key={key} className={`${TABLE_STYLES.row} bg-gray-50 dark:bg-gray-900/50`}>
        <td className={`${TABLE_STYLES.td} align-top`}>
          <input
            type="text"
            value={draft.tipo}
            onChange={(e) => setProventoDraft((d) => (d ? { ...d, tipo: e.target.value } : d))}
            className="w-full min-w-[6rem] rounded border border-gray-300 px-1 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Tipo de movimentação"
          />
        </td>
        <td className={`${TABLE_STYLES.td} align-top`}>
          <input
            type="date"
            value={draft.dataCom}
            onChange={(e) => setProventoDraft((d) => (d ? { ...d, dataCom: e.target.value } : d))}
            className="w-full min-w-[8rem] rounded border border-gray-300 px-1 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Data com"
          />
        </td>
        <td className={`${TABLE_STYLES.td} align-top`}>
          <input
            type="date"
            value={draft.dataPagamento}
            onChange={(e) =>
              setProventoDraft((d) => (d ? { ...d, dataPagamento: e.target.value } : d))
            }
            className="w-full min-w-[8rem] rounded border border-gray-300 px-1 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Data de pagamento"
          />
        </td>
        <td className={`${TABLE_STYLES.td} align-top`}>
          <select
            value={draft.precificarPor}
            onChange={(e) =>
              setProventoDraft((d) => (d ? { ...d, precificarPor: e.target.value } : d))
            }
            className="w-full min-w-[5rem] rounded border border-gray-300 px-1 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Precificar por"
          >
            <option value="valor">Valor</option>
            <option value="quantidade">Quantidade</option>
          </select>
        </td>
        <td className={`${TABLE_STYLES.td} align-top`}>
          <input
            type="text"
            inputMode="decimal"
            value={draft.valorTotal}
            onChange={(e) =>
              setProventoDraft((d) => (d ? { ...d, valorTotal: e.target.value } : d))
            }
            className="w-full min-w-[5rem] rounded border border-gray-300 px-1 py-1 text-right text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Valor total em reais"
          />
        </td>
        <td className={`${TABLE_STYLES.td} align-top`}>
          <input
            type="text"
            inputMode="decimal"
            value={draft.quantidadeBase}
            onChange={(e) =>
              setProventoDraft((d) => (d ? { ...d, quantidadeBase: e.target.value } : d))
            }
            className="w-full min-w-[4rem] rounded border border-gray-300 px-1 py-1 text-right text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Quantidade base"
          />
        </td>
        <td className={`${TABLE_STYLES.td} align-top`}>
          <input
            type="text"
            inputMode="decimal"
            value={draft.impostoRenda}
            onChange={(e) =>
              setProventoDraft((d) => (d ? { ...d, impostoRenda: e.target.value } : d))
            }
            className="w-full min-w-[4rem] rounded border border-gray-300 px-1 py-1 text-right text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            placeholder="—"
            aria-label="Imposto de renda (opcional)"
          />
        </td>
        <td className={`${TABLE_STYLES.td} align-top text-right`}>
          <div className="flex flex-col items-end gap-1 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={() => void handleSaveProvento()}
              disabled={proventoSaving}
              className="rounded bg-brand-500 px-2 py-1 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={handleCancelProvento}
              className="rounded px-2 py-1 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
            {!isNew && p ? (
              <button
                type="button"
                onClick={() => setProventoDeleteId(p.id)}
                className="rounded px-2 py-1 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Apagar
              </button>
            ) : null}
          </div>
        </td>
      </tr>
    );
  };

  /** Celular: provento em cartão, com Editar (44px) que abre o mesmo rascunho do desktop. */
  const renderProventoMobileCard = (p: ProventoRow) => (
    <div className={TABLE_MOBILE_STYLES.card}>
      <div className={TABLE_MOBILE_STYLES.cardHeader}>
        <div className="min-w-0">
          <p className={TABLE_MOBILE_STYLES.cardTitle}>{p.tipo}</p>
          <p className={TABLE_MOBILE_STYLES.cardSubtitle}>
            Pago em {formatDate(p.dataPagamento)} · com {formatDate(p.dataCom)}
          </p>
        </div>
        <p className={TABLE_MOBILE_STYLES.valuePrimary}>{formatCurrency(p.valorTotal)}</p>
      </div>
      <dl className={`mt-2 ${TABLE_MOBILE_STYLES.cardDetailGrid}`}>
        <div className="min-w-0">
          <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>Precificar por</dt>
          <dd className={TABLE_MOBILE_STYLES.cardDetailValue}>
            {p.precificarPor === 'quantidade' ? 'Quantidade' : 'Valor'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>Qtde base</dt>
          <dd className={TABLE_MOBILE_STYLES.cardDetailValue}>
            {p.quantidadeBase.toLocaleString('pt-BR')}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>IR</dt>
          <dd className={TABLE_MOBILE_STYLES.cardDetailValue}>
            {p.impostoRenda != null ? formatCurrency(p.impostoRenda) : '—'}
          </dd>
        </div>
      </dl>
      {proventoEditingId === null && (
        <div className="mt-2 flex justify-end border-t border-gray-100 pt-1 dark:border-gray-800">
          <button
            type="button"
            onClick={() => handleStartEditProvento(p)}
            className={TABLE_MOBILE_STYLES.editButton}
            aria-label={`Editar provento ${p.tipo}`}
          >
            Editar
          </button>
        </div>
      )}
    </div>
  );

  /** Celular: o rascunho do provento (mesmo estado e handlers da linha do desktop) em 1 coluna. */
  const renderProventoMobileForm = (p: ProventoRow | null) => {
    const draft = proventoDraft;
    if (!draft) return null;
    const set = (patch: Partial<ProventoDraft>) =>
      setProventoDraft((d) => (d ? { ...d, ...patch } : d));
    const fid = (name: string) => `provento-${p?.id ?? 'novo'}-${name}`;
    return (
      <div className={`${TABLE_MOBILE_STYLES.card} flex flex-col gap-3`} data-mf-provento-form="">
        <p className={TABLE_MOBILE_STYLES.cardTitle}>{p ? 'Editar provento' : 'Novo provento'}</p>
        <div>
          <label htmlFor={fid('tipo')} className={MOBILE_LABEL_CLASS}>
            Tipo de movimentação
          </label>
          <input
            id={fid('tipo')}
            type="text"
            value={draft.tipo}
            onChange={(e) => set({ tipo: e.target.value })}
            enterKeyHint="next"
            className={MOBILE_INPUT_CLASS}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1">
          <div className="min-w-0">
            <label htmlFor={fid('dataCom')} className={MOBILE_LABEL_CLASS}>
              Data com
            </label>
            <input
              id={fid('dataCom')}
              type="date"
              value={draft.dataCom}
              onChange={(e) => set({ dataCom: e.target.value })}
              className={`${MOBILE_INPUT_CLASS} min-w-0`}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={fid('dataPagamento')} className={MOBILE_LABEL_CLASS}>
              Data pagamento
            </label>
            <input
              id={fid('dataPagamento')}
              type="date"
              value={draft.dataPagamento}
              onChange={(e) => set({ dataPagamento: e.target.value })}
              className={`${MOBILE_INPUT_CLASS} min-w-0`}
            />
          </div>
        </div>
        <div>
          <label htmlFor={fid('precificarPor')} className={MOBILE_LABEL_CLASS}>
            Precificar por
          </label>
          <select
            id={fid('precificarPor')}
            value={draft.precificarPor}
            onChange={(e) => set({ precificarPor: e.target.value })}
            className={MOBILE_INPUT_CLASS}
          >
            <option value="valor">Valor</option>
            <option value="quantidade">Quantidade</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1">
          <div className="min-w-0">
            <label htmlFor={fid('valorTotal')} className={MOBILE_LABEL_CLASS}>
              Valor total (R$)
            </label>
            <input
              id={fid('valorTotal')}
              type="text"
              inputMode="decimal"
              enterKeyHint="next"
              value={draft.valorTotal}
              onChange={(e) => set({ valorTotal: e.target.value })}
              className={MOBILE_INPUT_CLASS}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={fid('quantidadeBase')} className={MOBILE_LABEL_CLASS}>
              Qtde base
            </label>
            <input
              id={fid('quantidadeBase')}
              type="text"
              inputMode="decimal"
              enterKeyHint="next"
              value={draft.quantidadeBase}
              onChange={(e) => set({ quantidadeBase: e.target.value })}
              className={MOBILE_INPUT_CLASS}
            />
          </div>
        </div>
        <div>
          <label htmlFor={fid('impostoRenda')} className={MOBILE_LABEL_CLASS}>
            IR (R$, opcional)
          </label>
          <input
            id={fid('impostoRenda')}
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="—"
            value={draft.impostoRenda}
            onChange={(e) => set({ impostoRenda: e.target.value })}
            className={MOBILE_INPUT_CLASS}
          />
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2.5">
          <button
            type="button"
            onClick={handleCancelProvento}
            className="h-12 rounded-xl border border-gray-300 px-5 text-base font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSaveProvento()}
            disabled={proventoSaving}
            aria-busy={proventoSaving || undefined}
            className="h-12 rounded-xl bg-mf-patrimonio px-5 text-base font-semibold text-white active:bg-mf-seguranca disabled:opacity-50"
          >
            {proventoSaving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        {p && (
          <button
            type="button"
            onClick={() => setProventoDeleteId(p.id)}
            className="min-h-11 self-start rounded-md px-2 text-sm font-medium text-[#D92D20] dark:text-[#F97066]"
          >
            Apagar provento
          </button>
        )}
      </div>
    );
  };

  if (loading) {
    return <LoadingSpinner text="Carregando edição do ativo..." />;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <p className="text-red-600 dark:text-red-400">{error || 'Ativo não encontrado'}</p>
        <Button onClick={() => router.push(`/ativos/${id}`)}>Voltar ao ativo</Button>
      </div>
    );
  }

  const instituicao = data.instituicaoNome ?? '—';
  const inicial = data.movimentacaoInicial;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatAssetDisplayTitle({ ticker: data.ticker, nome: data.nome }).full}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{instituicao}</p>
          <Link
            href={`/ativos/${id}`}
            className="mt-2 inline-block text-sm font-medium text-brand-600 hover:text-brand-500 dark:text-brand-400"
          >
            Ver detalhes e gráficos
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              className="dropdown-toggle inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={() => setApagarMenuOpen((o) => !o)}
              aria-expanded={apagarMenuOpen}
              aria-haspopup="menu"
              aria-label="Opções de exclusão"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400"
                aria-hidden
              >
                <TrashBinIcon className="h-4 w-4" />
              </span>
              Apagar
              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
            </button>
            <Dropdown isOpen={apagarMenuOpen} onClose={() => setApagarMenuOpen(false)}>
              <DropdownItem
                onClick={() => {
                  setApagarMenuOpen(false);
                  setConfirmDeletePortfolio(true);
                }}
                className="text-red-600 dark:text-red-400"
              >
                Excluir investimento inteiro
              </DropdownItem>
            </Dropdown>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-0">
        <section className="xl:pr-6 xl:border-r xl:border-gray-200 dark:xl:border-gray-800">
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="border-b border-gray-100 px-6 py-5 dark:border-gray-800">
              <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
                Dados do produto
              </h2>
            </div>
            <div className="p-4 sm:p-6">
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Instituição financeira
                </p>
                <InstitutionSelect
                  currentId={data.instituicaoId}
                  currentNome={data.instituicaoNome}
                  onChange={handleUpdateInstituicao}
                />
              </div>

              <div className="mt-4 space-y-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Vínculo com planejamento
                </p>
                <VinculoPlanejamentoSelect
                  current={data.vinculoPlanejamento}
                  onChange={handleUpdateVinculo}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Sonho: os aportes deste ativo viram o realizado da linha no Fluxo de Caixa.
                  Aposentadoria: alimentam o acompanhamento do simulador.
                </p>
              </div>

              <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-700">
                <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">
                  Movimentação inicial
                </h3>
                {inicial ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Data da compra
                      </p>
                      <div className="mt-1">
                        <EditableDateCell
                          value={inicial.date}
                          onSubmit={(v) => handleUpdateTransacao(inicial.id, 'date', v)}
                          mobileLabel="Data da compra"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Quantidade
                      </p>
                      <div className="mt-1">
                        <EditableField
                          value={inicial.quantity}
                          onSubmit={(v) => handleUpdateTransacao(inicial.id, 'quantity', v)}
                          formatDisplay={(v) => v.toLocaleString('pt-BR')}
                          min={0}
                          inputWidth="w-full max-w-[10rem]"
                          mobileLabel="Quantidade"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Cotação
                      </p>
                      <div className="mt-1">
                        <EditableField
                          value={inicial.price}
                          onSubmit={(v) => handleUpdateTransacao(inicial.id, 'price', v)}
                          formatDisplay={(v) => formatCurrency(v)}
                          min={0}
                          inputWidth="w-full max-w-[10rem]"
                          mobileLabel="Cotação"
                          mobileKind="currency"
                        />
                      </div>
                    </div>
                    <div>
                      <p
                        className="text-xs font-medium text-gray-500 dark:text-gray-400"
                        title="Corretagem e emolumentos da operação inicial"
                      >
                        Taxas
                      </p>
                      <div className="mt-1">
                        <EditableField
                          value={inicial.fees ?? 0}
                          onSubmit={(v) => handleUpdateTransacao(inicial.id, 'fees', v)}
                          formatDisplay={(v) => formatCurrency(v)}
                          min={0}
                          inputWidth="w-full max-w-[10rem]"
                          mobileLabel="Taxas"
                          mobileKind="currency"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhuma compra encontrada. Registre um aporte pela Carteira.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="xl:pl-6">
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="border-b border-gray-100 px-6 py-5 dark:border-gray-800">
              <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
                Gerenciar movimentações
              </h2>
            </div>
            <div className="p-4 sm:p-6">
              {isBelowLg ? (
                <ResponsiveCardList
                  ariaLabel="Movimentações"
                  columns={[]}
                  rows={operacoesPaginadas}
                  getRowKey={(tx) => tx.id}
                  emptyState="Nenhuma operação registrada."
                  renderMobileCard={(tx) => (
                    <div className={TABLE_MOBILE_STYLES.card}>
                      <p className={TABLE_MOBILE_STYLES.cardTitle}>{tx.tipoOperacao}</p>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>Data</dt>
                          <dd>
                            <EditableDateCell
                              value={tx.date}
                              onSubmit={(v) => handleUpdateTransacao(tx.id, 'date', v)}
                            />
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>Valor total</dt>
                          <dd>
                            <EditableField
                              value={tx.total}
                              onSubmit={(v) => handleUpdateTransacao(tx.id, 'total', v)}
                              formatDisplay={(v) => formatCurrency(v)}
                              min={0}
                              mobileLabel="Valor total"
                              mobileKind="currency"
                            />
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>Quantidade</dt>
                          <dd>
                            <EditableField
                              value={tx.quantity}
                              onSubmit={(v) => handleUpdateTransacao(tx.id, 'quantity', v)}
                              formatDisplay={(v) => v.toLocaleString('pt-BR')}
                              min={0}
                              mobileLabel="Quantidade"
                            />
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className={TABLE_MOBILE_STYLES.cardDetailLabel}>Cotação</dt>
                          <dd>
                            <EditableField
                              value={tx.price}
                              onSubmit={(v) => handleUpdateTransacao(tx.id, 'price', v)}
                              formatDisplay={(v) => formatCurrency(v)}
                              min={0}
                              mobileLabel="Cotação"
                              mobileKind="currency"
                            />
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-2 flex justify-end border-t border-gray-100 pt-1 dark:border-gray-800">
                        <button
                          type="button"
                          onClick={() => setTransacaoIdToDelete(tx.id)}
                          className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-[#D92D20] dark:text-[#F97066]"
                          aria-label={`Excluir movimentação ${tx.tipoOperacao}`}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  )}
                />
              ) : (
                <div className="space-y-3">
                  {operacoesPaginadas.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhuma operação registrada.
                    </p>
                  ) : (
                    operacoesPaginadas.map((tx) => (
                      <div
                        key={tx.id}
                        className="border-b border-gray-100 pb-3 last:border-0 dark:border-gray-800"
                      >
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                              {tx.tipoOperacao}
                            </p>
                            <button
                              type="button"
                              onClick={() => setTransacaoIdToDelete(tx.id)}
                              className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                              aria-label={`Excluir movimentação ${tx.tipoOperacao}`}
                            >
                              Excluir
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                Precificar por
                              </p>
                              <select
                                disabled
                                className="mt-1 w-full cursor-not-allowed rounded-md border-0 bg-transparent p-0 text-sm text-gray-800 dark:text-gray-200"
                                aria-label="Precificar por (fixo)"
                                value="valor"
                              >
                                <option value="valor">Valor</option>
                              </select>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                Data
                              </p>
                              <div className="mt-1">
                                <EditableDateCell
                                  value={tx.date}
                                  onSubmit={(v) => handleUpdateTransacao(tx.id, 'date', v)}
                                />
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                Valor total (R$)
                              </p>
                              <div className="mt-1">
                                <EditableField
                                  value={tx.total}
                                  onSubmit={(v) => handleUpdateTransacao(tx.id, 'total', v)}
                                  formatDisplay={(v) => formatCurrency(v)}
                                  min={0}
                                  inputWidth="w-full min-w-[6rem]"
                                />
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                Quantidade
                              </p>
                              <div className="mt-1">
                                <EditableField
                                  value={tx.quantity}
                                  onSubmit={(v) => handleUpdateTransacao(tx.id, 'quantity', v)}
                                  formatDisplay={(v) => v.toLocaleString('pt-BR')}
                                  min={0}
                                  inputWidth="w-full min-w-[5rem]"
                                />
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                Cotação
                              </p>
                              <div className="mt-1">
                                <EditableField
                                  value={tx.price}
                                  onSubmit={(v) => handleUpdateTransacao(tx.id, 'price', v)}
                                  formatDisplay={(v) => formatCurrency(v)}
                                  min={0}
                                  inputWidth="w-full min-w-[6rem]"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {data.operacoes.length > MO_PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 max-lg:flex max-lg:h-11 max-lg:w-11 max-lg:items-center max-lg:justify-center"
                    disabled={operacoesPage <= 0}
                    onClick={() => setOperacoesPage((p) => Math.max(0, p - 1))}
                    aria-label="Página anterior"
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                  <span>
                    {operacoesPage + 1} / {totalOperacoesPages}
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 max-lg:flex max-lg:h-11 max-lg:w-11 max-lg:items-center max-lg:justify-center"
                    disabled={operacoesPage >= totalOperacoesPages - 1}
                    onClick={() =>
                      setOperacoesPage((p) => Math.min(totalOperacoesPages - 1, p + 1))
                    }
                    aria-label="Próxima página"
                  >
                    <ArrowRightIcon className="h-5 w-5" />
                  </button>
                </div>
              )}

              <div className="mt-8 border-t border-gray-200 pt-5 dark:border-gray-700">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    Proventos
                  </h3>
                  {proventoEditingId === null ? (
                    <button
                      type="button"
                      onClick={handleStartNewProvento}
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-500 max-lg:min-h-11 dark:text-brand-400"
                    >
                      <PlusIcon className="h-4 w-4" aria-hidden />
                      Novo provento
                    </button>
                  ) : null}
                </div>

                {isBelowLg ? (
                  <div className="flex flex-col gap-2">
                    {proventoEditingId === 'new' && proventoDraft
                      ? renderProventoMobileForm(null)
                      : null}
                    <ResponsiveCardList
                      ariaLabel="Proventos"
                      columns={[]}
                      rows={data.proventos}
                      getRowKey={(p) => p.id}
                      emptyState={
                        proventoEditingId === 'new' ? undefined : 'Nenhum provento registrado.'
                      }
                      renderMobileCard={(p) =>
                        proventoEditingId === p.id && proventoDraft
                          ? renderProventoMobileForm(p)
                          : renderProventoMobileCard(p)
                      }
                    />
                  </div>
                ) : (
                  <div className={TABLE_STYLES.wrapper}>
                    <table className={`${TABLE_STYLES.table} min-w-[760px]`}>
                      <thead>
                        <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                          <th className={`${TABLE_STYLES.th} text-left`}>Tipo</th>
                          <th className={`${TABLE_STYLES.th} text-right`}>Data com</th>
                          <th className={`${TABLE_STYLES.th} text-right`}>Data pagamento</th>
                          <th className={`${TABLE_STYLES.th} text-center`}>Precificar por</th>
                          <th className={`${TABLE_STYLES.th} text-right`}>Valor total</th>
                          <th className={`${TABLE_STYLES.th} text-right`}>Qtde base</th>
                          <th className={`${TABLE_STYLES.th} text-right`}>IR (R$)</th>
                          <th className={`${TABLE_STYLES.th} w-28 text-right`}> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {proventoEditingId === 'new' ? renderProventoRow(null, 'new-row') : null}
                        {data.proventos.map((p) => renderProventoRow(p, p.id))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <Modal
        isOpen={!!transacaoIdToDelete}
        onClose={() => setTransacaoIdToDelete(null)}
        className="max-w-[480px] p-6"
        showCloseButton
      >
        <div className="text-center">
          <h4 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">
            Excluir movimentação
          </h4>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Deseja realmente excluir esta movimentação? O investimento será recalculado com base nas
            demais operações.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => setTransacaoIdToDelete(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmDeleteTx}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Excluir
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={confirmDeletePortfolio}
        onClose={() => setConfirmDeletePortfolio(false)}
        className="max-w-[480px] p-6"
        showCloseButton
      >
        <div className="text-center">
          <h4 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">
            Excluir investimento
          </h4>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Todas as movimentações deste ativo serão apagadas e o item sairá da sua carteira. Esta
            ação não pode ser desfeita.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => setConfirmDeletePortfolio(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleDeletePortfolio}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Excluir tudo
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!proventoDeleteId}
        onClose={() => setProventoDeleteId(null)}
        className="max-w-[480px] p-6"
        showCloseButton
      >
        <div className="text-center">
          <h4 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">
            Excluir provento
          </h4>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Deseja realmente excluir este provento? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => setProventoDeleteId(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void handleConfirmDeleteProvento()}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default function AtivoEditarPage() {
  return (
    <ProtectedRoute>
      <AtivoEditarContent />
    </ProtectedRoute>
  );
}
