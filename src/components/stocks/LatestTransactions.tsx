"use client";
import React, { useState } from "react";
import Image from "next/image";
import Badge from "../ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import { useStocks } from "@/hooks/useStocks";
import { StockTransactionWithStock } from "@/types/stocks";

export default function LatestTransactions() {
  const [searchTerm, setSearchTerm] = useState('');
  const { transactions, loading, error } = useStocks();

  // Filtrar transações por termo de busca
  const filteredTransactions = transactions.filter(transaction =>
    transaction.stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
    transaction.stock.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    transaction.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Formatar data
  const formatDate = (date: Date) => {
    const now = new Date();
    const transactionDate = new Date(date);
    const diffTime = Math.abs(now.getTime() - transactionDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return 'Hoje';
    } else if (diffDays === 2) {
      return 'Ontem';
    } else if (diffDays <= 7) {
      return `${diffDays - 1} dias atrás`;
    } else {
      return transactionDate.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: '2-digit'
      });
    }
  };

  // Formatar valor
  const formatValue = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // Obter cor do status
  const getStatusColor = (type: string) => {
    return type === 'compra' ? 'success' : 'warning';
  };

  // Obter texto do status
  const getStatusText = (type: string) => {
    return type === 'compra' ? 'Compra' : 'Venda';
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white pt-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-2 px-5 mb-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Últimas Transações
            </h3>
          </div>
        </div>
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-500">Carregando...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white pt-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-2 px-5 mb-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Últimas Transações
            </h3>
          </div>
        </div>
        <div className="flex items-center justify-center h-32">
          <div className="text-red-500">Erro: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white pt-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-2 px-5 mb-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Últimas Transações
          </h3>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form>
            <div className="relative">
              <button className="absolute -translate-y-1/2 left-4 top-1/2">
                <svg
                  className="fill-gray-500 dark:fill-gray-400"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M3.04199 9.37381C3.04199 5.87712 5.87735 3.04218 9.37533 3.04218C12.8733 3.04218 15.7087 5.87712 15.7087 9.37381C15.7087 12.8705 12.8733 15.7055 9.37533 15.7055C5.87735 15.7055 3.04199 12.8705 3.04199 9.37381ZM9.37533 1.54218C5.04926 1.54218 1.54199 5.04835 1.54199 9.37381C1.54199 13.6993 5.04926 17.2055 9.37533 17.2055C11.2676 17.2055 13.0032 16.5346 14.3572 15.4178L17.1773 18.2381C17.4702 18.531 17.945 18.5311 18.2379 18.2382C18.5308 17.9453 18.5309 17.4704 18.238 17.1775L15.4182 14.3575C16.5367 13.0035 17.2087 11.2671 17.2087 9.37381C17.2087 5.04835 13.7014 1.54218 9.37533 1.54218Z"
                    fill=""
                  />
                </svg>
              </button>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar..."
                className="dark:bg-dark-900 h-[42px] w-full rounded-lg border border-gray-300 bg-transparent py-2.5 pl-[42px] pr-4 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[300px]"
              />
            </div>
          </form>
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="max-w-full px-5 overflow-x-auto sm:px-6">
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-lg mb-2">Nenhuma transação encontrada</div>
              <div className="text-sm">
                Registre suas primeiras compras e vendas para começar a acompanhar o histórico
              </div>
            </div>
          ) : (
            <div className="">
              <Table>
                <TableHeader className="border-gray-200 border-y dark:border-gray-800">
                  <TableRow>
                    <TableCell className="text-left">
                      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Ativo
                      </span>
                    </TableCell>
                    <TableCell className="text-left">
                      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Tipo
                      </span>
                    </TableCell>
                    <TableCell className="text-left">
                      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Quantidade
                      </span>
                    </TableCell>
                    <TableCell className="text-left">
                      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Preço
                      </span>
                    </TableCell>
                    <TableCell className="text-left">
                      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Total
                      </span>
                    </TableCell>
                    <TableCell className="text-left">
                      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Data
                      </span>
                    </TableCell>
                    <TableCell className="text-left">
                      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Status
                      </span>
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((transaction) => (
                    <TableRow key={transaction.id} className="border-b border-gray-100 dark:border-gray-800">
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-gray-600 text-sm font-semibold">
                              {transaction.stock.ticker.substring(0, 2)}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium text-gray-800 dark:text-white">
                              {transaction.stock.ticker}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {transaction.stock.companyName}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge
                          variant="light"
                          color={getStatusColor(transaction.type)}
                        >
                          {getStatusText(transaction.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="text-gray-800 dark:text-white">
                          {transaction.quantity}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="text-gray-800 dark:text-white">
                          {formatValue(transaction.price)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="font-medium text-gray-800 dark:text-white">
                          {formatValue(transaction.total)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="text-gray-500 dark:text-gray-400">
                          {formatDate(transaction.date)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="light" color="success">
                          Concluída
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
