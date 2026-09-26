'use client';
import React, { useState } from 'react';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { CATEGORIA_TO_TAB } from './carteiraTabsConfig';
import AlocacaoAtivosMobile from './AlocacaoAtivosMobile';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/table';
import type { UseAlocacaoConfigReturn } from '@/hooks/useAlocacaoConfig';
import EditableCell from './EditableCell';
import EditableTextCell from './EditableTextCell';
import Alert from '../ui/alert/Alert';
import ComponentCard from '../common/ComponentCard';
import { Modal } from '../ui/modal';
import {
  CAIXA_ABAS,
  CATEGORIA_TO_CAIXA_ABA,
  planejarDistribuicao,
  type CaixaAbaKey,
} from '@/lib/caixaParaInvestirPlano';
import type { DistribuirCaixaFn } from '@/lib/caixaParaInvestirClient';
import type { CategoriaCarteira } from '@/services/portfolio/itemValuation';
import { parseCurrencyInput } from '@/utils/parseCurrencyInput';
import {
  TABLE_STYLES,
  TABLE_HEADER_STYLE,
  TABLE_HIGHLIGHT_HEADER_STYLE,
} from '@/components/ui/table/tableStyles';

// Padrão visual único de tabela (15/09/2026): wrapper arredondado, cabeçalho
// no azul segurança da paleta, linhas sem bordas verticais, totais em
// cinza-claro — mesmo visual do Orçamento. Antes era estilo Excel (Calibri,
// bordas pretas, totais #595959/#404040).

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
  /** Necessidade antes de abater o caixa livre (base da distribuição do caixa). */
  necessidadeSemCaixa: number;
  /** Quanto a classe está ACIMA do target, em R$ (0 quando falta ou bate). */
  excessoAporte: number;
  descricao: string;
}

interface AlocacaoAtivosTableProps {
  distribuicao: {
    reservaEmergencia: { valor: number; percentual: number };
    reservaOportunidade: { valor: number; percentual: number };
    rendaFixaFundos: { valor: number; percentual: number };
    fimFia: { valor: number; percentual: number };
    fiis: { valor: number; percentual: number };
    acoes: { valor: number; percentual: number };
    stocks: { valor: number; percentual: number };
    reits: { valor: number; percentual: number };
    etfs: { valor: number; percentual: number };
    moedasCriptos: { valor: number; percentual: number };
    previdenciaSeguros: { valor: number; percentual: number };
    opcoes: { valor: number; percentual: number };
    imoveisBens: { valor: number; percentual: number };
  };
  alocacaoConfig: UseAlocacaoConfigReturn;
  caixaParaInvestir?: number;
  totais?: { dinheiro: number; dinheiroMaisBens: number };
  onNavigateToTab?: (tabId: string) => void;
  /** Sem ele o botão "Distribuir caixa livre" não aparece. */
  onDistribuirCaixa?: DistribuirCaixaFn;
}

export default function AlocacaoAtivosTable({
  distribuicao,
  alocacaoConfig,
  caixaParaInvestir = 0,
  totais,
  onNavigateToTab,
  onDistribuirCaixa,
}: AlocacaoAtivosTableProps) {
  // Totais vêm PRONTOS do backend (denominador único do resumo). O fallback
  // local existe só para resposta cacheada antiga sem `totais` (TTL 60s
  // pós-deploy) — a soma local antiga contava o caixa consolidado em cima dos
  // caixas por aba já embutidos nas categorias (dupla contagem).
  const totalDinheiro =
    totais?.dinheiro ??
    Object.entries(distribuicao)
      .filter(([key]) => key !== 'imoveisBens')
      .reduce((sum, [, item]) => sum + item.valor, 0) + caixaParaInvestir;

  const totalDinheiroMaisBens =
    totais?.dinheiroMaisBens ?? totalDinheiro + (distribuicao.imoveisBens?.valor || 0);

  // Total Carteira para cálculos de percentuais (exclui Imóveis e Bens)
  const totalCarteira = totalDinheiro;
  // PWA fase 1: abaixo de lg a tabela vira cartões (um DOM só — a tabela do desktop fica intocada).
  const isBelowLg = useIsBelowLg();
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Configurações salvas com sucesso!');
  const [distribuicaoAberta, setDistribuicaoAberta] = useState(false);
  const [distribuindo, setDistribuindo] = useState(false);
  const [erroDistribuicao, setErroDistribuicao] = useState<string | null>(null);

  const {
    configuracoes,
    loading: configLoading,
    error: configError,
    updateConfiguracao,
    saveChanges,
    startEditing,
    stopEditing,
    isEditing,
  } = alocacaoConfig;

  // Mapeamento das configurações para o formato usado na tabela
  const targetConfigMap = configuracoes.reduce(
    (acc, config) => {
      acc[config.categoria] = {
        min: config.minimo,
        max: config.maximo,
        target: config.target,
        descricao: config.descricao || '',
      };
      return acc;
    },
    {} as { [key: string]: { min: number; max: number; target: number; descricao: string } },
  );

  // Mapeamento de nomes amigáveis
  const getNomeAmigavel = (categoria: string): string => {
    const nomes: { [key: string]: string } = {
      reservaEmergencia: 'Reserva de Emergência',
      reservaOportunidade: 'Reserva Oportunidade',
      rendaFixaFundos: 'Renda Fixa & Fundos Renda Fixa',
      fimFia: 'Fundos (FIM / FIA)',
      fiis: "FII's",
      acoes: 'Ações',
      stocks: 'STOCKS',
      reits: "REIT's",
      etfs: "ETF's",
      moedasCriptos: 'Moedas, Criptomoedas & Outros',
      previdenciaSeguros: 'Previdência e Seguros',
      opcoes: 'Opções',
      imoveisBens: 'Imóveis e Bens',
    };
    return nomes[categoria] || categoria;
  };

  const calcularDados = (): AlocacaoAtivo[] => {
    const dados: AlocacaoAtivo[] = [];
    let totalNecessidadeAporte = 0;

    // Primeiro, calcular todas as necessidades de aporte sem subtrair o caixa
    Object.entries(distribuicao).forEach(([key, value]) => {
      const config = targetConfigMap[key] || { min: 0, max: 0, target: 0, descricao: '' };

      // % Atual vem pronto do backend (mesma base da pizza — antes as duas
      // telas mostravam percentuais diferentes para a mesma categoria).
      // Fallback local com as mesmas bases para resposta cacheada antiga.
      const baseTotal = key === 'imoveisBens' ? totalDinheiroMaisBens : totalCarteira;
      const percentualAtual =
        value.percentual ?? (baseTotal > 0 ? (value.valor / baseTotal) * 100 : 0);

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
          necessidadeSemCaixa: 0,
          excessoAporte: 0,
          descricao: '',
        });
      } else {
        const diferenca = config.target - percentualAtual;
        // Necessidade em R$ sai dos VALORES, não do % exibido (arredondado a
        // 2 casas no backend): 20,39% × total dava R$ 35 a menos que
        // 50% × total − atual (auditoria Pedro 25/08/2026, item B6).
        const valorAlvo = (config.target / 100) * totalCarteira;
        const valorNecessario = Math.max(0, valorAlvo - value.valor);
        // Excesso em R$ (pedido do Wellington 16/09/2026): a coluna de
        // necessidade mostrava "-" quando a classe passava do target.
        const valorExcedente = Math.max(0, value.valor - valorAlvo);
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
          necessidadeSemCaixa: valorNecessario,
          excessoAporte: valorExcedente,
          descricao: config.descricao || '',
        });
      }
    });

    // Agora, se houver caixa para investir e necessidade de aporte, distribuir proporcionalmente
    if (caixaParaInvestir > 0 && totalNecessidadeAporte > 0) {
      const caixaDisponivel = Math.min(caixaParaInvestir, totalNecessidadeAporte);
      const fatorReducao = 1 - caixaDisponivel / totalNecessidadeAporte;

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

  // Distribuir o caixa LIVRE pelo alvo (fase 3 do caixa, 21/09/2026): cada
  // aba recebe, como reserva, uma fatia proporcional ao que falta para ela
  // chegar no target — nunca mais do que falta. Reservas de emergência e
  // oportunidade não têm reserva no caixa (CATEGORIA_TO_CAIXA_ABA = null).
  const necessidadesPorAba: Partial<Record<CaixaAbaKey, number>> = {};
  const categoriaPorAba: Partial<Record<CaixaAbaKey, AlocacaoAtivo>> = {};
  const semReservaComFalta: AlocacaoAtivo[] = [];
  for (const ativo of dados) {
    if (ativo.necessidadeSemCaixa <= 0) continue;
    const aba = CATEGORIA_TO_CAIXA_ABA[ativo.categoria as CategoriaCarteira] ?? null;
    if (aba) {
      necessidadesPorAba[aba] = ativo.necessidadeSemCaixa;
      categoriaPorAba[aba] = ativo;
    } else {
      semReservaComFalta.push(ativo);
    }
  }
  const planoDistribuicao = planejarDistribuicao(caixaParaInvestir, necessidadesPorAba);
  const podeDistribuir = !!onDistribuirCaixa && planoDistribuicao.distribuido > 0;

  const handleConfirmarDistribuicao = async () => {
    if (!onDistribuirCaixa) return;
    setDistribuindo(true);
    setErroDistribuicao(null);
    const result = await onDistribuirCaixa(planoDistribuicao.porAba);
    setDistribuindo(false);
    if (result === true) {
      setDistribuicaoAberta(false);
      setSuccessMessage('Caixa livre distribuído entre as reservas das classes.');
      setShowSuccessAlert(true);
      setTimeout(() => setShowSuccessAlert(false), 3000);
    } else {
      setErroDistribuicao(result.message);
    }
  };
  const totalPercentualTarget = dados
    .filter((ativo) => ativo.categoria !== 'imoveisBens' && ativo.categoria !== 'reservaEmergencia')
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
    const parsedValue = parseCurrencyInput(rawValue);
    if (parsedValue === null) {
      return Number.NaN;
    }
    return totalCarteira > 0 ? (parsedValue / totalCarteira) * 100 : 0;
  };

  const handleSaveConfigurations = async () => {
    const success = await saveChanges();
    if (success) {
      setSuccessMessage('Configurações salvas com sucesso!');
      setShowSuccessAlert(true);
      setTimeout(() => setShowSuccessAlert(false), 3000);
    }
    return success;
  };

  const handleConfigChange = (
    categoria: string,
    field: 'minimo' | 'maximo' | 'target',
    valor: number,
  ) => {
    updateConfiguracao(categoria, field, valor);
  };

  const handleDescricaoChange = (categoria: string, valor: string) => {
    updateConfiguracao(categoria, 'descricao', valor);
  };

  const distribuirModal = (
    <Modal
      isOpen={distribuicaoAberta}
      onClose={() => !distribuindo && setDistribuicaoAberta(false)}
      className="max-w-lg m-4"
    >
      <div className="p-6">
        <h3 className="pr-10 text-lg font-semibold text-gray-900 dark:text-white">
          Distribuir caixa livre
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Os {formatarMoeda(caixaParaInvestir)} livres viram reserva das classes abaixo do target,
          na proporção do que falta para cada uma. O total do caixa não muda.
        </p>

        <div className={`${TABLE_STYLES.wrapper} mt-4`}>
          <Table className={TABLE_STYLES.table}>
            <TableHeader>
              <TableRow className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-left`}>
                  Classe
                </TableCell>
                <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-right`}>
                  Falta p/ o target
                </TableCell>
                <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-right`}>
                  Vai reservar
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(Object.keys(planoDistribuicao.porAba) as CaixaAbaKey[]).map((aba) => (
                <TableRow key={aba} className={TABLE_STYLES.row}>
                  <TableCell className={`${TABLE_STYLES.compact.td} whitespace-nowrap`}>
                    {categoriaPorAba[aba]?.classeAtivo ?? CAIXA_ABAS[aba].label}
                  </TableCell>
                  <TableCell
                    className={`${TABLE_STYLES.compact.td} whitespace-nowrap text-right font-mono`}
                  >
                    {formatarMoeda(necessidadesPorAba[aba] ?? 0)}
                  </TableCell>
                  <TableCell
                    className={`${TABLE_STYLES.compact.td} whitespace-nowrap text-right font-mono font-medium`}
                  >
                    {formatarMoeda(planoDistribuicao.porAba[aba] ?? 0)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className={TABLE_STYLES.totalRow}>
                <TableCell className={`${TABLE_STYLES.compact.td} whitespace-nowrap`}>
                  Continua livre
                </TableCell>
                <TableCell className={TABLE_STYLES.compact.td} />
                <TableCell
                  className={`${TABLE_STYLES.compact.td} whitespace-nowrap text-right font-mono`}
                >
                  {formatarMoeda(planoDistribuicao.sobra)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {semReservaComFalta.length > 0 && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {semReservaComFalta.map((a) => a.classeAtivo).join(' e ')}{' '}
            {semReservaComFalta.length > 1 ? 'não têm' : 'não tem'} reserva no caixa e{' '}
            {semReservaComFalta.length > 1 ? 'ficam' : 'fica'} de fora da distribuição.
          </p>
        )}

        {erroDistribuicao && (
          <div className="mt-4">
            <Alert variant="error" title="Não foi possível distribuir" message={erroDistribuicao} />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDistribuicaoAberta(false)}
            disabled={distribuindo}
            className="px-3 py-2 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5 disabled:opacity-50 max-lg:h-12 max-lg:flex-1 max-lg:text-base"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmarDistribuicao}
            disabled={distribuindo}
            className="px-3 py-2 bg-brand-500 text-white text-xs rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 max-lg:h-12 max-lg:flex-1 max-lg:bg-mf-patrimonio max-lg:text-base max-lg:font-semibold"
          >
            {distribuindo ? 'Distribuindo...' : 'Confirmar distribuição'}
          </button>
        </div>
      </div>
    </Modal>
  );

  if (configLoading) {
    return (
      <ComponentCard title="Alocação de Ativos">
        <div className="flex justify-center items-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
        </div>
      </ComponentCard>
    );
  }

  if (isBelowLg) {
    return (
      <AlocacaoAtivosMobile
        dados={dados}
        totalDinheiro={totalDinheiro}
        totalDinheiroMaisBens={totalDinheiroMaisBens}
        totalPercentualTarget={totalPercentualTarget}
        formatarMoeda={formatarMoeda}
        formatarPercentual={formatarPercentual}
        formatarValorReserva={formatarValorReserva}
        parseValorReserva={parseValorReserva}
        totalCarteira={totalCarteira}
        onNavigateToTab={onNavigateToTab}
        onConfigChange={handleConfigChange}
        onSave={handleSaveConfigurations}
        onDiscard={() => void alocacaoConfig.refetch()}
        successMessage={showSuccessAlert ? successMessage : null}
        configError={configError}
        distribuir={
          podeDistribuir
            ? {
                label: `Distribuir caixa livre (${formatarMoeda(caixaParaInvestir)})`,
                onOpen: () => {
                  setErroDistribuicao(null);
                  setDistribuicaoAberta(true);
                },
              }
            : null
        }
      >
        {distribuirModal}
      </AlocacaoAtivosMobile>
    );
  }

  return (
    <ComponentCard title="Alocação de Ativos">
      {/* Alerts */}
      {showSuccessAlert && (
        <div className="mb-4">
          <Alert variant="success" title="Sucesso" message={successMessage} />
        </div>
      )}
      {configError && (
        <div className="mb-4">
          <Alert variant="error" title="Erro" message={configError} />
        </div>
      )}

      <div className={TABLE_STYLES.wrapper}>
        <Table className={TABLE_STYLES.table}>
          <TableHeader
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 400,
              isolation: 'isolate',
            }}
          >
            <TableRow className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              <TableCell isHeader rowSpan={2} className={`${TABLE_STYLES.compact.th} text-left`}>
                Classe de ativos
              </TableCell>
              <TableCell isHeader rowSpan={2} className={`${TABLE_STYLES.compact.th} text-center`}>
                TOTAL
              </TableCell>
              <TableCell isHeader rowSpan={2} className={`${TABLE_STYLES.compact.th} text-center`}>
                % Atual
              </TableCell>
              <TableCell isHeader colSpan={2} className={`${TABLE_STYLES.compact.th} text-center`}>
                Alocação
              </TableCell>
              <TableCell
                isHeader
                rowSpan={2}
                className={`${TABLE_STYLES.compact.th} text-center`}
                style={TABLE_HIGHLIGHT_HEADER_STYLE}
              >
                % TARGET
              </TableCell>
              <TableCell isHeader rowSpan={2} className={`${TABLE_STYLES.compact.th} text-center`}>
                Quanto Falta
              </TableCell>
              <TableCell
                isHeader
                rowSpan={2}
                className={`${TABLE_STYLES.compact.th} w-36 text-center`}
              >
                <span className="block">Necessidade de</span>
                <span className="block">aporte em</span>
              </TableCell>
              <TableCell isHeader rowSpan={2} className={`${TABLE_STYLES.compact.th} text-center`}>
                Descrição
              </TableCell>
            </TableRow>
            <TableRow className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
              <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-center`}>
                Mínimo
              </TableCell>
              <TableCell isHeader className={`${TABLE_STYLES.compact.th} text-center`}>
                Máximo
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dados.map((ativo) => {
              const isReservaEmergencia = ativo.categoria === 'reservaEmergencia';
              const isImoveisBens = ativo.categoria === 'imoveisBens';
              const minMaxDisplayValue = (valor: number) =>
                isReservaEmergencia ? formatarValorReserva(valor) : formatarPercentual(valor);
              return (
                <TableRow
                  key={ativo.classeAtivo}
                  className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}
                >
                  <TableCell className={`${TABLE_STYLES.compact.td} whitespace-nowrap font-medium`}>
                    {onNavigateToTab && CATEGORIA_TO_TAB[ativo.categoria] ? (
                      <button
                        type="button"
                        onClick={() => onNavigateToTab(CATEGORIA_TO_TAB[ativo.categoria])}
                        className="text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 hover:underline cursor-pointer"
                      >
                        {ativo.classeAtivo}
                      </button>
                    ) : (
                      <span>{ativo.classeAtivo}</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={`${TABLE_STYLES.compact.td} whitespace-nowrap text-center font-mono`}
                  >
                    {formatarMoeda(ativo.total)}
                  </TableCell>
                  <TableCell
                    className={`${TABLE_STYLES.compact.td} whitespace-nowrap text-center font-medium`}
                  >
                    {formatarPercentual(ativo.percentualAtual)}
                  </TableCell>
                  <TableCell className={`${TABLE_STYLES.compact.td} whitespace-nowrap text-center`}>
                    {isImoveisBens ? (
                      <span className="text-gray-500 dark:text-gray-500">-</span>
                    ) : (
                      <EditableCell
                        value={ativo.alocacaoMinimo}
                        isEditing={isEditing(ativo.categoria, 'minimo')}
                        onStartEdit={() => startEditing(ativo.categoria, 'minimo')}
                        onStopEdit={stopEditing}
                        onValueChange={(valor) =>
                          handleConfigChange(ativo.categoria, 'minimo', valor)
                        }
                        min={0}
                        max={100}
                        suffix={isReservaEmergencia ? '' : '%'}
                        formatValue={minMaxDisplayValue}
                        parseValue={isReservaEmergencia ? parseValorReserva : undefined}
                        inputMode={isReservaEmergencia ? 'decimal' : 'numeric'}
                      />
                    )}
                  </TableCell>
                  <TableCell className={`${TABLE_STYLES.compact.td} whitespace-nowrap text-center`}>
                    {isImoveisBens ? (
                      <span className="text-gray-500 dark:text-gray-500">-</span>
                    ) : (
                      <EditableCell
                        value={ativo.alocacaoMaximo}
                        isEditing={isEditing(ativo.categoria, 'maximo')}
                        onStartEdit={() => startEditing(ativo.categoria, 'maximo')}
                        onStopEdit={stopEditing}
                        onValueChange={(valor) =>
                          handleConfigChange(ativo.categoria, 'maximo', valor)
                        }
                        min={0}
                        max={100}
                        suffix={isReservaEmergencia ? '' : '%'}
                        formatValue={minMaxDisplayValue}
                        parseValue={isReservaEmergencia ? parseValorReserva : undefined}
                        inputMode={isReservaEmergencia ? 'decimal' : 'numeric'}
                      />
                    )}
                  </TableCell>
                  {/* Célula TARGET: antes destacada com borda preta dupla (Excel);
                      no padrão único o destaque é só tipográfico. */}
                  <TableCell
                    className={`${TABLE_STYLES.compact.td} ${TABLE_STYLES.highlightTd} whitespace-nowrap text-center ${
                      isImoveisBens
                        ? 'text-gray-500 dark:text-gray-500'
                        : isReservaEmergencia
                          ? 'font-medium'
                          : 'font-semibold text-gray-900 dark:text-white'
                    }`}
                  >
                    {isImoveisBens ? (
                      <span className="text-gray-500 dark:text-gray-500">-</span>
                    ) : (
                      <EditableCell
                        value={ativo.percentualTarget}
                        isEditing={isEditing(ativo.categoria, 'target')}
                        onStartEdit={() => startEditing(ativo.categoria, 'target')}
                        onStopEdit={stopEditing}
                        onValueChange={(valor) =>
                          handleConfigChange(ativo.categoria, 'target', valor)
                        }
                        min={0}
                        max={999999}
                        suffix={isReservaEmergencia ? '' : '%'}
                        formatValue={minMaxDisplayValue}
                        parseValue={isReservaEmergencia ? parseValorReserva : undefined}
                        inputMode={isReservaEmergencia ? 'decimal' : 'numeric'}
                      />
                    )}
                  </TableCell>
                  <TableCell
                    className={`${TABLE_STYLES.compact.td} whitespace-nowrap text-center font-medium ${
                      ativo.quantoFalta < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {isImoveisBens
                      ? ''
                      : ativo.quantoFalta > 0
                        ? `Falta ${formatarPercentual(ativo.quantoFalta)}`
                        : ativo.quantoFalta < 0
                          ? `Excesso ${formatarPercentual(Math.abs(ativo.quantoFalta))}`
                          : 'No target'}
                  </TableCell>
                  <TableCell
                    className={`${TABLE_STYLES.compact.td} w-36 whitespace-nowrap text-center font-mono`}
                  >
                    {ativo.necessidadeAporte > 0 ? (
                      <span className="text-green-600 dark:text-green-400">
                        {formatarMoeda(ativo.necessidadeAporte)}
                      </span>
                    ) : ativo.excessoAporte > 0 ? (
                      <span
                        className="text-red-600 dark:text-red-400"
                        title="Valor acima do target desta classe"
                      >
                        -{formatarMoeda(ativo.excessoAporte)}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className={`${TABLE_STYLES.compact.td} text-center`}>
                    <EditableTextCell
                      value={ativo.descricao}
                      isEditing={isEditing(ativo.categoria, 'descricao')}
                      onStartEdit={() => startEditing(ativo.categoria, 'descricao')}
                      onStopEdit={stopEditing}
                      onValueChange={(valor) => handleDescricaoChange(ativo.categoria, valor)}
                      className="text-xs"
                    />
                  </TableCell>
                </TableRow>
              );
            })}

            {/* Linha de Total Dinheiro (exclui Imóveis e Bens) */}
            <TableRow className={TABLE_STYLES.totalRow}>
              <TableCell className={`${TABLE_STYLES.compact.td} whitespace-nowrap`}>
                Total Dinheiro
              </TableCell>
              <TableCell
                className={`${TABLE_STYLES.compact.td} whitespace-nowrap text-center font-mono`}
              >
                {formatarMoeda(totalDinheiro)}
              </TableCell>
              <TableCell className={TABLE_STYLES.compact.td} />
              <TableCell className={TABLE_STYLES.compact.td} />
              <TableCell className={TABLE_STYLES.compact.td} />
              <TableCell className={`${TABLE_STYLES.compact.td} whitespace-nowrap text-center`}>
                {formatarPercentual(totalPercentualTarget)}
              </TableCell>
              <TableCell className={TABLE_STYLES.compact.td} />
              <TableCell className={TABLE_STYLES.compact.td} />
              <TableCell className={TABLE_STYLES.compact.td} />
            </TableRow>

            {/* Linha de Total Dinheiro + Bens */}
            <TableRow className={`${TABLE_STYLES.totalRow} font-semibold`}>
              <TableCell className={`${TABLE_STYLES.compact.td} whitespace-nowrap`}>
                Total Dinheiro + Bens
              </TableCell>
              <TableCell
                className={`${TABLE_STYLES.compact.td} whitespace-nowrap text-center font-mono`}
              >
                {formatarMoeda(totalDinheiroMaisBens)}
              </TableCell>
              <TableCell className={TABLE_STYLES.compact.td} />
              <TableCell className={TABLE_STYLES.compact.td} />
              <TableCell className={TABLE_STYLES.compact.td} />
              <TableCell className={TABLE_STYLES.compact.td} />
              <TableCell className={TABLE_STYLES.compact.td} />
              <TableCell className={TABLE_STYLES.compact.td} />
              <TableCell className={TABLE_STYLES.compact.td} />
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 mt-4">
        {podeDistribuir && (
          <button
            type="button"
            onClick={() => {
              setErroDistribuicao(null);
              setDistribuicaoAberta(true);
            }}
            className="px-3 py-2 border border-brand-500 text-brand-500 text-xs rounded-lg hover:bg-brand-50 dark:text-brand-400 dark:border-brand-400 dark:hover:bg-brand-500/10 transition-colors"
            title="Reserva o caixa livre para as classes que estão abaixo do target"
          >
            Distribuir caixa livre ({formatarMoeda(caixaParaInvestir)})
          </button>
        )}
        <button
          onClick={handleSaveConfigurations}
          className="px-3 py-2 bg-brand-500 text-white text-xs rounded-lg hover:bg-brand-600 transition-colors"
        >
          Salvar Configurações
        </button>
      </div>

      {distribuirModal}
    </ComponentCard>
  );
}
