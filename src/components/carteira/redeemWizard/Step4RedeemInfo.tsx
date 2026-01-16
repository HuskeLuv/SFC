"use client";
import React from "react";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import DatePicker from "@/components/form/date-picker";
import { RedeemWizardErrors, RedeemWizardFormData } from "@/types/redeemWizard";

interface Step4RedeemInfoProps {
  formData: RedeemWizardFormData;
  errors: RedeemWizardErrors;
  onFormDataChange: (data: Partial<RedeemWizardFormData>) => void;
  onErrorsChange: (errors: Partial<RedeemWizardErrors>) => void;
}

export default function Step4RedeemInfo({
  formData,
  errors,
  onFormDataChange,
  onErrorsChange,
}: Step4RedeemInfoProps) {
  const metodoOptions =
    formData.availableQuantity > 1
      ? [{ value: "quantidade", label: "Por quantidade" }]
      : [
          { value: "quantidade", label: "Por quantidade" },
          { value: "valor", label: "Por valor" },
        ];

  const handleInputChange = (field: keyof RedeemWizardFormData, value: string | number) => {
    onFormDataChange({ [field]: value });
    if (errors[field as keyof RedeemWizardErrors]) {
      onErrorsChange({ [field]: undefined });
    }
  };

  const handleMetodoChange = (value: string) => {
    onFormDataChange({
      metodoResgate: value as RedeemWizardFormData["metodoResgate"],
      quantidade: 0,
      cotacaoUnitaria: 0,
      valorResgate: 0,
    });
    if (errors.metodoResgate) {
      onErrorsChange({ metodoResgate: undefined });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <DatePicker
          id="dataResgate"
          label="Data do Resgate *"
          placeholder="Selecione a data"
          defaultDate={formData.dataResgate}
          staticPosition={false}
          appendToBody
          onChange={(selectedDates) => {
            if (selectedDates && selectedDates.length > 0) {
              handleInputChange("dataResgate", selectedDates[0].toISOString().split("T")[0]);
            }
          }}
        />
        {errors.dataResgate && (
          <p className="mt-1 text-sm text-red-500">{errors.dataResgate}</p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
        <p>Quantidade disponível: {formData.availableQuantity || 0}</p>
        <p>Valor disponível: {formData.availableTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
      </div>

      <div>
        <Label htmlFor="metodoResgate">Método de Resgate *</Label>
        <Select
          options={metodoOptions}
          placeholder="Selecione o método"
          defaultValue={formData.metodoResgate}
          onChange={handleMetodoChange}
          className={errors.metodoResgate ? "border-red-500" : ""}
        />
        {errors.metodoResgate && (
          <p className="mt-1 text-sm text-red-500">{errors.metodoResgate}</p>
        )}
      </div>

      {formData.metodoResgate === "quantidade" ? (
        <>
          <div>
            <Label htmlFor="quantidade">Quantidade a resgatar *</Label>
            <Input
              id="quantidade"
              type="number"
              placeholder="Ex: 10"
              value={formData.quantidade}
              onChange={(e) => handleInputChange("quantidade", parseInt(e.target.value, 10) || 0)}
              error={!!errors.quantidade}
              hint={errors.quantidade}
              min="1"
              step="1"
            />
          </div>
          <div>
            <Label htmlFor="cotacaoUnitaria">Cotação unitária (R$) *</Label>
            <Input
              id="cotacaoUnitaria"
              type="number"
              placeholder="Ex: 32.50"
              value={formData.cotacaoUnitaria}
              onChange={(e) => handleInputChange("cotacaoUnitaria", parseFloat(e.target.value) || 0)}
              error={!!errors.cotacaoUnitaria}
              hint={errors.cotacaoUnitaria}
              min="0"
              step="0.01"
            />
          </div>
        </>
      ) : (
        <div>
          <Label htmlFor="valorResgate">Valor do resgate (R$) *</Label>
          <Input
            id="valorResgate"
            type="number"
            placeholder="Ex: 1000.00"
            value={formData.valorResgate}
            onChange={(e) => handleInputChange("valorResgate", parseFloat(e.target.value) || 0)}
            error={!!errors.valorResgate}
            hint={errors.valorResgate}
            min="0"
            step="0.01"
          />
        </div>
      )}
    </div>
  );
}
