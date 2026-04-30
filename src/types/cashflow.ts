export interface CashflowValue {
  id: string;
  itemId: string;
  userId: string;
  year: number;
  month: number; // 0 = Jan, 11 = Dez
  value: number;
  color?: string | null; // Cor do texto (formato CSS: #000000, green, red, etc.)
  comment?: string | null; // Comentário da célula
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
  templateId?: string | null;
  hidden?: boolean;
  isTemplate?: boolean;
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
  templateId?: string | null;
  hidden?: boolean;
  isTemplate?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AlertState {
  type: 'success' | 'error';
  title: string;
  message: string;
}

export interface NewRowData {
  name: string; // era descricao
  significado: string;
}
