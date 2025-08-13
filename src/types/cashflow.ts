export interface CashflowValue {
  id: string;
  mes: number;
  valor: number;
  dataPagamento?: Date;
  status?: 'pago' | 'pendente' | 'recebido';
  observacoes?: string;
}

export interface CashflowItem {
  id: string;
  descricao: string;
  significado: string | null;
  rank: number | null;
  percentTotal: number | null;
  groupId: string;
  valores: CashflowValue[];
  categoria?: string;
  formaPagamento?: string;
  status?: 'pago' | 'pendente' | 'recebido';
  dataVencimento?: Date;
  observacoes?: string;
  isActive: boolean;
  isInvestment: boolean;
}

export interface CashflowGroup {
  id: string;
  name: string;
  type: string; // "Entradas" or "Despesas"
  order: number;
  items: CashflowItem[];
  parentId?: string;
  parent?: CashflowGroup;
  children: CashflowGroup[];
  percentTotal?: number;
  observacoes?: string;
  isActive: boolean;
}

export interface AlertState {
  type: "success" | "error";
  title: string;
  message: string;
}

export interface NewRowData {
  descricao: string;
  significado: string;
  percentTotal: number;
} 

// Campos adicionais que podem ser úteis para o modelo hierárquico
export interface CashflowItemExtended extends CashflowItem {
  // Campos opcionais que podem ser adicionados no futuro
  categoria?: string;           // Categoria do item (ex: "Investimentos", "Moradia")
  formaPagamento?: string;      // Forma de pagamento (ex: "PIX", "Cartão", "Dinheiro")
  status?: 'pago' | 'pendente' | 'recebido'; // Status do pagamento/recebimento
  dataVencimento?: Date;        // Data de vencimento
  observacoes?: string;         // Observações adicionais
}

// Campos que podem ser adicionados ao CashflowValue
export interface CashflowValueExtended extends CashflowValue {
  // Campos opcionais que podem ser adicionados no futuro
  dataPagamento?: Date;         // Data efetiva do pagamento
  status?: 'pago' | 'pendente' | 'recebido'; // Status específico do mês
  observacoes?: string;         // Observações do mês
} 