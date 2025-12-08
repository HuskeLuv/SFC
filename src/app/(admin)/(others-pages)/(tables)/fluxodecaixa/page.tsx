"use client";
import ComponentCard from "@/components/common/ComponentCard";
import DataTableTwo from "@/components/tables/DataTables/TableTwo/DataTableTwo";
import { useSidebar } from "@/context/SidebarContext";
import React from "react";

export default function FluxoDeCaixa() {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const isCollapsed = !(isExpanded || isHovered || isMobileOpen);
  const cardWidth = isCollapsed ? "max-w-[98vw] w-full" : "";
  
  return (
    <div className={`${cardWidth} transition-all duration-300 -m-[30px] h-[calc(100vh-60px)] flex flex-col overflow-hidden`}>
      <ComponentCard title="Fluxo de Caixa" className="flex-1 flex flex-col m-[30px] overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 p-[30px] pt-5 overflow-hidden">
          <DataTableTwo />
        </div>
      </ComponentCard>
    </div>
  );
}
