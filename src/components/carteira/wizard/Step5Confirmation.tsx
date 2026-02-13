"use client";
import React, { useEffect } from "react";
import { WizardFormData, TIPOS_ATIVO, MOEDAS_FIXAS, INDEXADORES, PERIODOS, RENDA_FIXA_TIPOS } from "@/types/wizard";
import Button from "@/components/ui/button/Button";

interface Step5ConfirmationProps {
  formData: WizardFormData;
  onSubmit: () => void;
  loading: boolean;
  autoSubmit?: boolean;
}

export default function Step5Confirmation({
  formData,
  onSubmit,
  loading,
  autoSubmit = false,
}: Step5ConfirmationProps) {
  // Auto-submit quando entrar na tela de confirmação
  useEffect(() => {
    if (autoSubmit && !loading) {
      onSubmit();
    }
  }, [autoSubmit, loading, onSubmit]);
  const getTipoAtivoLabel = (value: string | number | Date | null | undefined) => {
    if (typeof value !== 'string') return '-';
    return TIPOS_ATIVO.find(t => t.value === value)?.label || value;
  };

  const getMoedaLabel = (value: string | number | Date | null | undefined) => {
    if (typeof value !== 'string') return '-';
    return MOEDAS_FIXAS.find(m => m.value === value)?.label || value;
  };

  const getIndexadorLabel = (value: string | number | Date | null | undefined) => {
    if (typeof value !== 'string') return '-';
    return INDEXADORES.find(i => i.value === value)?.label || value;
  };

  const getPeriodoLabel = (value: string | number | Date | null | undefined) => {
    if (typeof value !== 'string') return '-';
    return PERIODOS.find(p => p.value === value)?.label || value;
  };

  const getRendaFixaTipoLabel = (value: string | number | Date | null | undefined) => {
    if (typeof value !== 'string') return '-';
    return RENDA_FIXA_TIPOS.find(t => t.value === value)?.label || value;
  };

  const formatCurrency = (value: string | number | Date | null | undefined) => {
    if (typeof value !== 'number') return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateString: string | number | Date | null | undefined) => {
    if (!dateString) return '-';
    if (dateString instanceof Date) return dateString.toLocaleDateString('pt-BR');
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const renderFieldValue = (label: string, value: string | number | Date | null | undefined, formatter?: (val: string | number | Date | null | undefined) => string) => {
    if (!value && value !== 0) return null;
    
    return (
      <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
        <span className="text-sm text-gray-600 dark:text-gray-400">{label}:</span>
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {formatter ? formatter(value) : (value instanceof Date ? value.toLocaleDateString('pt-BR') : value)}
        </span>
      </div>
    );
  };

  const renderAssetTypeSpecificFields = () => {
    switch (formData.tipoAtivo) {
      case "conta-corrente":
        return (
          <>
            {renderFieldValue("Data de Início", formData.dataInicio, formatDate)}
            {renderFieldValue("Valor Aplicado", formData.valorAplicado, formatCurrency)}
            {renderFieldValue("Percentual sobre CDI", formData.percentualCDI, (val) => `${val}%`)}
          </>
        );

      case "criptoativo":
        return (
          <>
            {renderFieldValue("Data de Compra", formData.dataCompra, formatDate)}
            {renderFieldValue("Quantidade", formData.quantidade)}
            {renderFieldValue("Cotação de Compra", formData.cotacaoCompra, formatCurrency)}
          </>
        );

      case "moeda":
        return (
          <>
            {renderFieldValue("Moeda", formData.moeda, getMoedaLabel)}
            {renderFieldValue("Data de Compra", formData.dataCompra, formatDate)}
            {renderFieldValue("Cotação de Compra", formData.cotacaoCompra, formatCurrency)}
            {renderFieldValue("Valor do Investimento", formData.valorInvestido, formatCurrency)}
          </>
        );

      case "personalizado":
        return (
          <>
            {renderFieldValue("Data de Início", formData.dataInicio, formatDate)}
            {renderFieldValue("Nome do Ativo", formData.nomePersonalizado)}
            {renderFieldValue("Quantidade de Cotas", formData.quantidade)}
            {renderFieldValue("Preço Unitário", formData.precoUnitario, formatCurrency)}
            {renderFieldValue("Valor Total", (formData.quantidade || 0) * (formData.precoUnitario || 0), formatCurrency)}
            {renderFieldValue("Método de Acompanhamento", formData.metodo === 'valor' ? 'Por Valor Financeiro: A cada mês você informa o valor atualizado do seu investimento' : 'Por Variação Percentual: A cada mês, você informa quantos % seu investimento rendeu')}
          </>
        );

      case "poupanca":
        return (
          <>
            {renderFieldValue("Data de Aplicação", formData.dataCompra, formatDate)}
            {renderFieldValue("Valor Aplicado", formData.valorAplicado, formatCurrency)}
          </>
        );

      case "renda-fixa":
      case "renda-fixa-posfixada":
        return (
          <>
            {renderFieldValue(
              "Tipo de Renda Fixa",
              formData.rendaFixaTipo,
              (val) => {
                const label = getRendaFixaTipoLabel(val);
                return formData.tipoAtivo === "renda-fixa-posfixada" && typeof label === "string"
                  ? label.replace(/ Pré$/, "")
                  : label;
              }
            )}
            {renderFieldValue("Data de Início", formData.dataInicio, formatDate)}
            {renderFieldValue("Valor Aplicado", formData.valorAplicado, formatCurrency)}
            {renderFieldValue("Data de Vencimento", formData.dataVencimento, formatDate)}
            {formData.tipoAtivo === "renda-fixa-posfixada"
              ? renderFieldValue("Taxa sobre o Indexador", formData.taxaJurosAnual, (val) => `${val}%`)
              : renderFieldValue("Taxa de Juros Anual", formData.taxaJurosAnual, (val) => `${val}%`)}
            {formData.tipoAtivo === "renda-fixa-posfixada" && renderFieldValue("Indexador", formData.rendaFixaIndexer)}
            {formData.tipoAtivo === "renda-fixa-posfixada" && (formData.rendaFixaIndexerPercent ?? 0) > 0 && renderFieldValue("% do Indexador", formData.rendaFixaIndexerPercent ?? 0, (val) => `${val}%`)}
            {renderFieldValue("Descrição", formData.descricao)}
          </>
        );

      case "debenture":
      case "fundo":
      case "previdencia":
      case "tesouro-direto":
        return (
          <>
            {renderFieldValue("Data de Compra", formData.dataCompra, formatDate)}
            {renderFieldValue("Método", formData.metodo === 'valor' ? 'Por Valor Investido' : 'Por Preço da Cota e Quantidade')}
            {formData.metodo === 'valor' ? (
              renderFieldValue("Valor Investido", formData.valorInvestido, formatCurrency)
            ) : (
              <>
                {renderFieldValue("Preço por Cota", formData.cotacaoUnitaria, formatCurrency)}
                {renderFieldValue("Quantidade de Cotas", formData.quantidade)}
                {renderFieldValue("Total Investido", formData.quantidade * formData.cotacaoUnitaria, formatCurrency)}
              </>
            )}
          </>
        );

      case "reserva-emergencia":
      case "reserva-oportunidade":
        return (
          <>
            {renderFieldValue("Data", formData.dataCompra, formatDate)}
            {renderFieldValue("Valor", formData.valorInvestido, formatCurrency)}
            {renderFieldValue("Cot. Resgate", formData.cotizacaoResgate)}
            {renderFieldValue("Liq. Resgate", formData.liquidacaoResgate)}
            {renderFieldValue("Vencimento", formData.vencimento, formatDate)}
            {renderFieldValue("Benchmark", formData.benchmark)}
          </>
        );

      case "fii":
        return (
          <>
            {renderFieldValue("Data de Compra", formData.dataCompra, formatDate)}
            {renderFieldValue("Quantidade de Cotas", formData.quantidade)}
            {renderFieldValue("Cotação Unitária", formData.cotacaoUnitaria, formatCurrency)}
            {renderFieldValue("Taxa de Corretagem", formData.taxaCorretagem, formatCurrency)}
            {renderFieldValue("Total Investido", formData.valorInvestido, formatCurrency)}
          </>
        );

      case "stock":
        return (
          <>
            {renderFieldValue("Data de Compra", formData.dataCompra, formatDate)}
            {renderFieldValue("Moeda", formData.moeda, getMoedaLabel)}
            {renderFieldValue("Cotação da Moeda (R$)", formData.cotacaoMoeda, formatCurrency)}
            {renderFieldValue("Quantidade", formData.quantidade)}
            {renderFieldValue("Preço por Ação (moeda selecionada)", formData.cotacaoUnitaria)}
            {renderFieldValue("Taxa de Corretagem", formData.taxaCorretagem, formatCurrency)}
            {renderFieldValue(
              "Total em R$",
              (formData.quantidade || 0) * (formData.cotacaoUnitaria || 0) * (formData.cotacaoMoeda || 0) + (formData.taxaCorretagem || 0),
              formatCurrency
            )}
          </>
        );

      default:
        // Para ações, BDRs, ETFs, REITs, etc.
        return (
          <>
            {renderFieldValue("Data de Compra", formData.dataCompra, formatDate)}
            {renderFieldValue("Quantidade", formData.quantidade)}
            {renderFieldValue("Cotação Unitária", formData.cotacaoUnitaria, formatCurrency)}
            {renderFieldValue("Taxa de Corretagem", formData.taxaCorretagem, formatCurrency)}
          </>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">
          ✅ Confirmação dos Dados
        </h4>
        <p className="text-sm text-green-700 dark:text-green-300">
          Revise todas as informações abaixo antes de confirmar a adição do ativo à sua carteira.
        </p>
      </div>

      <div className="space-y-4">
        <h5 className="text-lg font-semibold text-gray-900 dark:text-white">
          Resumo do Investimento
        </h5>
        
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="space-y-2">
            {renderFieldValue("Tipo de Ativo", formData.tipoAtivo, getTipoAtivoLabel)}
            {renderFieldValue("Instituição", formData.instituicao)}
            {renderFieldValue("Ativo", formData.ativo)}
            
            {renderAssetTypeSpecificFields()}
            
            {formData.observacoes && renderFieldValue("Observações", formData.observacoes)}
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
          ⚠️ Importante
        </h4>
        <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
          <li>• Verifique se todos os dados estão corretos</li>
          <li>• O ativo será adicionado à sua carteira imediatamente</li>
          <li>• Você poderá editar ou remover o ativo posteriormente</li>
          <li>• Os valores serão atualizados automaticamente conforme o mercado</li>
        </ul>
      </div>

      {!autoSubmit && (
        <div className="flex justify-end gap-4 pt-6">
          <Button
            onClick={onSubmit}
            disabled={loading}
            className="px-6 py-2"
          >
            {loading ? "Salvando..." : "Confirmar Adição do Ativo"}
          </Button>
        </div>
      )}
    </div>
  );
}
