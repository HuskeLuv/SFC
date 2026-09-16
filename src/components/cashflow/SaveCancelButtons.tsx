import React from 'react';
import { ColorPickerButton, ColorOption } from './ColorPickerButton';
import { CommentButton } from './CommentButton';
import { AddRowButton } from './AddRowButton';

interface SaveCancelButtonsProps {
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  /** "+ Linha": presente só em grupos que aceitam linhas novas. */
  onAddRow?: () => void;
  groupName?: string;
  selectedColor?: ColorOption | null;
  onColorSelect?: (color: ColorOption | null) => void;
  isCommentModeActive?: boolean;
  onCommentClick?: (() => void) | null;
}

const SOLID =
  'inline-flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * Barra de edição do grupo: [+ Linha] [cor] [comentário] · [salvar] [cancelar].
 * Os três primeiros seguem o contorno da linha (ghost); salvar/cancelar são
 * sólidos verde/vermelho (semânticos).
 */
export const SaveCancelButtons: React.FC<SaveCancelButtonsProps> = ({
  onSave,
  onCancel,
  saving = false,
  onAddRow,
  groupName = '',
  selectedColor = null,
  onColorSelect,
  isCommentModeActive = false,
  onCommentClick,
}) => (
  <div className="flex flex-shrink-0 items-center gap-1">
    {onAddRow && <AddRowButton onClick={onAddRow} groupName={groupName} />}
    {onColorSelect && (
      <ColorPickerButton
        onColorSelect={onColorSelect}
        selectedColor={selectedColor || null}
        isColorModeActive={selectedColor !== null}
      />
    )}
    {onCommentClick && (
      <CommentButton onClick={onCommentClick} isCommentModeActive={isCommentModeActive} />
    )}
    <span className="mx-0.5 h-4 w-px bg-current/30" aria-hidden />
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      aria-label="Salvar alterações"
      title="Salvar alterações"
      className={`${SOLID} bg-success-500 hover:bg-success-600`}
    >
      {saving ? (
        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M13.3 4L6 11.3 2.7 8"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
    <button
      type="button"
      onClick={onCancel}
      disabled={saving}
      aria-label="Cancelar edição"
      title="Cancelar edição"
      className={`${SOLID} bg-error-500 hover:bg-error-600`}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M12 4L4 12M4 4l8 8"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  </div>
);
