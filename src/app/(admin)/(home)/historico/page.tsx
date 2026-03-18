"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import { ChevronDownIcon, ChevronUpIcon } from "@/icons";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { getCorPorCategoria, CATEGORIA_LABELS } from "@/lib/carteiraCategoryColors";
import EditableField from "@/components/carteira/shared/EditableField";

interface AtivoResumo {
  assetId: string;
  portfolioId: string;
  symbol: string;
  nome: string;
  categoria: string;
  valorAtual: number;
  dataUltimaModificacao: string | null;
}

interface TransacaoItem {
  id: string;
  tipoOperacao: string;
  quantity: number;
  price: number;
  total: number;
  date: string;
  fees: number | null;
  notes: string | null;
}

interface Secao {
  categoria: string;
  ativos: AtivoResumo[];
}

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

interface EditableDateCellProps {
  value: string;
  onSubmit: (value: string) => void;
}

const EditableDateCell: React.FC<EditableDateCellProps> = ({
  value,
  onSubmit,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(toDateInputValue(value));

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
      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      autoFocus
    />
  ) : (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setIsEditing(true);
      }}
      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
    >
      {formatDate(value)}
    </div>
  );
};

interface AtivoCardProps {
  ativo: AtivoResumo;
  onRefreshAtivos: () => void;
}

const AtivoCard: React.FC<AtivoCardProps> = ({ ativo, onRefreshAtivos }) => {
  const [expanded, setExpanded] = useState(false);
  const [historico, setHistorico] = useState<TransacaoItem[] | null>(null);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [transacaoIdToDelete, setTransacaoIdToDelete] = useState<string | null>(null);

  const cor = getCorPorCategoria(ativo.categoria);

  const handleToggleExpand = useCallback(async () => {
    if (!expanded && !historico) {
      setLoadingHistorico(true);
      try {
        const res = await fetch(`/api/historico/portfolio/${ativo.portfolioId}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setHistorico(data.historico);
        }
      } catch (err) {
        console.error("Erro ao carregar histórico:", err);
      } finally {
        setLoadingHistorico(false);
      }
    }
    setExpanded((prev) => !prev);
  }, [expanded, historico, ativo.portfolioId]);

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
        if (res.ok && historico) {
          setHistorico((prev) =>
            prev!.map((t) =>
              t.id === transacaoId ? { ...t, [field]: value } : t
            )
          );
          onRefreshAtivos();
        }
      } catch (err) {
        console.error("Erro ao atualizar transação:", err);
      }
    },
    [historico, onRefreshAtivos]
  );

  const handleRequestDelete = useCallback((transacaoId: string) => {
    setTransacaoIdToDelete(transacaoId);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!transacaoIdToDelete) return;

    try {
      const res = await fetch(`/api/historico/transacao/${transacaoIdToDelete}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setHistorico((prev) => prev!.filter((t) => t.id !== transacaoIdToDelete));
        onRefreshAtivos();
      }
    } catch (err) {
      console.error("Erro ao excluir transação:", err);
    } finally {
      setTransacaoIdToDelete(null);
    }
  }, [transacaoIdToDelete, onRefreshAtivos]);

  const handleCancelDelete = useCallback(() => {
    setTransacaoIdToDelete(null);
  }, []);

  return (
    <div
      className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
      style={{ backgroundColor: `${cor}20` }}
    >
      <button
        type="button"
        onClick={handleToggleExpand}
        className="w-full px-6 py-4 text-left flex items-center justify-between hover:opacity-90 transition-opacity"
        aria-expanded={expanded}
        aria-label={expanded ? "Recolher card" : "Expandir card"}
      >
        <div>
          <Link
            href={`/ativos/${ativo.portfolioId}`}
            className="font-semibold text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {ativo.symbol || ativo.nome}
          </Link>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mt-1">
            {formatCurrency(ativo.valorAtual)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Última alteração:{" "}
            {ativo.dataUltimaModificacao
              ? formatDate(ativo.dataUltimaModificacao)
              : "—"}
          </p>
        </div>
        <span className="flex-shrink-0 ml-2">
          {expanded ? (
            <ChevronUpIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          ) : (
            <ChevronDownIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-white dark:bg-gray-900/50">
          {loadingHistorico ? (
            <LoadingSpinner text="Carregando histórico..." />
          ) : historico && historico.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-2 py-2 w-8"></th>
                    <th className="px-2 py-2 text-left font-bold text-gray-700 dark:text-gray-300">
                      Tipo de operação
                    </th>
                    <th className="px-2 py-2 text-right font-bold text-gray-700 dark:text-gray-300">
                      Quantidade
                    </th>
                    <th className="px-2 py-2 text-right font-bold text-gray-700 dark:text-gray-300">
                      Preço
                    </th>
                    <th className="px-2 py-2 text-right font-bold text-gray-700 dark:text-gray-300">
                      Total
                    </th>
                    <th className="px-2 py-2 text-right font-bold text-gray-700 dark:text-gray-300">
                      Data
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((tx) => (
                    <tr
                      key={tx.id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRequestDelete(tx.id);
                          }}
                          aria-label="Excluir movimentação"
                          className="flex items-center justify-center w-6 h-6 rounded bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500 text-white font-bold text-sm transition-colors"
                        >
                          <span className="leading-none">×</span>
                        </button>
                      </td>
                      <td className="px-2 py-2 text-gray-800 dark:text-gray-200">
                        {tx.tipoOperacao}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <EditableField
                          value={tx.quantity}
                          onSubmit={(v) =>
                            handleUpdateTransacao(tx.id, "quantity", v)
                          }
                          formatDisplay={(v) => v.toLocaleString("pt-BR")}
                          min={0}
                          inputWidth="w-20"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <EditableField
                          value={tx.price}
                          onSubmit={(v) =>
                            handleUpdateTransacao(tx.id, "price", v)
                          }
                          formatDisplay={(v) => formatCurrency(v)}
                          min={0}
                          inputWidth="w-24"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <EditableField
                          value={tx.total}
                          onSubmit={(v) =>
                            handleUpdateTransacao(tx.id, "total", v)
                          }
                          formatDisplay={(v) => formatCurrency(v)}
                          min={0}
                          inputWidth="w-28"
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <EditableDateCell
                          value={tx.date}
                          onSubmit={(v) =>
                            handleUpdateTransacao(tx.id, "date", v)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Nenhuma movimentação registrada.
            </p>
          )}
        </div>
      )}

      <Modal
        isOpen={!!transacaoIdToDelete}
        onClose={handleCancelDelete}
        className="max-w-[480px] p-6"
        showCloseButton={true}
      >
        <div className="text-center">
          <h4 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white/90">
            Excluir movimentação
          </h4>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Deseja realmente excluir esta movimentação? O ativo será atualizado
            com base nas movimentações restantes ou removido se não houver outras.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={handleCancelDelete}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmDelete}
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

export default function HistoricoPage() {
  const [secoes, setSecoes] = useState<Secao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAtivos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/historico/ativos", { credentials: "include" });
      if (!res.ok) throw new Error("Erro ao carregar ativos");
      const data = await res.json();
      setSecoes(data.secoes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAtivos();
  }, [fetchAtivos]);

  if (loading) {
    return (
      <ProtectedRoute>
        <LoadingSpinner text="Carregando histórico..." />
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute>
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Histórico
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Visualize e edite o histórico de movimentações de cada ativo
          </p>
        </div>

        <div className="space-y-8">
          {secoes.map((secao) => (
            <ComponentCard
              key={secao.categoria}
              title={CATEGORIA_LABELS[secao.categoria] || secao.categoria}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {secao.ativos.map((ativo) => (
                  <AtivoCard
                    key={ativo.portfolioId}
                    ativo={ativo}
                    onRefreshAtivos={fetchAtivos}
                  />
                ))}
              </div>
            </ComponentCard>
          ))}

          {secoes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <p className="text-gray-500 dark:text-gray-400">
                Nenhum ativo encontrado. Adicione investimentos na Carteira para
                visualizar o histórico.
              </p>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
