"use client";
import React from "react";
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
  const handleTipoAtivoChange = (value: string) => {
    onFormDataChange({ tipoAtivo: value, ativo: "", assetId: "" });
    
    // Limpar erro quando usuário selecionar
    if (errors.tipoAtivo) {
      onErrorsChange({ tipoAtivo: undefined });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="tipoAtivo">Tipo de Ativo *</Label>
        <Select
          options={TIPOS_ATIVO}
          placeholder="Selecione o tipo de ativo que deseja adicionar"
          defaultValue={formData.tipoAtivo}
          onChange={handleTipoAtivoChange}
          className={errors.tipoAtivo ? 'border-red-500' : ''}
        />
        {errors.tipoAtivo && (
          <p className="mt-1 text-sm text-red-500">{errors.tipoAtivo}</p>
        )}
      </div>

      {/* Informações sobre o tipo selecionado */}
      {formData.tipoAtivo && (
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
    "fii": "Fundos Imobiliários e REITs investem em imóveis e distribuem renda através de aluguéis e valorização.",
    "moeda": "Moedas estrangeiras como dólar, euro e outras moedas internacionais.",
    "personalizado": "Ativos personalizados permitem criar investimentos customizados com suas próprias regras.",
    "poupanca": "Poupança é uma aplicação de renda fixa com liquidez diária e rendimento baseado na poupança.",
    "previdencia": "Previdência privada e seguros para aposentadoria e proteção financeira.",
    "renda-fixa-prefixada": "Renda fixa com taxa de juros fixa definida no momento da aplicação.",
    "renda-fixa-posfixada": "Renda fixa com taxa de juros variável baseada em índices como CDI, IPCA, etc.",
    "tesouro-direto": "Títulos públicos federais negociados diretamente com o Tesouro Nacional.",
  };
  
  return descriptions[tipoAtivo] || "Selecione um tipo de ativo para ver mais informações.";
}
