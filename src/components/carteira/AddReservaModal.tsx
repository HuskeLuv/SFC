"use client";
import React, { useState, useEffect } from "react";
import { PlusIcon, CloseIcon } from "@/icons";

interface AddReservaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tipo: "emergency" | "opportunity";
}

export default function AddReservaModal({ 
  isOpen, 
  onClose, 
  onSuccess,
  tipo 
}: AddReservaModalProps) {
  const [formData, setFormData] = useState({
    valor: "",
    data: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !formData.data) {
      const today = new Date().toISOString().split('T')[0];
      setFormData(prev => ({ ...prev, data: today }));
    }
  }, [isOpen, formData.data]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const valor = parseFloat(formData.valor);
      if (isNaN(valor) || valor <= 0) {
        setError("Valor deve ser maior que zero");
        setLoading(false);
        return;
      }

      if (!formData.data) {
        setError("Data é obrigatória");
        setLoading(false);
        return;
      }

      // Buscar ou criar Asset para reserva
      const assetSymbol = tipo === "emergency" ? "RESERVA-EMERG" : "RESERVA-OPORT";
      
      // Buscar o asset existente
      const searchResponse = await fetch(`/api/assets?search=${assetSymbol}&limit=1`, {
        credentials: "include",
      });
      
      let assetId;
      if (searchResponse.ok) {
        const data = await searchResponse.json();
        if (data.assets && data.assets.length > 0) {
          assetId = data.assets[0].id;
        } else {
          // Se não encontrou, usar um ID temporário - a API criará automaticamente
          assetId = "temp-" + assetSymbol;
        }
      } else {
        // Se não conseguiu buscar, usar ID temporário
        assetId = "temp-" + assetSymbol;
      }

      // Buscar uma instituição padrão
      const institutionResponse = await fetch("/api/institutions?search=&limit=10", {
        credentials: "include",
      });
      let institutionId;
      if (institutionResponse.ok) {
        const institutions = await institutionResponse.json();
        if (institutions.institutions && institutions.institutions.length > 0) {
          // Usar a primeira instituição disponível
          institutionId = institutions.institutions[0].id;
        }
      }

      // Se não encontrou instituição, usar uma genérica (a API pode criar automaticamente)
      if (!institutionId) {
        // Tentar buscar qualquer instituição
        const allInstResponse = await fetch("/api/institutions?limit=1", {
          credentials: "include",
        });
        if (allInstResponse.ok) {
          const allInst = await allInstResponse.json();
          if (allInst.institutions && allInst.institutions.length > 0) {
            institutionId = allInst.institutions[0].id;
          }
        }
      }

      // Se ainda não encontrou, usar um ID temporário - a API pode lidar com isso
      if (!institutionId) {
        institutionId = "temp-reserva";
      }

      // Criar a operação
      const response = await fetch("/api/carteira/operacao", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          tipoAtivo: tipo,
          instituicaoId: institutionId || "temp-reserva",
          assetId: assetId || "temp-" + (tipo === "emergency" ? "RESERVA-EMERG" : "RESERVA-OPORT"),
          dataCompra: formData.data,
          valorInvestido: valor,
          quantidade: 1,
          cotacaoUnitaria: valor,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao adicionar reserva");
      }

      // Reset form
      setFormData({
        valor: "",
        data: new Date().toISOString().split('T')[0],
      });

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  if (!isOpen) return null;

  const titulo = tipo === "emergency" ? "Adicionar Reserva de Emergência" : "Adicionar Reserva de Oportunidade";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {titulo}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            disabled={loading}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Valor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Valor (R$)
              </label>
              <input
                type="number"
                name="valor"
                value={formData.valor}
                onChange={handleInputChange}
                required
                min="0"
                step="0.01"
                placeholder="0,00"
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50"
              />
            </div>

            {/* Data */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Data
              </label>
              <input
                type="date"
                name="data"
                value={formData.data}
                onChange={handleInputChange}
                required
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <PlusIcon className="w-4 h-4" />
                  <span>Adicionar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

