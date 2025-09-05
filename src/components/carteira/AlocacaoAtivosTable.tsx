"use client";
import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../ui/table";
import { useAlocacaoConfig } from "@/hooks/useAlocacaoConfig";
import EditableCell from "./EditableCell";
import Alert from "../ui/alert/Alert";
import ComponentCard from "../common/ComponentCard";

interface AlocacaoAtivo {
  classeAtivo: string;
  total: number;
  percentualAtual: number;
  alocacaoMinimo: number;
  alocacaoMaximo: number;
  percentualTarget: number;
  quantoFalta: number;
  necessidadeAporte: number;
}

interface AlocacaoAtivosTableProps {
  distribuicao: {
    reservaOportunidade: { valor: number; percentual: number; };
    rendaFixaFundos: { valor: number; percentual: number; };
    fimFia: { valor: number; percentual: number; };
    fiis: { valor: number; percentual: number; };
    acoes: { valor: number; percentual: number; };
    stocks: { valor: number; percentual: number; };
    reits: { valor: number; percentual: number; };
    etfs: { valor: number; percentual: number; };
    moedasCriptos: { valor: number; percentual: number; };
    previdenciaSeguros: { valor: number; percentual: number; };
    opcoes: { valor: number; percentual: number; };
  };
}

export default function AlocacaoAtivosTable({ distribuicao }: AlocacaoAtivosTableProps) {
  const totalCarteira = Object.values(distribuicao).reduce((sum, item) => sum + item.valor, 0);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  
  const {
    configuracoes,
    loading: configLoading,
    error: configError,
    updateConfiguracao,
    saveChanges,
    startEditing,
    stopEditing,
    isEditing,
    totalTargets,
  } = useAlocacaoConfig();

  // Mapeamento das configurações para o formato usado na tabela
  const targetConfigMap = configuracoes.reduce((acc, config) => {
    acc[config.categoria] = {
      min: config.minimo,
      max: config.maximo,
      target: config.target,
    };
    return acc;
  }, {} as { [key: string]: { min: number; max: number; target: number } });

  // Mapeamento de nomes amigáveis
  const getNomeAmigavel = (categoria: string): string => {
    const nomes: { [key: string]: string } = {
      "reservaOportunidade": "Reserva Oportunidade",
      "rendaFixaFundos": "Renda Fixa & Fundos Renda Fixa",
      "fimFia": "Fundos (FIM / FIA)",
      "fiis": "FII's",
      "acoes": "Ações",
      "stocks": "STOCKS",
      "reits": "REIT's",
      "etfs": "ETF's",
      "moedasCriptos": "Moedas, Criptomoedas & Outros",
      "previdenciaSeguros": "Previdência & Seguros",
      "opcoes": "Opções",
    };
    return nomes[categoria] || categoria;
  };

  const getChaveCategoria = (nome: string): string => {
    const chaves: { [key: string]: string } = {
      "Reserva Oportunidade": "reservaOportunidade",
      "Renda Fixa & Fundos Renda Fixa": "rendaFixaFundos",
      "Fundos (FIM / FIA)": "fimFia",
      "FII's": "fiis",
      "Ações": "acoes",
      "STOCKS": "stocks",
      "REIT's": "reits",
      "ETF's": "etfs",
      "Moedas, Criptomoedas & Outros": "moedasCriptos",
      "Previdência & Seguros": "previdenciaSeguros",
      "Opções": "opcoes",
    };
    return chaves[nome] || nome;
  };

  const calcularDados = (): AlocacaoAtivo[] => {
    const dados: AlocacaoAtivo[] = [];

    Object.entries(distribuicao).forEach(([key, value]) => {
      const config = targetConfigMap[key];
      if (!config) return; // Skip if no config found
      
      const percentualAtual = totalCarteira > 0 ? (value.valor / totalCarteira) * 100 : 0;
      const diferenca = config.target - percentualAtual;
      const valorNecessario = (diferenca / 100) * totalCarteira;

      dados.push({
        classeAtivo: getNomeAmigavel(key),
        total: value.valor,
        percentualAtual: percentualAtual,
        alocacaoMinimo: config.min,
        alocacaoMaximo: config.max,
        percentualTarget: config.target,
        quantoFalta: diferenca,
        necessidadeAporte: valorNecessario,
      });
    });

    return dados;
  };

  const dados = calcularDados();

  const formatarMoeda = (valor: number): string => {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatarPercentual = (valor: number): string => {
    return `${valor.toFixed(2)}%`;
  };

  const getCorCelula = (atual: number, target: number): string => {
    const diferenca = Math.abs(atual - target);
    if (diferenca <= 1) return "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400";
    if (diferenca <= 3) return "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400";
    return "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400";
  };

  const handleSaveConfigurations = async () => {
    const success = await saveChanges();
    if (success) {
      setShowSuccessAlert(true);
      setTimeout(() => setShowSuccessAlert(false), 3000);
    }
  };

  const handleConfigChange = (categoria: string, field: 'minimo' | 'maximo' | 'target', valor: number) => {
    updateConfiguracao(categoria, field, valor);
  };

  if (configLoading) {
    return (
      <ComponentCard title="Alocação de Ativos">
        <div className="flex justify-center items-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
        </div>
      </ComponentCard>
    );
  }

  return (
    <ComponentCard 
      title="Alocação de Ativos"
      desc={`Distribuição atual vs. targets recomendados ${totalTargets > 0 ? `(Total: ${totalTargets.toFixed(1)}%)` : ''}`}
    >
      {/* Alerts */}
      {showSuccessAlert && (
        <div className="mb-4">
          <Alert variant="success" title="Sucesso" message="Configurações salvas com sucesso!" />
        </div>
      )}
      {configError && (
        <div className="mb-4">
          <Alert variant="error" title="Erro" message={configError} />
        </div>
      )}
      
      <div className="flex justify-end mb-4">
        <button
          onClick={handleSaveConfigurations}
          className="px-3 py-2 bg-brand-500 text-white text-xs rounded-lg hover:bg-brand-600 transition-colors"
        >
          Salvar Configurações
        </button>
      </div>

      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-t border-gray-100 border-y bg-gray-50 dark:border-white/[0.05] dark:bg-gray-900">
            <TableRow>
              <TableCell 
                isHeader 
                className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-left"
              >
                Classe de Ativos
              </TableCell>
              <TableCell 
                isHeader 
                className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-right"
              >
                TOTAL
              </TableCell>
              <TableCell 
                isHeader 
                className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-center"
              >
                % Atual
              </TableCell>
              <TableCell 
                isHeader 
                className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-center"
                colSpan={2}
              >
                Alocação
              </TableCell>
              <TableCell 
                isHeader 
                className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-center"
              >
                % TARGET
              </TableCell>
              <TableCell 
                isHeader 
                className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-center"
              >
                Quanto Falta
              </TableCell>
              <TableCell 
                isHeader 
                className="px-2 py-2 font-medium text-gray-500 text-xs dark:text-gray-400 text-right"
              >
                Necessidade de aporte em
              </TableCell>
            </TableRow>
            <TableRow className="bg-gray-50 dark:bg-gray-900">
              <TableCell className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400"></TableCell>
              <TableCell className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400"></TableCell>
              <TableCell className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400"></TableCell>
              <TableCell className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                Mínimo
              </TableCell>
              <TableCell className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                Máximo
              </TableCell>
              <TableCell className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400"></TableCell>
              <TableCell className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400"></TableCell>
              <TableCell className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400"></TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dados.map((ativo) => (
              <TableRow 
                key={ativo.classeAtivo}
                className="border-b border-gray-100 hover:bg-gray-50 dark:border-white/[0.05] dark:hover:bg-white/[0.02]"
              >
                <TableCell className="px-2 py-2 text-xs font-medium text-gray-900 dark:text-white">
                  {ativo.classeAtivo}
                </TableCell>
                <TableCell className="px-2 py-2 text-xs text-gray-900 dark:text-white text-right font-mono">
                  {formatarMoeda(ativo.total)}
                </TableCell>
                <TableCell className={`px-2 py-2 text-xs text-center font-medium ${getCorCelula(ativo.percentualAtual, ativo.percentualTarget)}`}>
                  {formatarPercentual(ativo.percentualAtual)}
                </TableCell>
                <TableCell className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 text-center">
                  <EditableCell
                    value={ativo.alocacaoMinimo}
                    isEditing={isEditing(getChaveCategoria(ativo.classeAtivo), 'minimo')}
                    onStartEdit={() => startEditing(getChaveCategoria(ativo.classeAtivo), 'minimo')}
                    onStopEdit={stopEditing}
                    onValueChange={(valor) => handleConfigChange(getChaveCategoria(ativo.classeAtivo), 'minimo', valor)}
                    min={0}
                    max={100}
                  />
                </TableCell>
                <TableCell className="px-2 py-2 text-xs text-gray-700 dark:text-gray-300 text-center">
                  <EditableCell
                    value={ativo.alocacaoMaximo}
                    isEditing={isEditing(getChaveCategoria(ativo.classeAtivo), 'maximo')}
                    onStartEdit={() => startEditing(getChaveCategoria(ativo.classeAtivo), 'maximo')}
                    onStopEdit={stopEditing}
                    onValueChange={(valor) => handleConfigChange(getChaveCategoria(ativo.classeAtivo), 'maximo', valor)}
                    min={0}
                    max={100}
                  />
                </TableCell>
                <TableCell className="px-2 py-2 text-xs font-medium text-center bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                  <EditableCell
                    value={ativo.percentualTarget}
                    isEditing={isEditing(getChaveCategoria(ativo.classeAtivo), 'target')}
                    onStartEdit={() => startEditing(getChaveCategoria(ativo.classeAtivo), 'target')}
                    onStopEdit={stopEditing}
                    onValueChange={(valor) => handleConfigChange(getChaveCategoria(ativo.classeAtivo), 'target', valor)}
                    min={0}
                    max={100}
                    className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                  />
                </TableCell>
                <TableCell className={`px-2 py-2 text-xs text-center font-medium ${ativo.quantoFalta > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {ativo.quantoFalta > 0 ? 
                    `Falta ${formatarPercentual(ativo.quantoFalta)}` : 
                    ativo.quantoFalta < 0 ? 
                      `Excesso ${formatarPercentual(Math.abs(ativo.quantoFalta))}` : 
                      'No target'
                  }
                </TableCell>
                <TableCell className="px-2 py-2 text-xs text-right font-mono">
                  <span className={ativo.necessidadeAporte > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                    {ativo.necessidadeAporte > 0 ? formatarMoeda(ativo.necessidadeAporte) : '-'}
                  </span>
                </TableCell>
              </TableRow>
            ))}
            
            {/* Linha de Total */}
            <TableRow className="border-t-2 border-gray-200 bg-gray-50 dark:border-white/[0.1] dark:bg-gray-900/50">
              <TableCell className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white">
                TOTAL GERAL
              </TableCell>
              <TableCell className="px-2 py-2 text-xs font-bold text-gray-900 dark:text-white text-right font-mono">
                {formatarMoeda(totalCarteira)}
              </TableCell>
              <TableCell className="px-2 py-2 text-xs font-bold text-center text-gray-900 dark:text-white">
                100,00%
              </TableCell>
              <TableCell className="px-2 py-2"></TableCell>
              <TableCell className="px-2 py-2"></TableCell>
              <TableCell className="px-2 py-2 text-xs font-bold text-center text-gray-900 dark:text-white">
                100,00%
              </TableCell>
              <TableCell className="px-2 py-2"></TableCell>
              <TableCell className="px-2 py-2 text-xs font-bold text-right font-mono text-gray-900 dark:text-white">
                {formatarMoeda(dados.reduce((sum, item) => sum + (item.necessidadeAporte > 0 ? item.necessidadeAporte : 0), 0))}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </ComponentCard>
  );
} 