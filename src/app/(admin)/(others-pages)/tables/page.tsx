"use client";
import { useEffect, useState } from "react";

interface CashflowItem {
  id: string;
  data: string;
  tipo: string;
  categoria: string;
  descricao: string;
  valor: number;
  forma_pagamento: string;
  pago: boolean;
}

export default function TablesPage() {
  const [cashflow, setCashflow] = useState<CashflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<CashflowItem | null>(null);
  const [newRow, setNewRow] = useState<Partial<CashflowItem> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCashflow();
  }, []);

  function fetchCashflow() {
    setLoading(true);
    fetch("/api/cashflow", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`API Error: ${res.status} - ${errorText}`);
        }
        const data = await res.json();
        setCashflow(data);
      })
      .catch((error) => {
        console.error("Fetch error:", error);
        setError(error.message || "Not authenticated");
      })
      .finally(() => setLoading(false));
  }

  // Add new row
  function handleAddRow() {
    setNewRow({
      data: new Date().toISOString().split('T')[0],
      tipo: "Receita",
      categoria: "",
      descricao: "",
      valor: 0,
      forma_pagamento: "",
      pago: false,
    });
  }

  function handleCancelNew() {
    setNewRow(null);
  }

  async function handleSaveNew() {
    if (!newRow) return;
    setSaving(true);
    try {
      const res = await fetch("/api/cashflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newRow),
      });
      if (!res.ok) throw new Error("Erro ao salvar nova entrada");
      setNewRow(null);
      fetchCashflow();
    } catch (e) {
      setError("Erro ao salvar nova entrada");
    } finally {
      setSaving(false);
    }
  }

  // Edit row
  function handleEditRow(row: CashflowItem) {
    setEditingId(row.id);
    setEditRow({ ...row });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditRow(null);
  }

  async function handleSaveEdit() {
    if (!editRow) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cashflow/${editRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editRow),
      });
      if (!res.ok) throw new Error("Erro ao salvar edição");
      setEditingId(null);
      setEditRow(null);
      fetchCashflow();
    } catch (e) {
      setError("Erro ao salvar edição");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRow(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta entrada?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cashflow/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erro ao excluir entrada");
      fetchCashflow();
    } catch (e) {
      setError("Erro ao excluir entrada");
    } finally {
      setSaving(false);
    }
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('pt-BR');
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  if (loading) return <div className="flex justify-center items-center h-64">Carregando...</div>;
  if (error) return <div className="text-red-500 text-center">{error}</div>;

  return (
    <div className="max-w-7xl mx-auto mt-10 p-6 bg-white dark:bg-white/[0.03] rounded-xl shadow">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Fluxo de Caixa Pessoal</h1>
        <button
          className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
          onClick={handleAddRow}
          disabled={!!newRow || saving}
        >
          Adicionar Entrada
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Data</th>
              <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Tipo</th>
              <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Categoria</th>
              <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Descrição</th>
              <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Valor</th>
              <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Forma Pagamento</th>
              <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Pago</th>
              <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-white/[0.03]">
            {newRow && (
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                  <input
                    className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    type="date"
                    value={newRow.data || ""}
                    onChange={e => setNewRow({ ...newRow, data: e.target.value })}
                    disabled={saving}
                  />
                </td>
                <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                  <select
                    className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={newRow.tipo || ""}
                    onChange={e => setNewRow({ ...newRow, tipo: e.target.value })}
                    disabled={saving}
                  >
                    <option value="Receita">Receita</option>
                    <option value="Despesa">Despesa</option>
                  </select>
                </td>
                <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                  <input
                    className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={newRow.categoria || ""}
                    onChange={e => setNewRow({ ...newRow, categoria: e.target.value })}
                    disabled={saving}
                    placeholder="Categoria"
                  />
                </td>
                <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                  <input
                    className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={newRow.descricao || ""}
                    onChange={e => setNewRow({ ...newRow, descricao: e.target.value })}
                    disabled={saving}
                    placeholder="Descrição"
                  />
                </td>
                <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                  <input
                    className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    type="number"
                    step="0.01"
                    value={newRow.valor || ""}
                    onChange={e => setNewRow({ ...newRow, valor: parseFloat(e.target.value) || 0 })}
                    disabled={saving}
                    placeholder="0.00"
                  />
                </td>
                <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                  <input
                    className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={newRow.forma_pagamento || ""}
                    onChange={e => setNewRow({ ...newRow, forma_pagamento: e.target.value })}
                    disabled={saving}
                    placeholder="Forma de pagamento"
                  />
                </td>
                <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                  <input
                    className="w-4 h-4"
                    type="checkbox"
                    checked={newRow.pago || false}
                    onChange={e => setNewRow({ ...newRow, pago: e.target.checked })}
                    disabled={saving}
                  />
                </td>
                <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                      onClick={handleSaveNew}
                      disabled={saving}
                    >
                      Salvar
                    </button>
                    <button
                      className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 disabled:opacity-50"
                      onClick={handleCancelNew}
                      disabled={saving}
                    >
                      Cancelar
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {cashflow.map(row =>
              editingId === row.id ? (
                <tr key={row.id} className="border-b border-gray-200 dark:border-gray-700">
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                    <input
                      className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      type="date"
                      value={editRow?.data ? new Date(editRow.data).toISOString().split('T')[0] : ""}
                      onChange={e => setEditRow({ ...editRow!, data: e.target.value })}
                      disabled={saving}
                    />
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                    <select
                      className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      value={editRow?.tipo || ""}
                      onChange={e => setEditRow({ ...editRow!, tipo: e.target.value })}
                      disabled={saving}
                    >
                      <option value="Receita">Receita</option>
                      <option value="Despesa">Despesa</option>
                    </select>
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                    <input
                      className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      value={editRow?.categoria || ""}
                      onChange={e => setEditRow({ ...editRow!, categoria: e.target.value })}
                      disabled={saving}
                    />
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                    <input
                      className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      value={editRow?.descricao || ""}
                      onChange={e => setEditRow({ ...editRow!, descricao: e.target.value })}
                      disabled={saving}
                    />
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                    <input
                      className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      type="number"
                      step="0.01"
                      value={editRow?.valor || ""}
                      onChange={e => setEditRow({ ...editRow!, valor: parseFloat(e.target.value) || 0 })}
                      disabled={saving}
                    />
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                    <input
                      className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      value={editRow?.forma_pagamento || ""}
                      onChange={e => setEditRow({ ...editRow!, forma_pagamento: e.target.value })}
                      disabled={saving}
                    />
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                    <input
                      className="w-4 h-4"
                      type="checkbox"
                      checked={editRow?.pago || false}
                      onChange={e => setEditRow({ ...editRow!, pago: e.target.checked })}
                      disabled={saving}
                    />
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                        onClick={handleSaveEdit}
                        disabled={saving}
                      >
                        Salvar
                      </button>
                      <button
                        className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 disabled:opacity-50"
                        onClick={handleCancelEdit}
                        disabled={saving}
                      >
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={row.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm">{formatDate(row.data)}</td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      row.tipo === 'Receita' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}>
                      {row.tipo}
                    </span>
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm">{row.categoria}</td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm">{row.descricao}</td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-medium">
                    <span className={row.tipo === 'Receita' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      {formatCurrency(row.valor)}
                    </span>
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm">{row.forma_pagamento}</td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      row.pago 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                    }`}>
                      {row.pago ? 'Pago' : 'Pendente'}
                    </span>
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
                        onClick={() => handleEditRow(row)}
                        disabled={!!editingId || saving}
                      >
                        Editar
                      </button>
                      <button
                        className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 disabled:opacity-50"
                        onClick={() => handleDeleteRow(row.id)}
                        disabled={!!editingId || saving}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {cashflow.length === 0 && !newRow && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Nenhuma entrada encontrada. Clique em "Adicionar Entrada" para começar.
        </div>
      )}
    </div>
  );
} 