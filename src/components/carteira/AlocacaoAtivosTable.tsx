"use client";
import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../ui/table";
import type { UseAlocacaoConfigReturn } from "@/hooks/useAlocacaoConfig";
import EditableCell from "./EditableCell";
import EditableTextCell from "./EditableTextCell";
import Alert from "../ui/alert/Alert";
import ComponentCard from "../common/ComponentCard";

interface AlocacaoAtivo {
  categoria: string;
  classeAtivo: string;
  total: number;
  percentualAtual: number;
  alocacaoMinimo: number;
  alocacaoMaximo: number;
  percentualTarget: number;
  quantoFalta: number;
  necessidadeAporte: number;
  descricao: string;
}

interface AlocacaoAtivosTableProps {
  distribuicao: {
    reservaEmergencia: { valor: number; percentual: number; };
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
    imoveisBens: { valor: number; percentual: number; };
  };
  alocacaoConfig: UseAlocacaoConfigReturn;
  caixaParaInvestir?: number;
}

export default function AlocacaoAtivosTable({ distribuicao, alocacaoConfig, caixaParaInvestir = 0 }: AlocacaoAtivosTableProps) {
  // Total Dinheiro: exclui Imóveis e Bens
  const totalDinheiro = Object.entries(distribuicao)
    .filter(([key]) => key !== 'imoveisBens')
    .reduce((sum, [, item]) => sum + item.valor, 0) + caixaParaInvestir;
  
  // Total Dinheiro + Bens: inclui tudo (dinheiro + imóveis e bens)
  const valorImoveisBens = distribuicao.imoveisBens?.valor || 0;
  const totalDinheiroMaisBens = totalDinheiro + valorImoveisBens;
  
  // Total Carteira para cálculos de percentuais (exclui Imóveis e Bens)
  const totalCarteira = totalDinheiro;
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
  } = alocacaoConfig;

  // Mapeamento das configurações para o formato usado na tabela
  const targetConfigMap = configuracoes.reduce((acc, config) => {
    acc[config.categoria] = {
      min: config.minimo,
      max: config.maximo,
      target: config.target,
      descricao: config.descricao || "",
    };
    return acc;
  }, {} as { [key: string]: { min: number; max: number; target: number; descricao: string } });

  // Mapeamento de nomes amigáveis
  const getNomeAmigavel = (categoria: string): string => {
    const nomes: { [key: string]: string } = {
      "reservaEmergencia": "Reserva de Emergência",
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
      "imoveisBens": "Imóveis e Bens",
    };
    return nomes[categoria] || categoria;
  };

  const calcularDados = (): AlocacaoAtivo[] => {
    const dados: AlocacaoAtivo[] = [];
    let totalNecessidadeAporte = 0;

    // Primeiro, calcular todas as necessidades de aporte sem subtrair o caixa
    Object.entries(distribuicao).forEach(([key, value]) => {
      const config = targetConfigMap[key] || { min: 0, max: 0, target: 0, descricao: "" };
      
      // Para Imóveis e Bens, usar totalDinheiroMaisBens para percentual
      // Para outros, usar totalCarteira (totalDinheiro)
      const baseTotal = key === 'imoveisBens' ? totalDinheiroMaisBens : totalCarteira;
      const percentualAtual = baseTotal > 0 ? (value.valor / baseTotal) * 100 : 0;
      
      // Para Imóveis e Bens, não calcular diferença e necessidade de aporte
      // (não faz sentido ter target para imóveis na alocação de dinheiro)
      if (key === 'imoveisBens') {
        dados.push({
          categoria: key,
          classeAtivo: getNomeAmigavel(key),
          total: value.valor,
          percentualAtual: percentualAtual,
          alocacaoMinimo: 0,
          alocacaoMaximo: 0,
          percentualTarget: 0,
          quantoFalta: 0,
          necessidadeAporte: 0,
          descricao: "",
        });
      } else {
        const diferenca = config.target - percentualAtual;
        const valorNecessario = diferenca > 0 ? (diferenca / 100) * totalCarteira : 0;
        totalNecessidadeAporte += valorNecessario;

        dados.push({
          categoria: key,
          classeAtivo: getNomeAmigavel(key),
          total: value.valor,
          percentualAtual: percentualAtual,
          alocacaoMinimo: config.min,
          alocacaoMaximo: config.max,
          percentualTarget: config.target,
          quantoFalta: diferenca,
          necessidadeAporte: valorNecessario,
          descricao: config.descricao || "",
        });
      }
    });

    // Agora, se houver caixa para investir e necessidade de aporte, distribuir proporcionalmente
    if (caixaParaInvestir > 0 && totalNecessidadeAporte > 0) {
      const caixaDisponivel = Math.min(caixaParaInvestir, totalNecessidadeAporte);
      const fatorReducao = 1 - (caixaDisponivel / totalNecessidadeAporte);

      // Atualizar necessidade de aporte de cada categoria proporcionalmente
      dados.forEach((item) => {
        if (item.categoria !== 'imoveisBens' && item.necessidadeAporte > 0) {
          item.necessidadeAporte = Math.max(0, item.necessidadeAporte * fatorReducao);
        }
      });
    }

    return dados;
  };

  const dados = calcularDados();
  const totalPercentualTarget = dados
    .filter((ativo) => ativo.categoria !== "imoveisBens" && ativo.categoria !== "reservaEmergencia")
    .reduce((sum, ativo) => sum + ativo.percentualTarget, 0);

  const formatarMoeda = (valor: number): string => {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatarPercentual = (valor: number): string => {
    return `${valor.toFixed(2)}%`;
  };

  const formatarValorReserva = (valorPercentual: number): string => {
    const valorMonetario = totalCarteira > 0 ? (valorPercentual / 100) * totalCarteira : 0;
    return formatarMoeda(valorMonetario);
  };

  const parseValorReserva = (rawValue: string): number => {
    const cleanedValue = rawValue
      .trim()
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^0-9.-]/g, "");
    const parsedValue = Number.parseFloat(cleanedValue);
    if (!Number.isFinite(parsedValue)) {
      return Number.NaN;
    }
    return totalCarteira > 0 ? (parsedValue / totalCarteira) * 100 : 0;
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

  const handleDescricaoChange = (categoria: string, valor: string) => {
    updateConfiguracao(categoria, "descricao", valor);
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

      <div className="max-w-full overflow-x-auto">
        <Table className="relative text-xs [&_td]:h-6 [&_td]:leading-6 [&_td]:py-0 [&_th]:h-6 [&_th]:leading-6 [&_th]:py-0" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <TableHeader 
            style={{ 
              position: 'sticky',
              top: 0,
              zIndex: 400,
              backgroundColor: '#9E8A58',
              isolation: 'isolate',
            }}
          >
            <TableRow 
              className="h-6" 
              style={{ 
                fontFamily: 'Calibri, sans-serif', 
                fontSize: '12px',
                backgroundColor: '#9E8A58'
              }}
            >
              <TableCell 
                isHeader
                rowSpan={2}
                className="px-2 border border-black text-left h-6 text-xs leading-6 whitespace-nowrap"
                style={{ backgroundColor: '#9E8A58' }}
              >
                <p className="font-bold text-black text-xs whitespace-nowrap">
                  Classe de ativos
                </p>
              </TableCell>
              <TableCell 
                isHeader
                rowSpan={2}
                className="px-2 border border-black text-center h-6 text-xs leading-6 whitespace-nowrap"
                style={{ backgroundColor: '#9E8A58' }}
              >
                <p className="font-bold text-black text-xs whitespace-nowrap">
                  TOTAL
                </p>
              </TableCell>
              <TableCell 
                isHeader
                rowSpan={2}
                className="px-2 border border-black text-center h-6 text-xs leading-6 whitespace-nowrap"
                style={{ backgroundColor: '#9E8A58' }}
              >
                <p className="font-bold text-black text-xs whitespace-nowrap">
                  % Atual
                </p>
              </TableCell>
              <TableCell 
                isHeader
                colSpan={2}
                className="px-2 border-t border-l border-r border-b border-black text-center h-6 text-xs leading-6 whitespace-nowrap"
                style={{ backgroundColor: '#9E8A58' }}
              >
                <p className="font-bold text-black text-xs whitespace-nowrap">
                  Alocação
                </p>
              </TableCell>
              <TableCell 
                isHeader
                rowSpan={2}
                className="px-2 border border-black text-center h-6 text-xs leading-6 whitespace-nowrap"
                style={{ backgroundColor: '#9E8A58' }}
              >
                <p className="font-bold text-black text-xs whitespace-nowrap">
                  % TARGET
                </p>
              </TableCell>
              <TableCell 
                isHeader
                rowSpan={2}
                className="px-2 border border-black text-center h-6 text-xs leading-6 whitespace-nowrap"
                style={{ backgroundColor: '#9E8A58' }}
              >
                <p className="font-bold text-black text-xs whitespace-nowrap">
                  Quanto Falta
                </p>
              </TableCell>
              <TableCell 
                isHeader
                rowSpan={2}
                className="px-2 border border-black text-center h-6 text-xs leading-6 whitespace-nowrap w-36"
                style={{ backgroundColor: '#9E8A58' }}
              >
                <p className="font-bold text-black text-xs whitespace-nowrap">
                  <span className="block">Necessidade de</span>
                  <span className="block">aporte em</span>
                </p>
              </TableCell>
              <TableCell 
                isHeader
                rowSpan={2}
                className="px-2 border border-black text-center h-6 text-xs leading-6 whitespace-nowrap"
                style={{ backgroundColor: '#9E8A58' }}
              >
                <p className="font-bold text-black text-xs whitespace-nowrap">
                  Descrição
                </p>
              </TableCell>
            </TableRow>
            <TableRow 
              className="h-6" 
              style={{ 
                fontFamily: 'Calibri, sans-serif', 
                fontSize: '12px',
                backgroundColor: '#9E8A58'
              }}
            >
              <TableCell 
                isHeader 
                className="px-2 border border-black text-center h-6 text-xs leading-6 whitespace-nowrap"
                style={{ backgroundColor: '#9E8A58' }}
              >
                <p className="font-bold text-black text-xs whitespace-nowrap">
                  Mínimo
                </p>
              </TableCell>
              <TableCell 
                isHeader 
                className="px-2 border border-black text-center h-6 text-xs leading-6 whitespace-nowrap"
                style={{ backgroundColor: '#9E8A58' }}
              >
                <p className="font-bold text-black text-xs whitespace-nowrap">
                  Máximo
                </p>
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dados.map((ativo) => {
              const isReservaEmergencia = ativo.categoria === "reservaEmergencia";
              const isImoveisBens = ativo.categoria === "imoveisBens";
              const minMaxDisplayValue = (valor: number) =>
                isReservaEmergencia ? formatarValorReserva(valor) : formatarPercentual(valor);
              return (
              <TableRow 
                key={ativo.classeAtivo}
                className="h-6 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors bg-white dark:bg-gray-900"
                style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px' }}
              >
                <TableCell className="px-2 font-medium text-gray-800 dark:text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-b border-l border-gray-200 border-r-0">
                  {ativo.classeAtivo}
                </TableCell>
                <TableCell className="px-2 font-normal text-gray-800 dark:text-gray-400 text-xs text-center h-6 leading-6 whitespace-nowrap border-b border-gray-200 border-l-0 border-r-0 font-mono">
                  {formatarMoeda(ativo.total)}
                </TableCell>
                <TableCell className="px-2 text-xs text-center font-bold text-gray-800 dark:text-gray-400 h-6 leading-6 whitespace-nowrap border-b border-gray-200 border-l-0 border-r-0">
                  {formatarPercentual(ativo.percentualAtual)}
                </TableCell>
                <TableCell className="px-2 font-normal text-gray-800 dark:text-gray-400 text-xs text-center h-6 leading-6 whitespace-nowrap border-b border-gray-200 border-l-0 border-r-0">
                  {isImoveisBens ? (
                    <span className="text-gray-500 dark:text-gray-500">-</span>
                  ) : (
                    <EditableCell
                      value={ativo.alocacaoMinimo}
                      isEditing={isEditing(ativo.categoria, 'minimo')}
                      onStartEdit={() => startEditing(ativo.categoria, 'minimo')}
                      onStopEdit={stopEditing}
                      onValueChange={(valor) => handleConfigChange(ativo.categoria, 'minimo', valor)}
                      min={0}
                      max={100}
                      suffix={isReservaEmergencia ? "" : "%"}
                      formatValue={minMaxDisplayValue}
                      parseValue={isReservaEmergencia ? parseValorReserva : undefined}
                      inputMode={isReservaEmergencia ? "decimal" : "numeric"}
                    />
                  )}
                </TableCell>
                <TableCell className="px-2 font-normal text-gray-800 dark:text-gray-400 text-xs text-center h-6 leading-6 whitespace-nowrap border-b border-gray-200 border-l-0 border-r-0">
                  {isImoveisBens ? (
                    <span className="text-gray-500 dark:text-gray-500">-</span>
                  ) : (
                    <EditableCell
                      value={ativo.alocacaoMaximo}
                      isEditing={isEditing(ativo.categoria, 'maximo')}
                      onStartEdit={() => startEditing(ativo.categoria, 'maximo')}
                      onStopEdit={stopEditing}
                      onValueChange={(valor) => handleConfigChange(ativo.categoria, 'maximo', valor)}
                      min={0}
                      max={100}
                      suffix={isReservaEmergencia ? "" : "%"}
                      formatValue={minMaxDisplayValue}
                      parseValue={isReservaEmergencia ? parseValorReserva : undefined}
                      inputMode={isReservaEmergencia ? "decimal" : "numeric"}
                    />
                  )}
                </TableCell>
                <TableCell className={`px-2 text-xs font-medium text-center h-6 leading-6 whitespace-nowrap ${
                  isImoveisBens
                    ? "border-b border-gray-200 border-l-0 border-r-0 text-gray-500 dark:text-gray-500"
                    : isReservaEmergencia
                    ? "border-b border-gray-200 border-l-0 border-r-0 text-gray-800 dark:text-gray-400"
                    : "border-2 border-t-2 border-b-2 border-l-2 border-r-2 border-black text-gray-800 dark:text-gray-400"
                }`}>
                  {isImoveisBens ? (
                    <span className="text-gray-500 dark:text-gray-500">-</span>
                  ) : (
                    <EditableCell
                      value={ativo.percentualTarget}
                      isEditing={isEditing(ativo.categoria, 'target')}
                      onStartEdit={() => startEditing(ativo.categoria, 'target')}
                      onStopEdit={stopEditing}
                      onValueChange={(valor) => handleConfigChange(ativo.categoria, 'target', valor)}
                      min={0}
                      max={999999}
                      suffix={isReservaEmergencia ? "" : "%"}
                      formatValue={minMaxDisplayValue}
                      parseValue={isReservaEmergencia ? parseValorReserva : undefined}
                      inputMode={isReservaEmergencia ? "decimal" : "numeric"}
                    />
                  )}
                </TableCell>
                <TableCell className={`px-2 text-xs text-center font-medium h-6 leading-6 whitespace-nowrap border-b border-gray-200 border-l-0 border-r-0 ${
                  ativo.quantoFalta > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                }`}>
                  {isImoveisBens ? "" : (
                    ativo.quantoFalta > 0
                      ? `Falta ${formatarPercentual(ativo.quantoFalta)}`
                      : ativo.quantoFalta < 0
                        ? `Excesso ${formatarPercentual(Math.abs(ativo.quantoFalta))}`
                        : 'No target'
                  )}
                </TableCell>
                <TableCell className="px-2 font-normal text-gray-800 dark:text-gray-400 text-xs text-center h-6 leading-6 whitespace-nowrap border-b border-gray-200 border-l-0 border-r-0 font-mono w-36">
                  <span className={ativo.necessidadeAporte > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                    {ativo.necessidadeAporte > 0 ? formatarMoeda(ativo.necessidadeAporte) : '-'}
                  </span>
                </TableCell>
                <TableCell className="px-2 font-normal text-gray-800 dark:text-gray-400 text-xs text-center h-6 leading-6 border-b border-gray-200 border-l-0 border-r border-gray-300">
                  <EditableTextCell
                    value={ativo.descricao}
                    isEditing={isEditing(ativo.categoria, "descricao")}
                    onStartEdit={() => startEditing(ativo.categoria, "descricao")}
                    onStopEdit={stopEditing}
                    onValueChange={(valor) => handleDescricaoChange(ativo.categoria, valor)}
                    className="text-xs"
                  />
                </TableCell>
              </TableRow>
            )})}
            
            {/* Linha de Total Dinheiro (exclui Imóveis e Bens) */}
            <TableRow 
              className="h-6" 
              style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px', backgroundColor: '#595959' }}
            >
              <TableCell className="px-2 font-bold text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-t border-b border-l border-gray-200 border-r-0" style={{ backgroundColor: '#595959' }}>
                Total Dinheiro
              </TableCell>
              <TableCell className="px-2 font-bold text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0 font-mono" style={{ backgroundColor: '#595959' }}>
                {formatarMoeda(totalDinheiro)}
              </TableCell>
              <TableCell className="px-2 font-bold text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0" style={{ backgroundColor: '#595959' }}>
                
              </TableCell>
              <TableCell className="px-2 border-t border-b border-gray-200 border-l-0 border-r-0 h-6 leading-6" style={{ backgroundColor: '#595959' }}></TableCell>
              <TableCell className="px-2 border-t border-b border-gray-200 border-l-0 border-r-0 h-6 leading-6" style={{ backgroundColor: '#595959' }}></TableCell>
              <TableCell className="px-2 font-bold text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0" style={{ backgroundColor: '#595959' }}>
                {formatarPercentual(totalPercentualTarget)}
              </TableCell>
              <TableCell className="px-2 border-t border-b border-gray-200 border-l-0 border-r border-gray-300 h-6 leading-6" style={{ backgroundColor: '#595959' }}></TableCell>
              <TableCell className="px-2 border-t border-b border-gray-200 border-l-0 border-r border-gray-300 h-6 leading-6" style={{ backgroundColor: '#595959' }}></TableCell>
              <TableCell className="px-2 border-t border-b border-gray-200 border-l-0 border-r border-gray-300 h-6 leading-6" style={{ backgroundColor: '#595959' }}></TableCell>
            </TableRow>
            
            {/* Linha de Total Dinheiro + Bens */}
            <TableRow 
              className="h-6" 
              style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px', backgroundColor: '#404040' }}
            >
              <TableCell className="px-2 font-bold text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-t border-b border-l border-gray-200 border-r-0" style={{ backgroundColor: '#404040' }}>
                Total Dinheiro + Bens
              </TableCell>
              <TableCell className="px-2 font-bold text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0 font-mono" style={{ backgroundColor: '#404040' }}>
                {formatarMoeda(totalDinheiroMaisBens)}
              </TableCell>
              <TableCell className="px-2 font-bold text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0" style={{ backgroundColor: '#404040' }}>
                
              </TableCell>
              <TableCell className="px-2 border-t border-b border-gray-200 border-l-0 border-r-0 h-6 leading-6" style={{ backgroundColor: '#404040' }}></TableCell>
              <TableCell className="px-2 border-t border-b border-gray-200 border-l-0 border-r-0 h-6 leading-6" style={{ backgroundColor: '#404040' }}></TableCell>
              <TableCell className="px-2 border-t border-b border-gray-200 border-l-0 border-r-0 h-6 leading-6" style={{ backgroundColor: '#404040' }}></TableCell>
              <TableCell className="px-2 border-t border-b border-gray-200 border-l-0 border-r border-gray-300 h-6 leading-6" style={{ backgroundColor: '#404040' }}></TableCell>
              <TableCell className="px-2 border-t border-b border-gray-200 border-l-0 border-r border-gray-300 h-6 leading-6" style={{ backgroundColor: '#404040' }}></TableCell>
              <TableCell className="px-2 border-t border-b border-gray-200 border-l-0 border-r border-gray-300 h-6 leading-6" style={{ backgroundColor: '#404040' }}></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end mt-4">
        <button
          onClick={handleSaveConfigurations}
          className="px-3 py-2 bg-brand-500 text-white text-xs rounded-lg hover:bg-brand-600 transition-colors"
        >
          Salvar Configurações
        </button>
      </div>
    </ComponentCard>
  );
} 