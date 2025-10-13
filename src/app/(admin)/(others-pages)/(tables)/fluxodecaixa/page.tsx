"use client";
import ComponentCard from "@/components/common/ComponentCard";
import DataTableTwo from "@/components/tables/DataTables/TableTwo/DataTableTwo";
import { useSidebar } from "@/context/SidebarContext";
import React from "react";

// Metadata não pode ser exportada em componentes "use client"
// A metadata deve ser definida no layout ou removida

export default function FluxoDeCaixa() {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const isCollapsed = !(isExpanded || isHovered || isMobileOpen);
  // Só aplica max-w-[98vw] w-full quando colapsada, senão mantém largura original
  const cardWidth = isCollapsed ? "max-w-[98vw] w-full" : "";
  
  return (
    <div className={cardWidth + " transition-all duration-300"}>
      <ComponentCard title="Fluxo de Caixa">
        <DataTableTwo />
      </ComponentCard>
    </div>
  );
}

