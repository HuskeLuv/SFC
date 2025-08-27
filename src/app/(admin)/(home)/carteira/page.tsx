"use client";
import React from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import CarteiraTabs from "@/components/carteira/CarteiraTabs";

export default function Carteira() {
  return (
    <ProtectedRoute>
      <CarteiraTabs />
    </ProtectedRoute>
  );
} 