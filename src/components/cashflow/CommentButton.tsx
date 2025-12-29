"use client";
import React from "react";

interface CommentButtonProps {
  onClick: () => void;
  isCommentModeActive: boolean;
}

export const CommentButton: React.FC<CommentButtonProps> = ({
  onClick,
  isCommentModeActive,
}) => {
  return (
    <button
      onClick={onClick}
      aria-label="Adicionar comentário"
      className={`rounded-full w-6 h-6 flex items-center justify-center border border-purple-600 bg-purple-500 text-white shadow hover:bg-purple-600 focus:outline-none transition-all ${
        isCommentModeActive
          ? "ring-2 ring-purple-300"
          : ""
      }`}
      title={isCommentModeActive ? "Cancelar modo de comentário" : "Adicionar comentário"}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Balão de comentário */}
        <path
          d="M3 2C2.44772 2 2 2.44772 2 3V10C2 10.5523 2.44772 11 3 11H5L7 13L9 11H13C13.5523 11 14 10.5523 14 10V3C14 2.44772 13.5523 2 13 2H3Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Três pontos indicando texto */}
        <circle cx="5" cy="6.5" r="0.8" fill="currentColor" />
        <circle cx="8" cy="6.5" r="0.8" fill="currentColor" />
        <circle cx="11" cy="6.5" r="0.8" fill="currentColor" />
      </svg>
    </button>
  );
};

