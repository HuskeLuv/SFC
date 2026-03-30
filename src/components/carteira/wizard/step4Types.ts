import { WizardFormData, WizardErrors } from '@/types/wizard';

export interface Step4FieldsProps {
  formData: WizardFormData;
  errors: WizardErrors;
  handleInputChange: (field: keyof WizardFormData, value: string | number | boolean) => void;
  handleDecimalInputChange: (
    field: keyof WizardFormData,
  ) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  getDecimalInputValue: (field: keyof WizardFormData) => string;
  parseDecimalValue: (rawValue: string) => number | null;
  decimalInputProps: {
    type: 'text';
    inputMode: 'decimal';
    pattern: string;
  };
  integerInputProps: {
    type: 'text';
    inputMode: 'numeric';
    pattern: string;
  };
  onFormDataChange: (data: Partial<WizardFormData>) => void;
}
