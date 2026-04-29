import React from 'react';

interface IRStateMessageProps {
  variant: 'error' | 'empty';
  title: string;
  description?: string;
}

export default function IRStateMessage({ variant, title, description }: IRStateMessageProps) {
  const titleClass =
    variant === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300';
  return (
    <div className="flex flex-col items-center justify-center space-y-2 py-12 text-center">
      <h3 className={`text-base font-semibold ${titleClass}`}>{title}</h3>
      {description && (
        <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
    </div>
  );
}
