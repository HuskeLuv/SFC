"use client";
import React, { useState, useRef, useEffect } from "react";
import Label from "./Label";
import Input from "./input/InputField";

interface AutocompleteOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface AutocompleteInputProps {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (option: AutocompleteOption) => void;
  options: AutocompleteOption[];
  loading?: boolean;
  error?: boolean;
  hint?: string;
  className?: string;
}

const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  id,
  label,
  placeholder,
  value,
  onChange,
  onSelect,
  options,
  loading = false,
  error = false,
  hint,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleOptionSelect = (option: AutocompleteOption) => {
    onSelect(option);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        return;
      }
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < options.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : options.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && options[highlightedIndex]) {
          handleOptionSelect(options[highlightedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(value.toLowerCase()) ||
    (option.subtitle && option.subtitle.toLowerCase().includes(value.toLowerCase()))
  );

  return (
    <div className={`relative ${className}`}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          error={error}
          hint={hint}
        />
        
        {/* Loading indicator */}
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500"></div>
          </div>
        )}

        {/* Dropdown */}
        {isOpen && (filteredOptions.length > 0 || loading) && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            {loading ? (
              <div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">
                Carregando...
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhum resultado encontrado
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto">
                {filteredOptions.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                      index === highlightedIndex
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400"
                        : "text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700"
                    }`}
                    onClick={() => handleOptionSelect(option)}
                  >
                    <div className="font-medium">{option.label}</div>
                    {option.subtitle && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {option.subtitle}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AutocompleteInput;
