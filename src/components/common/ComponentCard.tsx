import React from 'react';

interface ComponentCardProps {
  title: string;
  children: React.ReactNode;
  className?: string; // Additional custom classes for styling
  desc?: string; // Description text
  /**
   * Classes extras do corpo (somadas ao corpo e ao div interno). PWA fase 2: a visão do mês usa
   * `max-lg:overflow-visible` para a barra do mês grudar (sticky) na rolagem da página.
   */
  bodyClassName?: string;
}

const ComponentCard: React.FC<ComponentCardProps> = ({
  title,
  children,
  className = '',
  desc = '',
  bodyClassName,
}) => {
  const extra = bodyClassName ? ` ${bodyClassName}` : '';
  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}
    >
      {/* Card Header */}
      <div className="px-6 py-5">
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">{title}</h3>
        {desc && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{desc}</p>}
      </div>
      {/* Card Body */}
      <div
        className={`border-t border-gray-100 dark:border-gray-800 ${className.includes('flex flex-col') ? 'flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden' : 'p-4 sm:p-6'}${extra}`}
      >
        <div
          className={`${
            className.includes('flex flex-col') ? 'flex-1 flex flex-col min-h-0' : 'space-y-6'
          }${extra}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default ComponentCard;
