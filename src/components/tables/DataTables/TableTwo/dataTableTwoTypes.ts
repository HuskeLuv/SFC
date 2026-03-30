import { CashflowItem, CashflowGroup, NewRowData } from '@/types/cashflow';
import { ColorOption } from '@/components/cashflow/ColorPickerButton';

export interface GroupRenderContext {
  collapsed: Record<string, boolean>;
  addingRow: Record<string, boolean>;
  newRow: Record<string, NewRowData>;
  newItems: Record<string, CashflowItem>;
  savingGroups: Set<string>;
  processedData: {
    groups: CashflowGroup[];
    groupTotals: Record<string, number[]>;
    groupAnnualTotals: Record<string, number>;
    groupPercentages: Record<string, number>;
    itemTotals: Record<string, number[]>;
    itemAnnualTotals: Record<string, number>;
    itemPercentages: Record<string, number>;
    entradasByMonth: number[];
    entradasTotal: number;
    despesasByMonth: number[];
    despesasTotal: number;
    totalByMonth: number[];
  };
  toggleCollapse: (id: string) => void;
  startAddingRow: (id: string) => void;
  cancelAddingRow: (id: string) => void;
  updateNewRow: (id: string, field: keyof NewRowData, value: string | number) => void;
  handleSaveRow: (groupId: string) => void;
  handleItemUpdate: () => Promise<void>;
  startEditing: (itemId: string, field: string, monthIndex?: number) => void;
  stopEditing: () => void;
  isEditing: (itemId: string, field: string, monthIndex?: number) => boolean;
  isGroupEditing: (groupId: string) => boolean;
  handleStartGroupEdit: (group: CashflowGroup) => void;
  handleSaveGroup: (group: CashflowGroup) => void;
  handleCancelGroupEdit: (group: CashflowGroup) => void;
  selectedColor: ColorOption | null;
  setSelectedColor: (color: ColorOption | null) => void;
  isCommentModeActive: boolean;
  handleCommentButtonClick: () => void;
  handleCommentCellClick: (itemId: string, monthIndex: number) => Promise<void>;
  renderItemRowConditional: (
    item: CashflowItem,
    group: CashflowGroup,
    itemTotals: number[],
    itemAnnualTotal: number,
    itemPercentage: number,
    isLastItem?: boolean,
  ) => React.ReactNode;
}
