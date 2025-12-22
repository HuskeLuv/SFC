"use client";
import React, { useState } from "react";
import { useImoveisBens } from "@/hooks/useImoveisBens";
import { ImovelBemAtivo } from "@/types/imoveis-bens";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ComponentCard from "@/components/common/ComponentCard";
import Badge from "@/components/ui/badge/Badge";
import { DollarLineIcon } from "@/icons";

interface ImoveisBensMetricCardProps {
  title: string;
  value: string;
  color?: "primary" | "success" | "warning" | "error";
}

const ImoveisBensMetricCard: React.FC<ImoveisBensMetricCardProps> = ({
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

interface ImoveisBensTableRowProps {
  ativo: ImovelBemAtivo;
  formatCurrency: (value: number, currency?: 'BRL' | 'USD') => string;
  formatPercentage: (value: number) => string;
  formatNumber: (value: number) => string;
  onUpdateValorAtualizado: (ativoId: string, novoValor: number) => void;
}

const ImoveisBensTableRow: React.FC<ImoveisBensTableRowProps> = ({
  ativo,
  formatCurrency,
  formatPercentage,
  formatNumber,
  onUpdateValorAtualizado,
}) => {
  const [isEditingValor, setIsEditingValor] = useState(false);
  const [valorValue, setValorValue] = useState(ativo.valorAtualizado.toString());

  const handleValorSubmit = () => {
    const novoValor = parseFloat(valorValue);
    if (!isNaN(novoValor) && novoValor > 0) {
      onUpdateValorAtualizado(ativo.id, novoValor);
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
    <tr className="border-b border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
      <td className="px-2 py-2 text-xs font-medium text-black">
        <div>
          <div className="font-semibold">{ativo.nome}</div>
          {ativo.observacoes && (
            <div className="text-xs text-black mt-1">
              {ativo.observacoes}
            </div>
          )}
        </div>
      </td>
      <td className="px-2 py-2 text-xs text-center font-medium text-black">
        {ativo.cidade}
      </td>
      <td className="px-2 py-2 text-xs text-center font-medium text-black">
        {ativo.mandato}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-black">
        {formatNumber(ativo.quantidade)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-black">
        {formatCurrency(ativo.precoAquisicao)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-medium text-black">
        {formatCurrency(ativo.melhorias)}
      </td>
      <td className="px-2 py-2 text-xs text-right font-semibold text-black">
        {formatCurrency(ativo.valorTotal)}
      </td>
      <td className="px-2 py-2 text-xs text-right">
        {isEditingValor ? (
          <div className="flex items-center space-x-1">
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
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
            onClick={() => setIsEditingValor(true)}
          >
            <span className="font-semibold text-black">
              {formatCurrency(ativo.valorAtualizado)}
            </span>
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.riscoPorAtivo)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.percentualCarteira)}
      </td>
      <td className="px-2 py-2 text-xs text-right text-black">
        {formatPercentage(ativo.rentabilidade)}
      </td>
    </tr>
  );
};

export default function ImoveisBensTable() {
  const { data, loading, error, formatCurrency, formatPercentage, formatNumber, updateValorAtualizado } = useImoveisBens();

  const handleUpdateValorAtualizado = async (ativoId: string, novoValor: number) => {
    await updateValorAtualizado(ativoId, novoValor);
  };

  if (loading) {
    return <LoadingSpinner text="Carregando dados de imóveis e bens..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
            Erro ao carregar dados
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <ImoveisBensMetricCard
            title="Valor Total Aquisições"
            value={formatCurrency(0)}
          />
          <ImoveisBensMetricCard
            title="Valor Total Melhorias"
            value={formatCurrency(0)}
            color="warning"
          />
          <ImoveisBensMetricCard
            title="Valor Atualizado"
            value={formatCurrency(0)}
          />
          <ImoveisBensMetricCard
            title="Rendimento"
            value={formatCurrency(0)}
            color="success"
          />
          <ImoveisBensMetricCard
            title="Rentabilidade"
            value={formatPercentage(0)}
            color="success"
          />
        </div>

        <ComponentCard title="Imóveis & Bens - Detalhamento">
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
              <DollarLineIcon className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-black mb-2">
                Nenhum ativo encontrado
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                Adicione imóveis, veículos, joias e outros bens para começar a acompanhar sua carteira de ativos físicos.
              </p>
            </div>
          </div>
        </ComponentCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <ImoveisBensMetricCard
          title="Valor Total Aquisições"
          value={formatCurrency(data?.resumo?.valorTotalAquisicoes)}
        />
        <ImoveisBensMetricCard
          title="Valor Total Melhorias"
          value={formatCurrency(data?.resumo?.valorTotalMelhorias)}
          color="warning"
        />
        <ImoveisBensMetricCard
          title="Valor Atualizado"
          value={formatCurrency(data?.resumo?.valorAtualizado)}
        />
        <ImoveisBensMetricCard
          title="Rendimento"
          value={formatCurrency(data?.resumo?.rendimento)}
          color="success"
        />
        <ImoveisBensMetricCard
          title="Rentabilidade"
          value={formatPercentage(data?.resumo?.rentabilidade)}
          color="success"
        />
      </div>

      {/* Tabela principal */}
      <ComponentCard title="Imóveis & Bens - Detalhamento">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700" style={{ backgroundColor: '#9E8A58' }}>
                <th className="px-2 py-2 font-bold text-black text-xs text-left cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Nome do Ativo
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Cidade
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-center cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Mandato
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Quantidade
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Preço Aquisição
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Melhorias
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Valor Total
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Valor Atualizado
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Risco por Ativo
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  % da Carteira Total
                </th>
                <th className="px-2 py-2 font-bold text-black text-xs text-right cursor-pointer" style={{ backgroundColor: '#9E8A58' }}>
                  Rentabilidade
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.ativos?.map((ativo) => (
                <ImoveisBensTableRow
                  key={ativo.id}
                  ativo={ativo}
                  formatCurrency={formatCurrency}
                  formatPercentage={formatPercentage}
                  formatNumber={formatNumber}
                  onUpdateValorAtualizado={handleUpdateValorAtualizado}
                />
              )) || []}

              {/* Linha de totalização */}
              <tr className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                <td className="px-2 py-2 text-xs font-bold text-black">
                  TOTAL GERAL
                </td>
                <td className="px-2 py-2 text-xs text-center text-black">-</td>
                <td className="px-2 py-2 text-xs text-center text-black">-</td>
                <td className="px-2 py-2 text-xs text-right font-bold text-black">
                  {formatNumber(data?.totalGeral?.quantidade)}
                </td>
                <td className="px-2 py-2 text-xs text-center text-black">-</td>
                <td className="px-2 py-2 text-xs text-center text-black">-</td>
                <td className="px-2 py-2 text-xs text-right font-bold text-black">
                  {formatCurrency(data?.totalGeral?.valorAplicado)}
                </td>
                <td className="px-2 py-2 text-xs text-right font-bold text-black">
                  {formatCurrency(data?.totalGeral?.valorAtualizado)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-black font-bold">
                  {formatPercentage(data?.totalGeral?.risco)}
                </td>
                <td className="px-2 py-2 text-xs text-right text-black font-bold">
                  100.00%
                </td>
                <td className="px-2 py-2 text-xs text-right text-black font-bold">
                  {formatPercentage(data?.totalGeral?.rentabilidade)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </ComponentCard>
    </div>
  );
}

