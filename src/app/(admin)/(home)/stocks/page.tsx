'use client';

import dynamic from 'next/dynamic';
import DividendChart from '@/components/stocks/DividendChart';
import LatestTransactions from '@/components/stocks/LatestTransactions';
import PortfolioPerformance from '@/components/stocks/PortfolioPerformance';
import WatchList from '@/components/stocks/WatchList';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import React from 'react';

const TrendingStocks = dynamic(() => import('@/components/stocks/TrendingStocks'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-64" />,
});

export default function Stocks() {
  return (
    <ProtectedRoute>
      <div className="grid grid-cols-12 gap-4 md:gap-6">
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
    </ProtectedRoute>
  );
}
