"use client";
import React, { useState } from 'react';
import { useStocks } from '@/hooks/useStocks';

interface AddToWatchlistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddToWatchlistModal({ isOpen, onClose }: AddToWatchlistModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStock, setSelectedStock] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { stocks, addToWatchlist } = useStocks();

  const filteredStocks = stocks.filter(stock =>
    stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stock.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedStock) {
      alert('Selecione um ativo');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const success = await addToWatchlist(selectedStock, notes);
      if (success) {
        setSearchTerm('');
        setSelectedStock('');
        setNotes('');
        onClose();
      }
    } catch (error) {
      console.error('Erro ao adicionar ao watchlist:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setSearchTerm('');
      setSelectedStock('');
      setNotes('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
            Adicionar ao Watchlist
          </h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Busca de ativos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Buscar ativo
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Digite o ticker ou nome da empresa..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Lista de ativos filtrados */}
          {searchTerm && (
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md">
              {filteredStocks.length === 0 ? (
                <div className="p-3 text-gray-500 text-center">
                  Nenhum ativo encontrado
                </div>
              ) : (
                filteredStocks.map((stock) => (
                  <button
                    key={stock.id}
                    type="button"
                    onClick={() => setSelectedStock(stock.id)}
                    className={`w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      selectedStock === stock.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-800 dark:text-white">
                      {stock.ticker}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {stock.companyName}
                    </div>
                    {stock.sector && (
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {stock.sector}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Ativo selecionado */}
          {selectedStock && (
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Ativo selecionado:
              </div>
              <div className="font-medium text-gray-800 dark:text-white">
                {stocks.find(s => s.id === selectedStock)?.ticker} - {stocks.find(s => s.id === selectedStock)?.companyName}
              </div>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Adicione observações sobre este ativo..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!selectedStock || isSubmitting}
              className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 