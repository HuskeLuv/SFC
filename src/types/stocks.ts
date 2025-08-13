import { Stock, Watchlist, Portfolio, StockTransaction } from '@prisma/client';
import { StockPriceData } from '@/utils/stockData';

export interface StockWithPrice extends Stock {
  priceData?: StockPriceData;
}

export interface WatchlistItem extends Watchlist {
  stock: StockWithPrice;
}

export interface PortfolioItem extends Portfolio {
  stock: StockWithPrice;
  currentValue: number;
  totalReturn: number;
  returnPercent: number;
}

// Garantir que todas as propriedades do StockTransaction sejam incluídas
export interface StockTransactionWithStock {
  id: string;
  userId: string;
  stockId: string;
  type: string;
  quantity: number;
  price: number;
  total: number;
  date: Date;
  fees: number | null;
  notes: string | null;
  createdAt: Date;
  stock: Stock;
}

export interface StockTransactionInput {
  stockId: string;
  type: 'compra' | 'venda';
  quantity: number;
  price: number;
  date: Date;
  fees?: number;
  notes?: string;
}

export interface PortfolioStats {
  totalInvested: number;
  currentValue: number;
  totalReturn: number;
  returnPercent: number;
  totalQuantity: number;
} 