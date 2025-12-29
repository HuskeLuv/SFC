"use client";
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (comment: string) => Promise<void>;
  initialComment: string | null;
  updatedAt: Date | null;
  itemName: string;
  month: number;
  year: number;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export const CommentModal: React.FC<CommentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialComment,
  updatedAt,
  itemName,
  month,
  year,
}) => {
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setComment(initialComment || "");
      // Focus no textarea quando abrir
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen, initialComment]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(comment);
      onClose();
    } catch (error) {
      console.error("Erro ao salvar comentário:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setComment(initialComment || "");
    onClose();
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  if (!isOpen) return null;

  return typeof window !== 'undefined' && createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center z-[10000] pointer-events-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCancel();
        }
      }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Comentários
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {itemName} - {MONTH_NAMES[month]} / {year}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <textarea
            ref={textareaRef}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Digite seu comentário aqui..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
            rows={6}
            disabled={isSaving}
          />
          
          {updatedAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-right">
              Última edição: {formatDate(updatedAt)}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

