"use client";
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface CommentIndicatorProps {
  comment: string;
  itemName: string;
  month: number;
  year: number;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export const CommentIndicator: React.FC<CommentIndicatorProps> = ({
  comment,
  itemName,
  month,
  year,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const indicatorRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showTooltip && indicatorRef.current) {
      const updatePosition = () => {
        if (indicatorRef.current) {
          const rect = indicatorRef.current.getBoundingClientRect();
          const tooltipWidth = 250; // max-w-xs é aproximadamente 250px
          const tooltipHeight = 100; // altura estimada
          
          let top = rect.bottom + window.scrollY + 8;
          let left = rect.left + window.scrollX;
          
          // Ajustar se o tooltip sair da tela à direita
          if (left + tooltipWidth > window.innerWidth + window.scrollX) {
            left = window.innerWidth + window.scrollX - tooltipWidth - 8;
          }
          
          // Ajustar se o tooltip sair da tela embaixo
          if (top + tooltipHeight > window.innerHeight + window.scrollY) {
            top = rect.top + window.scrollY - tooltipHeight - 8;
          }
          
          // Garantir que não saia da tela à esquerda
          if (left < window.scrollX) {
            left = window.scrollX + 8;
          }
          
          setTooltipPosition({ top, left });
        }
      };
      
      updatePosition();
      
      // Atualizar posição ao scrollar ou redimensionar
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [showTooltip]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        indicatorRef.current &&
        !indicatorRef.current.contains(event.target as Node)
      ) {
        setShowTooltip(false);
      }
    };

    if (showTooltip) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTooltip]);

  // Quebrar o texto do comentário em linhas para o tooltip
  const formatCommentForTooltip = (text: string): string => {
    // Manter quebras de linha existentes
    return text;
  };

  return (
    <>
      <div
        ref={indicatorRef}
        className="inline-flex items-center justify-center mr-1 cursor-pointer relative group"
        onMouseEnter={() => {
          setShowTooltip(true);
        }}
        onMouseLeave={() => {
          // Delay para permitir movimento do mouse para o tooltip
          setTimeout(() => {
            if (!tooltipRef.current?.matches(':hover') && !indicatorRef.current?.matches(':hover')) {
              setShowTooltip(false);
            }
          }, 150);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setShowTooltip(!showTooltip);
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-purple-600 dark:text-purple-400"
        >
          <path
            d="M3 2C2.44772 2 2 2.44772 2 3V10C2 10.5523 2.44772 11 3 11H5L7 13L9 11H13C13.5523 11 14 10.5523 14 10V3C14 2.44772 13.5523 2 13 2H3Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="currentColor"
            fillOpacity="0.1"
          />
          <circle cx="5" cy="6.5" r="0.8" fill="currentColor" />
          <circle cx="8" cy="6.5" r="0.8" fill="currentColor" />
          <circle cx="11" cy="6.5" r="0.8" fill="currentColor" />
        </svg>
      </div>

      {showTooltip && typeof window !== 'undefined' && createPortal(
        <div
          ref={tooltipRef}
          className="fixed bg-white dark:bg-gray-800 border-2 border-purple-300 dark:border-purple-600 rounded-lg shadow-2xl p-3 max-w-xs z-[99999] pointer-events-auto"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translateY(0)',
            minWidth: '200px',
          }}
          onMouseEnter={() => {
            setShowTooltip(true);
          }}
          onMouseLeave={() => {
            setShowTooltip(false);
          }}
        >
          <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
            {itemName} - {MONTH_NAMES[month]} / {year}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words">
            {formatCommentForTooltip(comment)}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

