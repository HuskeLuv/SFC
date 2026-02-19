"use client";
import React, { useEffect, useState } from "react";
import { WizardFormData, WizardErrors, TIPOS_ATIVO } from "@/types/wizard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";

interface Step1AssetTypeProps {
  formData: WizardFormData;
  errors: WizardErrors;
  onFormDataChange: (data: Partial<WizardFormData>) => void;
  onErrorsChange: (errors: Partial<WizardErrors>) => void;
}

export default function Step1AssetType({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step1AssetTypeProps) {
  const [aporteTipos, setAporteTipos] = useState<{ value: string; label: string }[]>([]);
  const [loadingTipos, setLoadingTipos] = useState(false);

  useEffect(() => {
    if (formData.operacao === "aporte") {
      fetchTiposAporte();
    }
  }, [formData.operacao]);

  const fetchTiposAporte = async () => {
    setLoadingTipos(true);
    try {
      const response = await fetch("/api/carteira/resgate/tipos", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setAporteTipos(data.tipos || []);
      }
    } catch (error) {
      console.error("Erro ao buscar tipos para aporte:", error);
    } finally {
      setLoadingTipos(false);
    }
  };

  const handleOperacaoChange = (value: string) => {
    onFormDataChange({
      operacao: value as WizardFormData["operacao"],
      tipoAtivo: "",
      ativo: "",
      assetId: "",
      portfolioId: "",
      availableQuantity: 0,
      availableTotal: 0,
      instituicaoId: "",
      instituicao: "",
    });
    if (errors.operacao) {
      onErrorsChange({ operacao: undefined });
    }
  };

  const handleTipoAtivoChange = (value: string) => {
    onFormDataChange({ 
      tipoAtivo: value, 
      ativo: "", 
      assetId: "",
      rendaFixaTipo: "",
      rendaFixaIndexer: "",
      rendaFixaIndexerPercent: 0,
      rendaFixaLiquidity: "",
      rendaFixaTaxExempt: false,
      taxaFixaAnual: 0,
    });
    
    // Limpar erro quando usuário selecionar
    if (errors.tipoAtivo) {
      onErrorsChange({ tipoAtivo: undefined });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="operacao">Operação *</Label>
        <Select
          options={[
            { value: "compra", label: "Adicionar investimento" },
            { value: "aporte", label: "Aporte" },
          ]}
          placeholder="Selecione a operação"
          defaultValue={formData.operacao}
          onChange={handleOperacaoChange}
          className={errors.operacao ? 'border-red-500' : ''}
        />
        {errors.operacao && (
          <p className="mt-1 text-sm text-red-500">{errors.operacao}</p>
        )}
      </div>
      <div>
        <Label htmlFor="tipoAtivo">Tipo de Ativo *</Label>
        <Select
          options={formData.operacao === "aporte" ? aporteTipos : TIPOS_ATIVO}
          placeholder={formData.operacao === "aporte" ? (loadingTipos ? "Carregando tipos..." : "Selecione o tipo para aporte") : "Selecione o tipo de ativo que deseja adicionar"}
          defaultValue={formData.tipoAtivo}
          onChange={handleTipoAtivoChange}
          className={errors.tipoAtivo ? 'border-red-500' : ''}
        />
        {errors.tipoAtivo && (
          <p className="mt-1 text-sm text-red-500">{errors.tipoAtivo}</p>
        )}
      </div>

      {/* Informações sobre o tipo selecionado */}
      {formData.tipoAtivo && formData.operacao !== "aporte" && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Informações sobre {TIPOS_ATIVO.find(t => t.value === formData.tipoAtivo)?.label}
          </h4>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {getAssetTypeDescription(formData.tipoAtivo)}
          </p>
        </div>
      )}
    </div>
  );
}

function getAssetTypeDescription(tipoAtivo: string): string {
  const descriptions: Record<string, string> = {
    "reserva-emergencia": "Reserva de emergência é um valor guardado para cobrir imprevistos e situações de necessidade. Idealmente deve corresponder a 6 meses das suas despesas mensais.",
    "reserva-oportunidade": "Reserva de oportunidade é um valor mantido disponível para aproveitar oportunidades de investimento que possam surgir no mercado, com boa liquidez para movimentação rápida.",
    "acao": "Ações representam participação no capital social de uma empresa. Você se torna sócio da empresa e pode receber dividendos e participar dos lucros.",
    "bdr": "BDRs (Brazilian Depositary Receipts) são certificados que representam ações de empresas estrangeiras negociadas no Brasil.",
    "conta-corrente": "Conta corrente é uma conta bancária tradicional para movimentação de dinheiro e pagamentos.",
    "criptoativo": "Criptoativos são moedas digitais como Bitcoin, Ethereum e outras criptomoedas.",
    "debenture": "Debêntures são títulos de dívida emitidos por empresas para captar recursos no mercado.",
    "fundo": "Fundos de investimento são veículos que reúnem recursos de vários investidores para aplicar em diferentes ativos.",
    "fii": "Fundos Imobiliários (FII's) investem em imóveis no Brasil e distribuem renda através de aluguéis e valorização.",
    "reit": "REITs são fundos imobiliários estrangeiros que investem em imóveis e distribuem renda ao investidor.",
    "stock": "Stocks são ações internacionais negociadas em bolsas estrangeiras.",
    "moeda": "Moedas estrangeiras como dólar, euro e outras moedas internacionais.",
    "personalizado": "Ativos personalizados permitem criar investimentos customizados com suas próprias regras.",
    "poupanca": "Poupança é uma aplicação de renda fixa com liquidez diária e rendimento baseado na poupança.",
    "previdencia": "Previdência privada e seguros para aposentadoria e proteção financeira.",
    "renda-fixa": "Renda fixa pré-fixada com taxa definida no momento da aplicação, ideal para objetivos com prazo e retorno conhecidos.",
    "renda-fixa-posfixada": "Renda fixa pós-fixada com rentabilidade atrelada a um indexador (CDI, IPCA), ideal para proteção contra inflação ou acompanhamento do mercado.",
    "renda-fixa-hibrida": "Renda fixa híbrida combina parte da rentabilidade prefixada com parte atrelada a um indexador (CDI, IPCA), oferecendo proteção e potencial de ganho.",
    "tesouro-direto": "Títulos públicos federais negociados diretamente com o Tesouro Nacional.",
  };
  
  return descriptions[tipoAtivo] || "Selecione um tipo de ativo para ver mais informações.";
}
