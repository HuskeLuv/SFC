"use client";
import React, { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "../../icons";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { MoreDotIcon } from "@/icons";
import { useStocks } from "@/hooks/useStocks";
import { WatchlistItem } from "@/types/stocks";
import AddToWatchlistModal from "./AddToWatchlistModal";

const WatchlistItemComponent: React.FC<{
  item: WatchlistItem;
}> = ({ item }) => {
  const { stock } = item;
  const priceData = stock.priceData;
  
  if (!priceData) {
    return (
      <div className="flex items-center justify-between pt-4 pb-4 border-b border-gray-200 first:pt-0 last:border-b-0 last:pb-0 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-gray-600 text-sm font-semibold">
              {stock.ticker.substring(0, 2)}
            </span>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {stock.ticker}
            </h3>
            <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
              {stock.companyName}
            </span>
          </div>
        </div>
        <div className="text-gray-400 text-sm">Carregando...</div>
      </div>
    );
  }

  const changeDirection = priceData.change >= 0 ? "up" : "down";
  const changeColor = changeDirection === "up" ? "text-success-600 dark:text-success-500" : "text-error-600 dark:text-error-500";

  return (
    <div className="flex items-center justify-between pt-4 pb-4 border-b border-gray-200 first:pt-0 last:border-b-0 last:pb-0 dark:border-gray-800">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
          <span className="text-gray-600 text-sm font-semibold">
            {stock.ticker.substring(0, 2)}
          </span>
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            {stock.ticker}
          </h3>
          <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
            {stock.companyName}
          </span>
          {item.notes && (
            <span className="block text-gray-400 text-xs italic">
              {item.notes}
            </span>
          )}
        </div>
      </div>
      <div>
        <h4 className="mb-1 font-medium text-right text-gray-700 text-theme-sm dark:text-gray-400">
          R$ {priceData.currentPrice.toFixed(2)}
        </h4>
        <span
          className={`flex items-center justify-end gap-1 font-medium text-theme-xs ${changeColor}`}
        >
          {changeDirection === "up" ? <ArrowUpIcon /> : <ArrowDownIcon />}
          {priceData.changePercent.toFixed(2)}%
        </span>
      </div>
    </div>
  );
};

export default function WatchList() {
  const [isOpen, setIsOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const { watchlist, loading, error } = useStocks();

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Minha Lista de Observação
          </h3>
        </div>
        <div className="flex items-center justify-center h-[372px]">
          <div className="text-gray-500">Carregando...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Minha Lista de Observação
          </h3>
        </div>
        <div className="flex items-center justify-center h-[372px]">
          <div className="text-red-500">Erro: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Minha Lista de Observação
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              + Adicionar
            </button>
            <div className="relative h-fit">
              <button onClick={toggleDropdown} className="dropdown-toggle">
                <MoreDotIcon className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" />
              </button>
              <Dropdown
                isOpen={isOpen}
                onClose={closeDropdown}
                className="w-40 p-2"
              >
                <DropdownItem
                  onItemClick={closeDropdown}
                  className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
                >
                  Ver Mais
                </DropdownItem>
              </Dropdown>
            </div>
          </div>
        </div>

        <div className="flex h-[372px] flex-col">
          {watchlist.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="text-lg mb-2">Lista vazia</div>
              <div className="text-sm text-center mb-4">
                Adicione ativos à sua lista de observação para acompanhar seus preços
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Adicionar Primeiro Ativo
              </button>
            </div>
          ) : (
            <div className="flex flex-col h-auto pr-3 overflow-y-auto custom-scrollbar">
              {watchlist.map((item) => (
                <WatchlistItemComponent
                  key={item.id}
                  item={item}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AddToWatchlistModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
      />
    </>
  );
}
