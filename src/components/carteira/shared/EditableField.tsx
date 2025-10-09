/**
 * Componente genérico de campo editável inline
 * Usado para editar cotações e objetivos nas tabelas
 */

import { useState, useEffect } from "react";

interface EditableFieldProps {
  value: number;
  onSubmit: (newValue: number) => void;
  formatDisplay?: (value: number) => string;
  min?: number;
  max?: number;
  step?: string;
  suffix?: string;
  inputWidth?: string;
  className?: string;
}

const EditableField: React.FC<EditableFieldProps> = ({
  value,
  onSubmit,
  formatDisplay,
  min = 0,
  max,
  step = "0.01",
  suffix,
  inputWidth = "w-20",
  className = "",
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const handleSubmit = () => {
    const newValue = parseFloat(inputValue);
    
    if (isNaN(newValue)) {
      setInputValue(value.toString());
      setIsEditing(false);
      return;
    }

    if (newValue < min || (max !== undefined && newValue > max)) {
      setInputValue(value.toString());
      setIsEditing(false);
      return;
    }

    onSubmit(newValue);
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setInputValue(value.toString());
      setIsEditing(false);
    }
  };

  const displayValue = formatDisplay ? formatDisplay(value) : value.toString();

  return (
    <>
      {isEditing ? (
        <div className="flex items-center space-x-1">
          <input
            type="number"
            step={step}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            onBlur={handleSubmit}
            className={`${inputWidth} px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white`}
            autoFocus
          />
          {suffix && <span className="text-xs text-gray-500">{suffix}</span>}
        </div>
      ) : (
        <div 
          className={`cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded ${className}`}
          onClick={() => setIsEditing(true)}
        >
          <span className="font-medium text-gray-900 dark:text-white">
            {displayValue}
          </span>
        </div>
      )}
    </>
  );
};

export default EditableField;

