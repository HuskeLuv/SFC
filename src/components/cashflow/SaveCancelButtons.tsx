import React from "react";
import { ColorPickerButton, ColorOption } from "./ColorPickerButton";

interface SaveCancelButtonsProps {
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  selectedColor?: ColorOption | null;
  onColorSelect?: (color: ColorOption | null) => void;
}

export const SaveCancelButtons: React.FC<SaveCancelButtonsProps> = ({ 
  onSave, 
  onCancel, 
  saving = false,
  selectedColor = null,
  onColorSelect,
}) => {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {onColorSelect && (
        <div className="flex-shrink-0">
          <ColorPickerButton
            onColorSelect={onColorSelect}
            selectedColor={selectedColor || null}
            isColorModeActive={selectedColor !== null}
          />
        </div>
      )}
      <button
        onClick={onSave}
        disabled={saving}
        aria-label="Salvar alterações"
        className="rounded-full w-6 h-6 flex-shrink-0 flex items-center justify-center border border-green-600 bg-green-500 text-white shadow hover:bg-green-600 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Salvar alterações"
      >
        {saving ? (
          <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path 
              d="M13.3333 4L6 11.3333L2.66667 8" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <button
        onClick={onCancel}
        disabled={saving}
        aria-label="Cancelar edição"
        className="rounded-full w-6 h-6 flex-shrink-0 flex items-center justify-center border border-red-600 bg-red-500 text-white shadow hover:bg-red-600 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Cancelar edição"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path 
            d="M12 4L4 12M4 4L12 12" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
};

