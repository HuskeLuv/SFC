"use client";
import React, { useState, useRef, useEffect } from "react";

export type ColorOption = "black" | "green" | "red" | "blue" | "yellow";

interface ColorPickerButtonProps {
  onColorSelect: (color: ColorOption | null) => void;
  selectedColor: ColorOption | null;
  isColorModeActive: boolean;
}

const COLOR_OPTIONS: Array<{ value: ColorOption; label: string; emoji: string; cssColor: string }> = [
  { value: "black", label: "Preto", emoji: "⚫", cssColor: "#000000" },
  { value: "green", label: "Verde", emoji: "🟢", cssColor: "#00FF00" },
  { value: "red", label: "Vermelho", emoji: "🔴", cssColor: "#FF0000" },
  { value: "blue", label: "Azul", emoji: "🔵", cssColor: "#0000FF" },
  { value: "yellow", label: "Amarelo", emoji: "🟡", cssColor: "#FFFF00" },
];

export const ColorPickerButton: React.FC<ColorPickerButtonProps> = ({
  onColorSelect,
  selectedColor,
  isColorModeActive,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleColorClick = (color: ColorOption) => {
    if (selectedColor === color) {
      // Se clicar na mesma cor, desativa o modo de cor
      onColorSelect(null);
    } else {
      onColorSelect(color);
    }
    setIsOpen(false);
  };

  const handleButtonClick = () => {
    if (isColorModeActive && selectedColor) {
      // Se já está em modo de cor ativo, desativa ao clicar no botão
      onColorSelect(null);
      setIsOpen(false);
    } else {
      // Caso contrário, abre o menu
      setIsOpen(!isOpen);
    }
  };

  const getActiveColorCss = (): string => {
    if (!selectedColor) return "#000000";
    const option = COLOR_OPTIONS.find((opt) => opt.value === selectedColor);
    return option?.cssColor || "#000000";
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleButtonClick}
        aria-label="Alterar cor do texto"
        className={`rounded-full w-6 h-6 flex items-center justify-center border border-blue-600 bg-blue-500 text-white shadow hover:bg-blue-600 focus:outline-none transition-all ${
          isColorModeActive
            ? "ring-2 ring-blue-300"
            : ""
        }`}
        title={isColorModeActive ? "Desativar modo de cor" : "Alterar cor do texto"}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Balde de tinta - estilo mais simples e limpo */}
          <path
            d="M3 4L8 2L13 4V9C13 11 11 13 8 13C5 13 3 11 3 9V4Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Alça do balde */}
          <path
            d="M6 4L10 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Gota de tinta saindo do balde */}
          <path
            d="M8 9L8 13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle
            cx="8"
            cy="13.5"
            r="1.2"
            fill="currentColor"
          />
        </svg>
        {isColorModeActive && (
          <span
            className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white"
            style={{ backgroundColor: getActiveColorCss() }}
          />
        )}
      </button>

      {isOpen && (
        <div className="absolute top-8 left-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 min-w-[140px]">
          <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 px-2">
            Escolher cor:
          </div>
          {COLOR_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleColorClick(option.value)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                selectedColor === option.value
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : "text-gray-700 dark:text-gray-300"
              }`}
              style={
                selectedColor === option.value
                  ? {}
                  : { color: option.cssColor }
              }
            >
              <span className="text-base">{option.emoji}</span>
              <span>{option.label}</span>
              {selectedColor === option.value && (
                <span className="ml-auto text-blue-600 dark:text-blue-400">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

