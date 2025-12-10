export interface CashflowValue {
  id: string;
  itemId: string;
  userId: string;
  year: number;
  month: number; // 0 = Jan, 11 = Dez
  value: number;
  color?: string | null; // Cor do texto (formato CSS: #000000, green, red, etc.)
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CashflowItem {
  id: string;
  userId: string | null; // null = template
  groupId: string;
  name: string; // era descricao
  significado: string | null;
  rank: string | null;
  values: CashflowValue[]; // era valores
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CashflowGroup {
  id: string;
  userId: string | null; // null = template
  name: string;
  type: string; // 'entrada', 'despesa' ou 'investimento'
  parentId: string | null;
  orderIndex: number; // era order
  items: CashflowItem[];
  children: CashflowGroup[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AlertState {
  type: "success" | "error";
  title: string;
  message: string;
}

export interface NewRowData {
  name: string; // era descricao
  significado: string;
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