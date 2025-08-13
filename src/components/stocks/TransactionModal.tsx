"use client";
import React, { useState, useEffect } from 'react';
import { useStocks } from '@/hooks/useStocks';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TransactionModal({ isOpen, onClose }: TransactionModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStock, setSelectedStock] = useState<string>('');
  const [transactionType, setTransactionType] = useState<'compra' | 'venda'>('compra');
  const [quantity, setQuantity] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [date, setDate] = useState<string>('');
  const [fees, setFees] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { stocks, addTransaction, portfolio } = useStocks();

  const filteredStocks = stocks.filter(stock =>
    stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
    stock.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calcular total da transação
  const total = quantity * price;
  const totalWithFees = total + fees;

  // Verificar se há quantidade suficiente para venda
  const selectedPortfolioItem = portfolio.find(item => item.stockId === selectedStock);
  const canSell = transactionType === 'compra' || 
    (selectedPortfolioItem && selectedPortfolioItem.quantity >= quantity);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedStock || quantity <= 0 || price <= 0 || !date) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }

    if (transactionType === 'venda' && !canSell) {
      alert('Quantidade insuficiente para venda');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const success = await addTransaction({
        stockId: selectedStock,
        type: transactionType,
        quantity,
        price,
        date: new Date(date),
        fees: fees || 0,
        notes: notes || undefined,
      });
      
      if (success) {
        // Limpar formulário
        setSearchTerm('');
        setSelectedStock('');
        setQuantity(0);
        setPrice(0);
        setDate('');
        setFees(0);
        setNotes('');
        onClose();
      }
    } catch (error) {
      console.error('Erro ao registrar transação:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setSearchTerm('');
      setSelectedStock('');
      setQuantity(0);
      setPrice(0);
      setDate('');
      setFees(0);
      setNotes('');
      onClose();
    }
  };

  // Definir data padrão como hoje
  useEffect(() => {
    if (isOpen && !date) {
      const today = new Date().toISOString().split('T')[0];
      setDate(today);
    }
  }, [isOpen, date]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
            Registrar Transação
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
          {/* Tipo de transação */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tipo de Transação
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTransactionType('compra')}
                className={`flex-1 py-2 px-4 rounded-md border ${
                  transactionType === 'compra'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                }`}
              >
                Compra
              </button>
              <button
                type="button"
                onClick={() => setTransactionType('venda')}
                className={`flex-1 py-2 px-4 rounded-md border ${
                  transactionType === 'venda'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
                }`}
              >
                Venda
              </button>
            </div>
          </div>

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
                    {selectedPortfolioItem && (
                      <div className="text-xs text-blue-600 dark:text-blue-400">
                        Possui: {selectedPortfolioItem.quantity} ações
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

          {/* Quantidade */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Quantidade de ações
            </label>
            <input
              type="number"
              value={quantity || ''}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              min="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Preço por ação */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Preço por ação (R$)
            </label>
            <input
              type="number"
              value={price || ''}
              onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
              min="0.01"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Data */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Data da transação
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Taxas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Taxas (R$) - opcional
            </label>
            <input
              type="number"
              value={fees || ''}
              onChange={(e) => setFees(parseFloat(e.target.value) || 0)}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Adicione observações sobre esta transação..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Resumo da transação */}
          {quantity > 0 && price > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <div className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                Resumo da Transação
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <div>Subtotal: R$ {total.toFixed(2)}</div>
                {fees > 0 && <div>Taxas: R$ {fees.toFixed(2)}</div>}
                <div className="font-medium">Total: R$ {totalWithFees.toFixed(2)}</div>
              </div>
            </div>
          )}

          {/* Validação para venda */}
          {transactionType === 'venda' && selectedStock && quantity > 0 && !canSell && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
              <div className="text-sm text-red-700 dark:text-red-300">
                ⚠️ Quantidade insuficiente para venda. Você possui {selectedPortfolioItem?.quantity || 0} ações.
              </div>
            </div>
          )}

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
              disabled={!selectedStock || quantity <= 0 || price <= 0 || !date || !canSell || isSubmitting}
              className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Registrando...' : `Registrar ${transactionType}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 