"use client";
import React from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import RelatoriosPage from "@/components/relatorios/RelatoriosPage";

export default function Relatorios() {
  return (
    <ProtectedRoute>
      <RelatoriosPage />
    </ProtectedRoute>
  );
}

