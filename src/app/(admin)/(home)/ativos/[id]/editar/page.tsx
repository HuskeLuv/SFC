"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { DropdownItem } from "@/components/ui/dropdown/DropdownItem";
import EditableField from "@/components/carteira/shared/EditableField";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  InfoIcon,
  PencilIcon,
  PlusIcon,
  TrashBinIcon,
} from "@/icons";

const MO_PAGE_SIZE = 6;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const toDateInputValue = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toISOString().slice(0, 10);
};

const parseDecimalInput = (raw: string): number => {
  const t = raw.trim();
  if (!t) return NaN;
  if (t.includes(",")) {
    return parseFloat(t.replace(/\./g, "").replace(",", "."));
  }
  return parseFloat(t);
};

interface EditableDateCellProps {
  value: string;
  onSubmit: (value: string) => void;
  inputClassName?: string;
}

const EditableDateCell: React.FC<EditableDateCellProps> = ({
  value,
  onSubmit,
  inputClassName = "w-full max-w-[9rem] px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-800 dark:text-white",
}) => {
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
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") {
      setInputValue(toDateInputValue(value));
      setIsEditing(false);
    }
  };

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
      className="text-left text-xs text-gray-800 dark:text-gray-200 hover:underline"
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

const defaultProventoDraft = (): ProventoDraft => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    tipo: "Dividendos",
    dataCom: today,
    dataPagamento: today,
    precificarPor: "valor",
    valorTotal: "0",
    quantidadeBase: "0",
    impostoRenda: "",
  };
};

const AtivoEditarContent = () => {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [data, setData] = useState<EditarPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transacaoIdToDelete, setTransacaoIdToDelete] = useState<string | null>(null);
  const [confirmDeletePortfolio, setConfirmDeletePortfolio] = useState(false);
  const [apagarMenuOpen, setApagarMenuOpen] = useState(false);
  const [operacoesPage, setOperacoesPage] = useState(0);
  const [proventoEditingId, setProventoEditingId] = useState<string | "new" | null>(null);
  const [proventoDraft, setProventoDraft] = useState<ProventoDraft | null>(null);
  const [proventoSaving, setProventoSaving] = useState(false);
  const [proventoDeleteId, setProventoDeleteId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ativos/${id}/editar`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) throw new Error("Ativo não encontrado");
        throw new Error("Erro ao carregar dados");
      }
      const json = (await res.json()) as EditarPayload;
      setData(json);
      setOperacoesPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleUpdateTransacao = useCallback(
    async (transacaoId: string, field: string, value: number | string) => {
      try {
        const body: Record<string, unknown> = { [field]: value };
        const res = await fetch(`/api/historico/transacao/${transacaoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          await loadData();
        }
      } catch (err) {
        console.error("Erro ao atualizar transação:", err);
      }
    },
    [loadData]
  );

  const handleConfirmDeleteTx = useCallback(async () => {
    if (!transacaoIdToDelete) return;
    try {
      const res = await fetch(`/api/historico/transacao/${transacaoIdToDelete}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      console.error("Erro ao excluir transação:", err);
    } finally {
      setTransacaoIdToDelete(null);
    }
  }, [transacaoIdToDelete, loadData]);

  const handleDeletePortfolio = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/ativos/${id}/portfolio`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        router.push("/historico");
        return;
      }
    } catch (err) {
      console.error("Erro ao excluir investimento:", err);
    } finally {
      setConfirmDeletePortfolio(false);
    }
  }, [id, router]);

  const handleStartEditProvento = useCallback((p: ProventoRow) => {
    setProventoEditingId(p.id);
    setProventoDraft({
      tipo: p.tipo,
      dataCom: toDateInputValue(p.dataCom),
      dataPagamento: toDateInputValue(p.dataPagamento),
      precificarPor: p.precificarPor,
      valorTotal: String(p.valorTotal),
      quantidadeBase: String(p.quantidadeBase),
      impostoRenda: p.impostoRenda != null ? String(p.impostoRenda) : "",
    });
  }, []);

  const handleStartNewProvento = useCallback(() => {
    setProventoEditingId("new");
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
    if (proventoDraft.impostoRenda.trim() !== "") {
      const ir = parseDecimalInput(proventoDraft.impostoRenda);
      if (Number.isNaN(ir) || ir < 0) return;
      impostoRenda = ir;
    }

    const body = {
      tipo: proventoDraft.tipo.trim() || "Provento",
      dataCom: proventoDraft.dataCom,
      dataPagamento: proventoDraft.dataPagamento,
      precificarPor: proventoDraft.precificarPor,
      valorTotal,
      quantidadeBase,
      impostoRenda,
    };

    setProventoSaving(true);
    try {
      if (proventoEditingId === "new") {
        const res = await fetch(`/api/ativos/${id}/proventos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          handleCancelProvento();
          await loadData();
        }
      } else {
        const res = await fetch(`/api/ativos/${id}/proventos/${proventoEditingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          handleCancelProvento();
          await loadData();
        }
      }
    } catch (e) {
      console.error("Erro ao salvar provento:", e);
    } finally {
      setProventoSaving(false);
    }
  }, [proventoDraft, proventoEditingId, id, loadData, handleCancelProvento]);

  const handleConfirmDeleteProvento = useCallback(async () => {
    if (!proventoDeleteId || !id) return;
    try {
      const res = await fetch(`/api/ativos/${id}/proventos/${proventoDeleteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        handleCancelProvento();
        await loadData();
      }
    } catch (e) {
      console.error("Erro ao excluir provento:", e);
    } finally {
      setProventoDeleteId(null);
    }
  }, [proventoDeleteId, id, loadData, handleCancelProvento]);

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
    const editing = isNew ? proventoEditingId === "new" : proventoEditingId === p?.id;
    const draft = editing ? proventoDraft : null;

    if (!editing || !draft) {
      if (!p) return null;
      return (
        <tr
          key={key}
          className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
        >
          <td className="px-2 py-2 text-gray-800 dark:text-gray-200">{p.tipo}</td>
          <td className="px-2 py-2 text-right text-gray-800 dark:text-gray-200">
            {formatDate(p.dataCom)}
          </td>
          <td className="px-2 py-2 text-right text-gray-800 dark:text-gray-200">
            {formatDate(p.dataPagamento)}
          </td>
          <td className="px-2 py-2 text-center text-gray-800 dark:text-gray-200 capitalize">
            {p.precificarPor === "quantidade" ? "Quantidade" : "Valor"}
          </td>
          <td className="px-2 py-2 text-right text-gray-800 dark:text-gray-200">
            {formatCurrency(p.valorTotal)}
          </td>
          <td className="px-2 py-2 text-right text-gray-800 dark:text-gray-200">
            {p.quantidadeBase.toLocaleString("pt-BR")}
          </td>
          <td className="px-2 py-2 text-right text-gray-800 dark:text-gray-200">
            {p.impostoRenda != null ? formatCurrency(p.impostoRenda) : "—"}
          </td>
          <td className="px-2 py-2 text-right">
            <button
              type="button"
              onClick={() => handleStartEditProvento(p)}
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
              aria-label={`Editar provento ${p.tipo}`}
            >
              Editar
            </button>
          </td>
        </tr>
      );
    }

    return (
      <tr key={key} className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50">
        <td className="px-2 py-2 align-top">
          <input
            type="text"
            value={draft.tipo}
            onChange={(e) => setProventoDraft((d) => (d ? { ...d, tipo: e.target.value } : d))}
            className="w-full min-w-[6rem] rounded border border-gray-300 px-1 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Tipo de movimentação"
          />
        </td>
        <td className="px-2 py-2 align-top">
          <input
            type="date"
            value={draft.dataCom}
            onChange={(e) => setProventoDraft((d) => (d ? { ...d, dataCom: e.target.value } : d))}
            className="w-full min-w-[8rem] rounded border border-gray-300 px-1 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Data com"
          />
        </td>
        <td className="px-2 py-2 align-top">
          <input
            type="date"
            value={draft.dataPagamento}
            onChange={(e) =>
              setProventoDraft((d) => (d ? { ...d, dataPagamento: e.target.value } : d))
            }
            className="w-full min-w-[8rem] rounded border border-gray-300 px-1 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Data de pagamento"
          />
        </td>
        <td className="px-2 py-2 align-top">
          <select
            value={draft.precificarPor}
            onChange={(e) =>
              setProventoDraft((d) => (d ? { ...d, precificarPor: e.target.value } : d))
            }
            className="w-full min-w-[5rem] rounded border border-gray-300 px-1 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Precificar por"
          >
            <option value="valor">Valor</option>
            <option value="quantidade">Quantidade</option>
          </select>
        </td>
        <td className="px-2 py-2 align-top">
          <input
            type="text"
            inputMode="decimal"
            value={draft.valorTotal}
            onChange={(e) =>
              setProventoDraft((d) => (d ? { ...d, valorTotal: e.target.value } : d))
            }
            className="w-full min-w-[5rem] rounded border border-gray-300 px-1 py-1 text-xs text-right dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Valor total em reais"
          />
        </td>
        <td className="px-2 py-2 align-top">
          <input
            type="text"
            inputMode="decimal"
            value={draft.quantidadeBase}
            onChange={(e) =>
              setProventoDraft((d) => (d ? { ...d, quantidadeBase: e.target.value } : d))
            }
            className="w-full min-w-[4rem] rounded border border-gray-300 px-1 py-1 text-xs text-right dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            aria-label="Quantidade base"
          />
        </td>
        <td className="px-2 py-2 align-top">
          <input
            type="text"
            inputMode="decimal"
            value={draft.impostoRenda}
            onChange={(e) =>
              setProventoDraft((d) => (d ? { ...d, impostoRenda: e.target.value } : d))
            }
            className="w-full min-w-[4rem] rounded border border-gray-300 px-1 py-1 text-xs text-right dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            placeholder="—"
            aria-label="Imposto de renda (opcional)"
          />
        </td>
        <td className="px-2 py-2 align-top text-right">
          <div className="flex flex-col items-end gap-1 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={() => void handleSaveProvento()}
              disabled={proventoSaving}
              className="rounded bg-brand-500 px-2 py-1 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={handleCancelProvento}
              className="rounded px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
            {!isNew && p ? (
              <button
                type="button"
                onClick={() => setProventoDeleteId(p.id)}
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Apagar
              </button>
            ) : null}
          </div>
        </td>
      </tr>
    );
  };

  if (loading) {
    return <LoadingSpinner text="Carregando edição do ativo..." />;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <p className="text-red-600 dark:text-red-400">{error || "Ativo não encontrado"}</p>
        <Button onClick={() => router.push(`/ativos/${id}`)}>Voltar ao ativo</Button>
      </div>
    );
  }

  const instituicao = data.instituicaoNome ?? "—";
  const inicial = data.movimentacaoInicial;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {data.ticker}
            {data.nome && data.nome !== data.ticker ? ` — ${data.nome}` : ""}
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
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
                  Dados do produto
                </h2>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <PencilIcon className="h-4 w-4" aria-hidden />
                  Editar
                </span>
              </div>
            </div>
            <div className="p-4 sm:p-6">
              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  Instituição financeira
                </p>
                <p className="text-xs text-gray-800 dark:text-gray-200">{instituicao}</p>
              </div>

              <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-700">
                <h3 className="mb-4 text-base font-medium text-gray-800 dark:text-white/90">
                  Movimentação inicial
                </h3>
                {inicial ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                        Data da compra
                      </p>
                      <div className="mt-1">
                        <EditableDateCell
                          value={inicial.date}
                          onSubmit={(v) => handleUpdateTransacao(inicial.id, "date", v)}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                        Quantidade
                      </p>
                      <div className="mt-1">
                        <EditableField
                          value={inicial.quantity}
                          onSubmit={(v) => handleUpdateTransacao(inicial.id, "quantity", v)}
                          formatDisplay={(v) => v.toLocaleString("pt-BR")}
                          min={0}
                          inputWidth="w-full max-w-[10rem]"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Cotação</p>
                      <div className="mt-1">
                        <EditableField
                          value={inicial.price}
                          onSubmit={(v) => handleUpdateTransacao(inicial.id, "price", v)}
                          formatDisplay={(v) => formatCurrency(v)}
                          min={0}
                          inputWidth="w-full max-w-[10rem]"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Taxas</p>
                      <div className="mt-1 flex items-center gap-2">
                        <EditableField
                          value={inicial.fees ?? 0}
                          onSubmit={(v) => handleUpdateTransacao(inicial.id, "fees", v)}
                          formatDisplay={(v) => formatCurrency(v)}
                          min={0}
                          inputWidth="w-full max-w-[10rem]"
                        />
                        <span
                          className="text-gray-400 dark:text-gray-500"
                          title="Corretagem e emolumentos da operação inicial"
                        >
                          <InfoIcon className="h-4 w-4" aria-label="Informação sobre taxas" />
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-medium text-gray-800 dark:text-white/90">
                  Gerenciar movimentações
                </h2>
                <Link
                  href="/carteira"
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-500 dark:text-brand-400"
                >
                  <PlusIcon className="h-4 w-4" aria-hidden />
                  Adicionar operação
                </Link>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Aportes e resgates pela Carteira; ajuste valores e datas aqui. Proventos na tabela
                abaixo ficam salvos no banco.
              </p>
            </div>
            <div className="p-4 sm:p-6">
              <div className="space-y-3">
                {operacoesPaginadas.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Nenhuma operação registrada.
                  </p>
                ) : (
                  operacoesPaginadas.map((tx) => (
                    <div
                      key={tx.id}
                      className="border-b border-gray-100 pb-3 last:border-0 dark:border-gray-800"
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                            tx.tipoRaw === "venda"
                              ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                              : "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
                          }`}
                          aria-hidden
                        >
                          {tx.tipoRaw === "venda" ? (
                            <ArrowDownIcon className="h-4 w-4" />
                          ) : (
                            <PlusIcon className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                              {tx.tipoOperacao}
                            </p>
                            <button
                              type="button"
                              onClick={() => setTransacaoIdToDelete(tx.id)}
                              className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                              aria-label={`Excluir movimentação ${tx.tipoOperacao}`}
                            >
                              Excluir
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
                            <div>
                              <p className="font-bold text-gray-700 dark:text-gray-300">
                                Precificar por
                              </p>
                              <select
                                disabled
                                className="mt-1 w-full cursor-not-allowed rounded-md border-0 bg-transparent p-0 text-xs text-gray-800 dark:text-gray-200"
                                aria-label="Precificar por (fixo)"
                                value="valor"
                              >
                                <option value="valor">Valor</option>
                              </select>
                            </div>
                            <div>
                              <p className="font-bold text-gray-700 dark:text-gray-300">Data</p>
                              <div className="mt-1">
                                <EditableDateCell
                                  value={tx.date}
                                  onSubmit={(v) => handleUpdateTransacao(tx.id, "date", v)}
                                />
                              </div>
                            </div>
                            <div>
                              <p className="font-bold text-gray-700 dark:text-gray-300">
                                Valor total (R$)
                              </p>
                              <div className="mt-1">
                                <EditableField
                                  value={tx.total}
                                  onSubmit={(v) => handleUpdateTransacao(tx.id, "total", v)}
                                  formatDisplay={(v) => formatCurrency(v)}
                                  min={0}
                                  inputWidth="w-full min-w-[6rem]"
                                />
                              </div>
                            </div>
                            <div>
                              <p className="font-bold text-gray-700 dark:text-gray-300">
                                Quantidade
                              </p>
                              <div className="mt-1">
                                <EditableField
                                  value={tx.quantity}
                                  onSubmit={(v) => handleUpdateTransacao(tx.id, "quantity", v)}
                                  formatDisplay={(v) => v.toLocaleString("pt-BR")}
                                  min={0}
                                  inputWidth="w-full min-w-[5rem]"
                                />
                              </div>
                            </div>
                            <div>
                              <p className="font-bold text-gray-700 dark:text-gray-300">Cotação</p>
                              <div className="mt-1">
                                <EditableField
                                  value={tx.price}
                                  onSubmit={(v) => handleUpdateTransacao(tx.id, "price", v)}
                                  formatDisplay={(v) => formatCurrency(v)}
                                  min={0}
                                  inputWidth="w-full min-w-[6rem]"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {data.operacoes.length > MO_PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
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
                    className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                    disabled={operacoesPage >= totalOperacoesPages - 1}
                    onClick={() => setOperacoesPage((p) => Math.min(totalOperacoesPages - 1, p + 1))}
                    aria-label="Próxima página"
                  >
                    <ArrowRightIcon className="h-5 w-5" />
                  </button>
                </div>
              )}

              <div className="mt-8 border-t border-gray-200 pt-5 dark:border-gray-700">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
                    Proventos
                  </h3>
                  {proventoEditingId === null ? (
                    <button
                      type="button"
                      onClick={handleStartNewProvento}
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-500 dark:text-brand-400"
                    >
                      <PlusIcon className="h-4 w-4" aria-hidden />
                      Novo provento
                    </button>
                  ) : null}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-2 py-2 text-left font-bold text-gray-700 dark:text-gray-300">
                          Tipo
                        </th>
                        <th className="px-2 py-2 text-right font-bold text-gray-700 dark:text-gray-300">
                          Data com
                        </th>
                        <th className="px-2 py-2 text-right font-bold text-gray-700 dark:text-gray-300">
                          Data pagamento
                        </th>
                        <th className="px-2 py-2 text-center font-bold text-gray-700 dark:text-gray-300">
                          Precificar por
                        </th>
                        <th className="px-2 py-2 text-right font-bold text-gray-700 dark:text-gray-300">
                          Valor total
                        </th>
                        <th className="px-2 py-2 text-right font-bold text-gray-700 dark:text-gray-300">
                          Qtde base
                        </th>
                        <th className="px-2 py-2 text-right font-bold text-gray-700 dark:text-gray-300">
                          IR (R$)
                        </th>
                        <th className="px-2 py-2 text-right font-bold text-gray-700 dark:text-gray-300 w-28">
                          {" "}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {proventoEditingId === "new"
                        ? renderProventoRow(null, "new-row")
                        : null}
                      {data.proventos.map((p) => renderProventoRow(p, p.id))}
                    </tbody>
                  </table>
                </div>

                {data.proventos.length === 0 && proventoEditingId !== "new" ? (
                  <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    Nenhum provento cadastrado. Na primeira abertura, importamos do banco/BRAPI se
                    houver histórico para o ticker; caso contrário, use &quot;Novo provento&quot;.
                  </p>
                ) : null}
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
            Todas as movimentações deste ativo serão apagadas e o item sairá da sua carteira. Esta ação
            não pode ser desfeita.
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
