import { useState, useEffect, useCallback } from 'react';
import { fetchStockPrices } from '@/utils/stockData';
import {
  StockWithPrice,
  WatchlistItem,
  PortfolioItem,
  StockTransactionWithStock,
  StockTransactionInput,
  PortfolioStats
} from '@/types/stocks';
import { useAuth } from './useAuth';

export const useStocks = () => {
  const { isAuthenticated, requireAuth } = useAuth();
  const [stocks, setStocks] = useState<StockWithPrice[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [transactions, setTransactions] = useState<StockTransactionWithStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Buscar todos os ativos disponíveis
  const fetchStocks = useCallback(async () => {
    if (!requireAuth()) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/stocks');
      if (!response.ok) throw new Error('Erro ao buscar ativos');
      
      const data = await response.json();
      setStocks(data);
      
      // Buscar dados de preço para os ativos
      const tickers = data.map((stock: { ticker: string }) => stock.ticker);
      const priceData = await fetchStockPrices(tickers);
      
      // Combinar dados dos ativos com preços
      const stocksWithPrices = data.map((stock: { ticker: string; [key: string]: unknown }) => {
        const price = priceData.find(p => p.ticker === stock.ticker);
        return { ...stock, priceData: price };
      });
      
      setStocks(stocksWithPrices);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [requireAuth]);

  // Buscar watchlist do usuário
  const fetchWatchlist = useCallback(async () => {
    if (!requireAuth()) return;
    
    try {
      const response = await fetch('/api/stocks/watchlist');
      if (!response.ok) throw new Error('Erro ao buscar watchlist');
      
      const data = await response.json();
      
      // Adicionar dados de preço
      const tickers = data.map((item: WatchlistItem) => item.stock.ticker);
      const priceData = await fetchStockPrices(tickers);
      
      const watchlistWithPrices = data.map((item: WatchlistItem) => {
        const price = priceData.find(p => p.ticker === item.stock.ticker);
        return {
          ...item,
          stock: { ...item.stock, priceData: price }
        };
      });
      
      setWatchlist(watchlistWithPrices);
      
    } catch (err) {
      console.error('Erro ao buscar watchlist:', err);
    }
  }, [requireAuth]);

  // Buscar portfolio do usuário
  const fetchPortfolio = useCallback(async () => {
    if (!requireAuth()) return;
    
    try {
      const response = await fetch('/api/stocks/portfolio');
      if (!response.ok) throw new Error('Erro ao buscar portfolio');
      
      const data = await response.json();
      
      // Adicionar dados de preço e calcular retornos
      const tickers = data.map((item: PortfolioItem) => item.stock.ticker);
      const priceData = await fetchStockPrices(tickers);
      
      const portfolioWithPrices = data.map((item: PortfolioItem) => {
        const price = priceData.find(p => p.ticker === item.stock.ticker);
        const currentValue = price ? price.currentPrice * item.quantity : 0;
        const totalReturn = currentValue - item.totalInvested;
        const returnPercent = item.totalInvested > 0 ? (totalReturn / item.totalInvested) * 100 : 0;
        
        return {
          ...item,
          stock: { ...item.stock, priceData: price },
          currentValue,
          totalReturn,
          returnPercent
        };
      });
      
      setPortfolio(portfolioWithPrices);
      
    } catch (err) {
      console.error('Erro ao buscar portfolio:', err);
    }
  }, [requireAuth]);

  // Buscar transações do usuário
  const fetchTransactions = useCallback(async () => {
    if (!requireAuth()) return;
    
    try {
      const response = await fetch('/api/stocks/transactions');
      if (!response.ok) throw new Error('Erro ao buscar transações');
      
      const data = await response.json();
      setTransactions(data);
      
    } catch (err) {
      console.error('Erro ao buscar transações:', err);
    }
  }, [requireAuth]);

  // Adicionar ativo ao watchlist
  const addToWatchlist = useCallback(async (stockId: string, notes?: string) => {
    if (!requireAuth()) return false;
    
    try {
      const response = await fetch('/api/stocks/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId, notes }),
      });
      
      if (!response.ok) throw new Error('Erro ao adicionar ao watchlist');
      
      await fetchWatchlist(); // Recarregar watchlist
      return true;
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar ao watchlist');
      return false;
    }
  }, [fetchWatchlist, requireAuth]);

  // Remover do watchlist
  const removeFromWatchlist = useCallback(async (stockId: string) => {
    if (!requireAuth()) return false;
    
    try {
      const response = await fetch(`/api/stocks/watchlist/${stockId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Erro ao remover do watchlist');
      
      await fetchWatchlist(); // Recarregar watchlist
      return true;
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover do watchlist');
      return false;
    }
  }, [fetchWatchlist, requireAuth]);

  // Registrar transação
  const addTransaction = useCallback(async (transactionData: StockTransactionInput) => {
    if (!requireAuth()) return false;
    
    try {
      const response = await fetch('/api/stocks/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transactionData),
      });
      
      if (!response.ok) throw new Error('Erro ao registrar transação');
      
      await fetchTransactions(); // Recarregar transações
      await fetchPortfolio(); // Recarregar portfolio
      return true;
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar transação');
      return false;
    }
  }, [fetchTransactions, fetchPortfolio, requireAuth]);

  // Buscar ativo por ticker
  const findStockByTicker = useCallback((ticker: string) => {
    return stocks.find(stock => stock.ticker === ticker);
  }, [stocks]);

  // Calcular estatísticas do portfolio
  const getPortfolioStats = useCallback((): PortfolioStats => {
    if (portfolio.length === 0) {
      return {
        totalInvested: 0,
        currentValue: 0,
        totalReturn: 0,
        returnPercent: 0,
        totalQuantity: 0
      };
    }

    const totalInvested = portfolio.reduce((sum, item) => sum + item.totalInvested, 0);
    const currentValue = portfolio.reduce((sum, item) => sum + item.currentValue, 0);
    const totalReturn = currentValue - totalInvested;
    const returnPercent = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;
    const totalQuantity = portfolio.reduce((sum, item) => sum + item.quantity, 0);

    return {
      totalInvested,
      currentValue,
      totalReturn,
      returnPercent,
      totalQuantity
    };
  }, [portfolio]);

  // Carregar dados iniciais apenas se estiver autenticado
  useEffect(() => {
    if (isAuthenticated) {
      fetchStocks();
      fetchWatchlist();
      fetchPortfolio();
      fetchTransactions();
    }
  }, [isAuthenticated, fetchStocks, fetchWatchlist, fetchPortfolio, fetchTransactions]);

  return {
    // Estado
    stocks,
    watchlist,
    portfolio,
    transactions,
    loading,
    error,
    
    // Ações
    fetchStocks,
    fetchWatchlist,
    fetchPortfolio,
    fetchTransactions,
    addToWatchlist,
    removeFromWatchlist,
    addTransaction,
    findStockByTicker,
    
    // Estatísticas
    getPortfolioStats,
    
    // Utilitários
    clearError: () => setError(null),
  };
}; 