"use client";
import React, { useMemo } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import { useCarteiraResumoContext } from "@/context/CarteiraResumoContext";
import { useIndices } from "@/hooks/useIndices";
import { useCarteiraHistorico } from "@/hooks/useCarteiraHistorico";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

export default function RentabilidadeResumo() {
  const { resumo, formatPercentage } = useCarteiraResumoContext();

  // Calcular data do primeiro investimento
  const firstInvestmentDate = useMemo(() => {
    if (!resumo?.historicoPatrimonio || resumo.historicoPatrimonio.length === 0) {
      return undefined;
    }
    const firstNonZeroItem = resumo.historicoPatrimonio.find(
      item => item.saldoBruto > 0 || item.valorAplicado > 0
    );
    return firstNonZeroItem?.data;
  }, [resumo?.historicoPatrimonio]);

  const hasHistoricoTWR = Array.isArray(resumo?.historicoTWR) && resumo.historicoTWR.length > 0;
  const { indices: indices1d } = useIndices("1y", firstInvestmentDate);
  const { indices: indices1mo } = useIndices("1mo", firstInvestmentDate);
  const { indices: indices1y } = useIndices("1y");
  const { data: carteiraHistoricoDiario } = useCarteiraHistorico(firstInvestmentDate, { enabled: !hasHistoricoTWR });

  // Calcular rentabilidades por período
  const rentabilidades = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeTimestamp = hoje.getTime();
    
    // Último dia
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    const ontemTimestamp = ontem.getTime();

    // Primeiro dia do mês
    const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const primeiroDiaMesTimestamp = primeiroDiaMes.getTime();

    // Primeiro dia do ano
    const primeiroDiaAno = new Date(hoje.getFullYear(), 0, 1);
    const primeiroDiaAnoTimestamp = primeiroDiaAno.getTime();

    // 12 meses atrás
    const dozeMesesAtras = new Date(hoje);
    dozeMesesAtras.setMonth(dozeMesesAtras.getMonth() - 12);
    const dozeMesesAtrasTimestamp = dozeMesesAtras.getTime();

    const calcularRentabilidade = (data: Array<{ date: number; value: number }>, dataInicio: number, dataFim: number) => {
      const dadosFiltrados = data.filter(item => item.date >= dataInicio && item.date <= dataFim);
      if (dadosFiltrados.length === 0) return 0;

      const valorInicio = dadosFiltrados[0]?.value ?? 0;
      const valorFim = dadosFiltrados[dadosFiltrados.length - 1]?.value ?? 0;

      if (valorInicio === 0) return 0;
      const cumInicio = 1 + valorInicio / 100;
      const cumFim = 1 + valorFim / 100;
      return ((cumFim / cumInicio) - 1) * 100;
    };

    const carteiraData = hasHistoricoTWR
      ? (resumo?.historicoTWR ?? []).map((t) => ({ date: t.data, value: t.value }))
      : (carteiraHistoricoDiario ?? []);
    const carteiraUltimoDia = calcularRentabilidade(carteiraData, ontemTimestamp, hojeTimestamp);
    const carteiraMes = calcularRentabilidade(carteiraData, primeiroDiaMesTimestamp, hojeTimestamp);
    const carteiraAno = calcularRentabilidade(carteiraData, primeiroDiaAnoTimestamp, hojeTimestamp);
    const carteira12Meses = calcularRentabilidade(carteiraData, dozeMesesAtrasTimestamp, hojeTimestamp);

    const cdi1d = indices1d.find(i => i.name === 'CDI');
    const cdi1mo = indices1mo.find(i => i.name === 'CDI');
    const cdi1y = indices1y.find(i => i.name === 'CDI');
    
    const ibov1d = indices1d.find(i => i.name === 'IBOV');
    const ibov1mo = indices1mo.find(i => i.name === 'IBOV');
    const ibov1y = indices1y.find(i => i.name === 'IBOV');

    const cdiUltimoDia = (cdi1d?.data && cdi1d.data.length > 0) ? calcularRentabilidade(cdi1d.data, ontemTimestamp, hojeTimestamp) : 0;
    const cdiMes = (cdi1mo?.data && cdi1mo.data.length > 0) ? calcularRentabilidade(cdi1mo.data, primeiroDiaMesTimestamp, hojeTimestamp) : 0;
    const cdiAno = (cdi1y?.data && cdi1y.data.length > 0) ? calcularRentabilidade(cdi1y.data, primeiroDiaAnoTimestamp, hojeTimestamp) : 0;
    const cdi12Meses = (cdi1y?.data && cdi1y.data.length > 0) ? calcularRentabilidade(cdi1y.data, dozeMesesAtrasTimestamp, hojeTimestamp) : 0;

    const ibovUltimoDia = (ibov1d?.data && ibov1d.data.length > 0) ? calcularRentabilidade(ibov1d.data, ontemTimestamp, hojeTimestamp) : 0;
    const ibovMes = (ibov1mo?.data && ibov1mo.data.length > 0) ? calcularRentabilidade(ibov1mo.data, primeiroDiaMesTimestamp, hojeTimestamp) : 0;
    const ibovAno = (ibov1y?.data && ibov1y.data.length > 0) ? calcularRentabilidade(ibov1y.data, primeiroDiaAnoTimestamp, hojeTimestamp) : 0;
    const ibov12Meses = (ibov1y?.data && ibov1y.data.length > 0) ? calcularRentabilidade(ibov1y.data, dozeMesesAtrasTimestamp, hojeTimestamp) : 0;

    return {
      carteira: {
        ultimoDia: carteiraUltimoDia,
        mes: carteiraMes,
        ano: carteiraAno,
        dozeMeses: carteira12Meses,
      },
      cdi: {
        ultimoDia: cdiUltimoDia,
        mes: cdiMes,
        ano: cdiAno,
        dozeMeses: cdi12Meses,
      },
      ibov: {
        ultimoDia: ibovUltimoDia,
        mes: ibovMes,
        ano: ibovAno,
        dozeMeses: ibov12Meses,
      },
    };
  }, [carteiraHistoricoDiario, indices1d, indices1mo, indices1y]);

  // Calcular valores de resumo (% REAL, % TOTAL, % SOBRE CDI)
  const valoresResumo = useMemo(() => {
    if (!resumo) {
      return { real: 0, total: 0, sobreCDI: 0 };
    }

    const rentabilidadeTotal = resumo.rentabilidade || 0;
    const cdi12Meses = rentabilidades.cdi.dozeMeses || 0;
    const sobreCDI = cdi12Meses > 0 ? ((rentabilidadeTotal / cdi12Meses) - 1) * 100 : 0;

    return {
      real: rentabilidadeTotal, // % REAL = rentabilidade total
      total: rentabilidadeTotal, // % TOTAL = rentabilidade total (mesmo valor)
      sobreCDI: sobreCDI, // % SOBRE CDI = quanto acima/abaixo do CDI
    };
  }, [resumo, rentabilidades]);

  // Dados para o gráfico donut (Carteira, CDI, IBOV baseado na rentabilidade de 12 meses)
  const donutData = useMemo(() => {
    // Usar valores absolutos para garantir valores positivos
    const carteiraValor = Math.abs(rentabilidades.carteira.dozeMeses || 0);
    const cdiValor = Math.abs(rentabilidades.cdi.dozeMeses || 0);
    const ibovValor = Math.abs(rentabilidades.ibov.dozeMeses || 0);

    const valores = [
      { nome: 'CARTEIRA', valor: carteiraValor, cor: '#465FFF' },
      { nome: 'CDI', valor: cdiValor, cor: '#10B981' },
      { nome: 'IBOV', valor: ibovValor, cor: '#F59E0B' },
    ];

    // Filtrar apenas valores maiores que zero
    const valoresFiltrados = valores.filter(item => item.valor > 0);

    // Se não houver nenhum valor válido, retornar dados vazios
    if (valoresFiltrados.length === 0) {
      return {
        labels: [],
        series: [],
        colors: [],
      };
    }

    // Calcular percentuais relativos para o gráfico
    const total = valoresFiltrados.reduce((sum, item) => sum + item.valor, 0);
    if (total === 0) {
      return {
        labels: [],
        series: [],
        colors: [],
      };
    }

    const percentuais = valoresFiltrados.map(item => ({
      ...item,
      percentual: (item.valor / total) * 100,
    }));

    return {
      labels: percentuais.map(d => d.nome),
      series: percentuais.map(d => d.percentual),
      colors: percentuais.map(d => d.cor),
    };
  }, [rentabilidades]);

  const donutOptions: ApexOptions = useMemo(() => {
    if (donutData.labels.length === 0) {
      return {
        chart: {
          type: 'donut',
          fontFamily: 'Outfit, sans-serif',
        },
        labels: [],
        series: [],
      };
    }

    return {
      chart: {
        type: 'donut',
        fontFamily: 'Outfit, sans-serif',
        width: '100%',
      },
      labels: donutData.labels,
      colors: donutData.colors,
      plotOptions: {
        pie: {
          donut: {
            size: '65%',
            background: 'transparent',
          },
        },
      },
      dataLabels: {
        enabled: false,
      },
      legend: {
        show: true,
        position: 'bottom',
        horizontalAlign: 'center',
      },
      tooltip: {
        y: {
          formatter: (val: number) => `${val.toFixed(2)}%`,
        },
      },
    };
  }, [donutData]);

  if (!resumo) {
    return null;
  }

  return (
    <ComponentCard title="Resumo de Rentabilidade">
      <div className="space-y-6">
        {/* Gráfico Donut */}
        <div className="flex justify-center w-full min-h-[250px]">
          <div id="chartRentabilidadeResumo" className="w-full max-w-md">
            {donutData.series.length > 0 ? (
              <ReactApexChart
                options={donutOptions}
                series={donutData.series}
                type="donut"
                height={250}
              />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
                Aguardando dados...
              </div>
            )}
          </div>
        </div>

        {/* Valores de Resumo */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">% REAL</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatPercentage(valoresResumo.real)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">% TOTAL</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatPercentage(valoresResumo.total)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400">% SOBRE CDI</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatPercentage(valoresResumo.sobreCDI)}
            </div>
          </div>
        </div>

        {/* Tabela Comparativa - Períodos nas linhas, Carteira/CDI/IBOV nas colunas */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400"></th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">CARTEIRA</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">CDI</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">IBOV</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">Último dia</td>
                <td className="py-3 px-4 text-sm text-right text-[#465FFF]">{formatPercentage(rentabilidades.carteira.ultimoDia)}</td>
                <td className="py-3 px-4 text-sm text-right text-[#10B981]">{formatPercentage(rentabilidades.cdi.ultimoDia)}</td>
                <td className="py-3 px-4 text-sm text-right text-[#F59E0B]">{formatPercentage(rentabilidades.ibov.ultimoDia)}</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">No mês</td>
                <td className="py-3 px-4 text-sm text-right text-[#465FFF]">{formatPercentage(rentabilidades.carteira.mes)}</td>
                <td className="py-3 px-4 text-sm text-right text-[#10B981]">{formatPercentage(rentabilidades.cdi.mes)}</td>
                <td className="py-3 px-4 text-sm text-right text-[#F59E0B]">{formatPercentage(rentabilidades.ibov.mes)}</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">No ano</td>
                <td className="py-3 px-4 text-sm text-right text-[#465FFF]">{formatPercentage(rentabilidades.carteira.ano)}</td>
                <td className="py-3 px-4 text-sm text-right text-[#10B981]">{formatPercentage(rentabilidades.cdi.ano)}</td>
                <td className="py-3 px-4 text-sm text-right text-[#F59E0B]">{formatPercentage(rentabilidades.ibov.ano)}</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white">12 meses</td>
                <td className="py-3 px-4 text-sm text-right text-[#465FFF]">{formatPercentage(rentabilidades.carteira.dozeMeses)}</td>
                <td className="py-3 px-4 text-sm text-right text-[#10B981]">{formatPercentage(rentabilidades.cdi.dozeMeses)}</td>
                <td className="py-3 px-4 text-sm text-right text-[#F59E0B]">{formatPercentage(rentabilidades.ibov.dozeMeses)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ComponentCard>
  );
}
