"use client";
import React, { useMemo } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../ui/table";
import ComponentCard from "../common/ComponentCard";
import { DollarLineIcon } from "@/icons";

interface ReservaEmergenciaAtivo {
  id: string;
  nome: string;
  cotizacaoResgate: string;
  liquidacaoResgate: string;
  vencimento: Date;
  benchmark: string;
  valorInicial: number;
  aporte: number;
  resgate: number;
  valorAtualizado: number;
  percentualCarteira: number;
  riscoAtivo: number;
  rentabilidade: number;
}

interface ReservaEmergenciaTableProps {
  ativos: ReservaEmergenciaAtivo[];
  saldoInicioMes: number;
  rendimento: number;
  rentabilidade: number;
}

interface ReservaEmergenciaMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const ReservaEmergenciaMetricCard: React.FC<ReservaEmergenciaMetricCardProps> = ({
  title,
  value,
  color = "primary",
}) => {
  const colorClasses = {
    primary: "bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-100",
    success: "bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-100",
    warning: "bg-yellow-50 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100",
    error: "bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100",
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <p className="text-xs font-medium opacity-80 mb-1">{title}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
};

export default function ReservaEmergenciaTable({ 
  ativos, 
  saldoInicioMes, 
  rendimento, 
  rentabilidade 
}: ReservaEmergenciaTableProps) {

  const totais = useMemo(() => {
    const totalValorInicial = ativos.reduce((sum, ativo) => sum + ativo.valorInicial, 0);
    const totalAporte = ativos.reduce((sum, ativo) => sum + ativo.aporte, 0);
    const totalResgate = ativos.reduce((sum, ativo) => sum + ativo.resgate, 0);
    const totalValorAtualizado = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const totalRisco = ativos.reduce((sum, ativo) => sum + ativo.riscoAtivo, 0);
    
    return {
      valorInicial: totalValorInicial,
      aporte: totalAporte,
      resgate: totalResgate,
      valorAtualizado: totalValorAtualizado,
      risco: totalRisco,
    };
  }, [ativos]);

  const formatCurrency = (value: number): string => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatPercentage = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('pt-BR');
  };

  const sortedAtivos = ativos;
  // Verificar se há dados para exibir
  if (ativos.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <ReservaEmergenciaMetricCard
            title="Saldo Início do Mês"
            value={formatCurrency(saldoInicioMes)}
          />
          <ReservaEmergenciaMetricCard
            title="Rendimento"
            value={formatCurrency(rendimento)}
            color="success"
          />
          <ReservaEmergenciaMetricCard
            title="Rentabilidade"
            value={formatPercentage(rentabilidade)}
            color="success"
          />
        </div>

        <ComponentCard title="Reserva de Emergência - Detalhamento">
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
              <DollarLineIcon className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Nenhum investimento encontrado
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                Adicione investimentos de reserva de emergência para começar a acompanhar seus ativos de liquidez.
              </p>
            </div>
          </div>
        </ComponentCard>
      </div>
    );
  }



  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <ReservaEmergenciaMetricCard
          title="Saldo Início do Mês"
          value={formatCurrency(saldoInicioMes)}
        />
        <ReservaEmergenciaMetricCard
          title="Rendimento"
          value={formatCurrency(rendimento)}
          color="success"
        />
        <ReservaEmergenciaMetricCard
          title="Rentabilidade"
          value={formatPercentage(rentabilidade)}
          color="success"
        />
      </div>

      <ComponentCard title="Reserva de Emergência - Detalhamento">
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-t border-gray-100 border-y bg-gray-50 dark:border-white/[0.05] dark:bg-gray-900">
              <TableRow>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Nome dos Ativos
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cot. Resgate
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Liq. Resgate
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Vencimento
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Benchmark
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Valor Inicial
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Aporte
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Resgate
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Valor Atual
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  % Carteira
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Risco
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Rentab.
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAtivos.map((ativo) => (
                <TableRow 
                  key={ativo.id}
                  className="border-b border-gray-100 hover:bg-gray-50 dark:border-white/[0.05] dark:hover:bg-white/[0.02]"
                >
                  <TableCell className="px-2 py-2 text-xs font-medium text-gray-900 dark:text-white">
                    {ativo.nome}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 text-center">
                    {ativo.cotizacaoResgate}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 text-center">
                    {ativo.liquidacaoResgate}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 text-center">
                    {formatDate(ativo.vencimento)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 text-center">
                    {ativo.benchmark}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-xs text-gray-900 dark:text-white text-right font-mono">
                    {formatCurrency(ativo.valorInicial)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-xs text-gray-900 dark:text-white text-right font-mono">
                    {formatCurrency(ativo.aporte)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-xs text-gray-900 dark:text-white text-right font-mono">
                    {formatCurrency(ativo.resgate)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-xs font-semibold text-gray-900 dark:text-white text-right font-mono">
                    {formatCurrency(ativo.valorAtualizado)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 text-center">
                    {formatPercentage(ativo.percentualCarteira)}
                  </TableCell>
                  <TableCell className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 text-center">
                    {formatPercentage(ativo.riscoAtivo)}
                  </TableCell>
                  <TableCell className={`px-2 py-2 text-xs text-center font-medium ${
                    ativo.rentabilidade >= 0 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {formatPercentage(ativo.rentabilidade)}
                  </TableCell>
                </TableRow>
              ))}
              
              <TableRow className="border-t-2 border-gray-200 bg-gray-50 dark:border-white/[0.1] dark:bg-gray-900/50">
                <TableCell className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white">
                  TOTAL GERAL
                </TableCell>
                <TableCell className="px-2 py-2"></TableCell>
                <TableCell className="px-2 py-2"></TableCell>
                <TableCell className="px-2 py-2"></TableCell>
                <TableCell className="px-2 py-2"></TableCell>
                <TableCell className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white text-right font-mono">
                  {formatCurrency(totais.valorInicial)}
                </TableCell>
                <TableCell className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white text-right font-mono">
                  {formatCurrency(totais.aporte)}
                </TableCell>
                <TableCell className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white text-right font-mono">
                  {formatCurrency(totais.resgate)}
                </TableCell>
                <TableCell className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white text-right font-mono">
                  {formatCurrency(totais.valorAtualizado)}
                </TableCell>
                <TableCell className="px-2 py-2 text-xs font-bold text-center text-gray-900 dark:text-white">
                  100,00%
                </TableCell>
                <TableCell className="px-2 py-2 text-xs font-bold text-center text-gray-900 dark:text-white">
                  {formatPercentage(totais.risco)}
                </TableCell>
                <TableCell className="px-2 py-2 text-xs font-bold text-center text-gray-900 dark:text-white">
                  {formatPercentage(rentabilidade)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </ComponentCard>
    </div>
  );
}
