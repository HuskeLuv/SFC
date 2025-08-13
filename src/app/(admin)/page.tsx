import type { Metadata } from "next";
import DividendChart from "@/components/stocks/DividendChart";
import LatestTransactions from "@/components/stocks/LatestTransactions";
import PortfolioPerformance from "@/components/stocks/PortfolioPerformance";
import StockMetricsList from "@/components/stocks/StockMetricsList";
import TrendingStocks from "@/components/stocks/TrendingStocks";
import WatchList from "@/components/stocks/WatchList";
import React from "react";

export const metadata: Metadata = {
  title: "Dashboard de Ações",
  description:
    "Esta é a página do Dashboard de Ações",
};

export default function Stocks() {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12">
        <StockMetricsList />
      </div>
      <div className="col-span-12 space-y-6 xl:col-span-8">
        <div>
          <PortfolioPerformance />
        </div>
        <TrendingStocks />
      </div>
      <div className="col-span-12 space-y-6 xl:col-span-4">
        <DividendChart />
        <WatchList />
      </div>
      <div className="col-span-12">
        <LatestTransactions />
      </div>
    </div>
  );
}
