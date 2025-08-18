import React from "react";

interface Tab {
  label: string;
  value: string;
}

interface ChartTabProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (value: string) => void;
}

const ChartTab: React.FC<ChartTabProps> = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          className={`px-3 py-2 font-medium w-full rounded-md text-theme-sm hover:text-gray-900 dark:hover:text-white ${
            activeTab === tab.value
              ? "shadow-theme-xs text-gray-900 dark:text-white bg-white dark:bg-gray-800"
              : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default ChartTab;
