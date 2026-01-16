"use client";
import React, { useMemo, useState } from "react";
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
  onUpdateValorAtualizado?: (portfolioId: string, novoValor: number) => void;
  totalCarteira?: number;
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

interface ReservaEmergenciaTableRowProps {
  ativo: ReservaEmergenciaAtivo;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  formatDate: (date: Date) => string;
  onUpdateValorAtualizado?: (portfolioId: string, novoValor: number) => void;
}

const ReservaEmergenciaTableRow: React.FC<ReservaEmergenciaTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
  formatDate,
  onUpdateValorAtualizado,
}) => {
  const [isEditingValor, setIsEditingValor] = useState(false);
  const [valorValue, setValorValue] = useState(ativo.valorAtualizado.toString());

  const handleValorSubmit = () => {
    if (!onUpdateValorAtualizado) return;
    
    const novoValor = parseFloat(valorValue);
    if (!isNaN(novoValor) && novoValor > 0) {
      onUpdateValorAtualizado(ativo.id, novoValor);
      setIsEditingValor(false);
    } else {
      setValorValue(ativo.valorAtualizado.toString());
      setIsEditingValor(false);
    }
  };

  const handleValorKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleValorSubmit();
    } else if (e.key === 'Escape') {
      setValorValue(ativo.valorAtualizado.toString());
      setIsEditingValor(false);
    }
  };

  return (
    <TableRow 
      className="border-b border-gray-100 hover:bg-gray-50 dark:border-white/[0.05] dark:hover:bg-white/[0.02]"
    >
      <TableCell className="px-2 py-2 text-xs text-black">
        {ativo.nome}
      </TableCell>
      <TableCell className="px-2 py-2 text-xs text-black text-center">
        {ativo.cotizacaoResgate}
      </TableCell>
      <TableCell className="px-2 py-2 text-xs text-black text-center">
        {ativo.liquidacaoResgate}
      </TableCell>
      <TableCell className="px-2 py-2 text-xs text-black text-center">
        {formatDate(ativo.vencimento)}
      </TableCell>
      <TableCell className="px-2 py-2 text-xs text-black text-center">
        {ativo.benchmark}
      </TableCell>
      <TableCell className="px-2 py-2 text-xs text-black text-right font-mono">
        {formatCurrency(ativo.valorInicial)}
      </TableCell>
      <TableCell className="px-2 py-2 text-xs text-black text-right font-mono">
        {formatCurrency(ativo.aporte)}
      </TableCell>
      <TableCell className="px-2 py-2 text-xs text-black text-right font-mono">
        {formatCurrency(ativo.resgate)}
      </TableCell>
      <TableCell className="px-2 py-2 text-xs text-black text-right font-mono">
        {isEditingValor ? (
          <div className="flex items-center justify-end space-x-1">
            <input
              type="number"
              step="0.01"
              value={valorValue}
              onChange={(e) => setValorValue(e.target.value)}
              onKeyDown={handleValorKeyPress}
              onBlur={handleValorSubmit}
              className="w-24 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          </div>
        ) : (
          <div 
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded inline-block"
            onClick={() => onUpdateValorAtualizado && setIsEditingValor(true)}
            tabIndex={0}
            role="button"
            aria-label="Editar valor atual"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onUpdateValorAtualizado && setIsEditingValor(true);
              }
            }}
          >
            {formatCurrency(ativo.valorAtualizado)}
          </div>
        )}
      </TableCell>
      <TableCell className="px-2 py-2 text-xs text-black text-center">
        {formatPercentage(ativo.percentualCarteira)}
      </TableCell>
      <TableCell className="px-2 py-2 text-xs text-black text-center">
        {formatPercentage(ativo.riscoAtivo)}
      </TableCell>
      <TableCell className="px-2 py-2 text-xs text-center font-medium text-black">
        {formatPercentage(ativo.rentabilidade)}
      </TableCell>
    </TableRow>
  );
};

export default function ReservaEmergenciaTable({ 
  ativos, 
  saldoInicioMes, 
  rendimento, 
  rentabilidade,
  onUpdateValorAtualizado,
  totalCarteira = 0
}: ReservaEmergenciaTableProps) {

  // Calcular risco (carteira total) e percentual da carteira da aba
  const ativosComRisco = useMemo(() => {
    const totalTabValue = ativos.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const shouldCalculateRisco = totalCarteira > 0;

    return ativos.map(ativo => ({
      ...ativo,
      riscoAtivo: shouldCalculateRisco ? (ativo.valorAtualizado / totalCarteira) * 100 : 0,
      percentualCarteira: totalTabValue > 0 ? (ativo.valorAtualizado / totalTabValue) * 100 : 0,
    }));
  }, [ativos, totalCarteira]);

  const totais = useMemo(() => {
    const totalValorInicial = ativosComRisco.reduce((sum, ativo) => sum + ativo.valorInicial, 0);
    const totalAporte = ativosComRisco.reduce((sum, ativo) => sum + ativo.aporte, 0);
    const totalResgate = ativosComRisco.reduce((sum, ativo) => sum + ativo.resgate, 0);
    const totalValorAtualizado = ativosComRisco.reduce((sum, ativo) => sum + ativo.valorAtualizado, 0);
    const totalRisco = ativosComRisco.reduce((sum, ativo) => sum + ativo.riscoAtivo, 0);
    
    return {
      valorInicial: totalValorInicial,
      aporte: totalAporte,
      resgate: totalResgate,
      valorAtualizado: totalValorAtualizado,
      risco: totalRisco,
    };
  }, [ativosComRisco]);

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

  const sortedAtivos = ativosComRisco;
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
            <TableHeader 
              style={{ backgroundColor: '#9E8A58' }}
              className="border-t border-gray-100 border-y"
            >
              <TableRow style={{ backgroundColor: '#9E8A58' }}>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-bold text-black text-xs text-left cursor-pointer"
                  style={{ backgroundColor: '#9E8A58' }}
                >
                  Nome dos Ativos
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer"
                  style={{ backgroundColor: '#9E8A58' }}
                >
                  Cot. Resgate
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer"
                  style={{ backgroundColor: '#9E8A58' }}
                >
                  Liq. Resgate
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer"
                  style={{ backgroundColor: '#9E8A58' }}
                >
                  Vencimento
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer"
                  style={{ backgroundColor: '#9E8A58' }}
                >
                  Benchmark
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer"
                  style={{ backgroundColor: '#9E8A58' }}
                >
                  Valor Inicial
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer"
                  style={{ backgroundColor: '#9E8A58' }}
                >
                  Aporte
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer"
                  style={{ backgroundColor: '#9E8A58' }}
                >
                  Resgate
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer"
                  style={{ backgroundColor: '#9E8A58' }}
                >
                  Valor Atual
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer"
                  style={{ backgroundColor: '#9E8A58' }}
                >
                  % Carteira
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer"
                  style={{ backgroundColor: '#9E8A58' }}
                >
                  <span className="block">Risco Por Ativo</span>
                  <span className="block">(Carteira Total)</span>
                </TableCell>
                <TableCell 
                  isHeader 
                  className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer"
                  style={{ backgroundColor: '#9E8A58' }}
                >
                  Rentab.
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAtivos.map((ativo) => (
                <ReservaEmergenciaTableRow
                  key={ativo.id}
                  ativo={ativo}
                  formatCurrency={formatCurrency}
                  formatPercentage={formatPercentage}
                  formatDate={formatDate}
                  onUpdateValorAtualizado={onUpdateValorAtualizado}
                />
              ))}
              
              <TableRow className="border-t-2 border-gray-200 bg-[#808080]">
                <TableCell className="px-2 py-2 text-xs text-white font-bold">
                  TOTAL GERAL
                </TableCell>
                <TableCell className="px-2 py-2 text-white font-bold"></TableCell>
                <TableCell className="px-2 py-2 text-white font-bold"></TableCell>
                <TableCell className="px-2 py-2 text-white font-bold"></TableCell>
                <TableCell className="px-2 py-2 text-white font-bold"></TableCell>
                <TableCell className="px-2 py-2 text-xs text-white font-bold text-right font-mono">
                  {formatCurrency(totais.valorInicial)}
                </TableCell>
                <TableCell className="px-2 py-2 text-xs text-white font-bold text-right font-mono">
                  {formatCurrency(totais.aporte)}
                </TableCell>
                <TableCell className="px-2 py-2 text-xs text-white font-bold text-right font-mono">
                  {formatCurrency(totais.resgate)}
                </TableCell>
                <TableCell className="px-2 py-2 text-xs text-white font-bold text-right font-mono">
                  {formatCurrency(totais.valorAtualizado)}
                </TableCell>
                <TableCell className="px-2 py-2 text-xs text-white font-bold text-center">
                  100,00%
                </TableCell>
                <TableCell className="px-2 py-2 text-xs text-white font-bold text-center">
                  {formatPercentage(totais.risco)}
                </TableCell>
                <TableCell className="px-2 py-2 text-xs text-white font-bold text-center">
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
