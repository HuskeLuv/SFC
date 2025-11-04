"use client";
import React from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import RelatoriosTabs from "@/components/relatorios/RelatoriosTabs";

export default function Relatorios() {
  return (
    <ProtectedRoute>
      <RelatoriosTabs />
    </ProtectedRoute>
  );
}

