"use client";

import React from "react";

const DataTableOne: React.FC = () => {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:mb-7">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 lg:text-xl">
            Data Table One
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            A simple data table component
          </p>
        </div>
      </div>
      
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        Data table content would go here
      </div>
    </div>
  );
};

export default DataTableOne;
