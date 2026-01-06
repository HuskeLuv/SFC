"use client";
import React from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AnalisesTabs from "@/components/analises/AnalisesTabs";

export default function Analises() {
  return (
    <ProtectedRoute>
      <AnalisesTabs />
    </ProtectedRoute>
  );
}


